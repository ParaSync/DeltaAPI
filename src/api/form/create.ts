import { FastifyInstance } from "fastify";
import "dotenv/config";
import { pool } from "../../lib/pg_pool.js";
import { ReplyPayload } from "../../models/routes.js";
import { Form } from "../../models/forms.js";
import { ComponentType } from "../../models/components.js";

const isTestEnvironment = process.env.NODE_ENV === "test";

type CreateFormBody = {
  title?: unknown;
  userId?: unknown;
  components?: unknown;
};

type CreateComponentInput = {
  name?: unknown;
  type?: unknown;
  order?: unknown;
  formOrder?: unknown;
  properties?: unknown;
  settings?: unknown;
};

type NormalisedComponent = {
  name: string;
  type: ComponentType;
  order: number;
  properties: Record<string, unknown>;
};

type StoredComponent = NormalisedComponent & {
  id: string;
  formId: string;
};

type StoredForm = Form & {
  components: StoredComponent[];
};

const testFormsStore = new Map<string, StoredForm>();
let testFormIdCounter = 1;
let testComponentIdCounter = 1;

const ALLOWED_COMPONENT_TYPES: ComponentType[] = ["image", "label", "input", "table"];
const DEFAULT_COMPONENT_TYPE: ComponentType = "input";

const sendReply = (reply: any, status: number, payload: ReplyPayload) =>
  reply.status(status).send(payload);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const toComponentType = (value: unknown): ComponentType => {
  if (typeof value === "string" && ALLOWED_COMPONENT_TYPES.includes(value as ComponentType)) {
    return value as ComponentType;
  }

  return DEFAULT_COMPONENT_TYPE;
};

const toComponentOrder = (candidate: unknown, fallback: number): number => {
  if (typeof candidate === "number" && Number.isFinite(candidate)) {
    return candidate;
  }

  if (typeof candidate === "string" && candidate.trim() !== "") {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
};

const normaliseComponentInput = (
  component: unknown,
  index: number
): NormalisedComponent | null => {
  if (!isPlainObject(component)) {
    return null;
  }

  const {
    name,
    type,
    order,
    formOrder,
    properties: rawProperties,
    settings: rawSettings,
  } = component as CreateComponentInput;

  const resolvedName = typeof name === "string" ? name : "";
  const resolvedType = toComponentType(type);
  const resolvedOrder = toComponentOrder(order ?? formOrder, index);

  const baseProperties = isPlainObject(rawProperties) ? rawProperties : {};
  const settingsProperties = isPlainObject(rawSettings) ? rawSettings : {};
  // preserve original input-kind for model-backed "input" components so submit-side
  // validation can detect 'text'|'number'|'checkbox' etc via properties.inputType
  const mergedProperties: Record<string, unknown> = {
    ...baseProperties,
    ...settingsProperties,
  };

  if (typeof type === "string" && !ALLOWED_COMPONENT_TYPES.includes(type as ComponentType)) {
    mergedProperties.inputType = type;
  }

  return {
    name: resolvedName,
    type: resolvedType,
    order: resolvedOrder,
    properties: mergedProperties,
  };
};

const buildFormResponse = (
  formRow: { id: number; title: string; user_id: string | null; created_at: Date },
  components: StoredComponent[]
): StoredForm => ({
  id: String(formRow.id),
  title: formRow.title,
  userId: formRow.user_id ?? "",
  createdAt: formRow.created_at.toISOString(),
  components,
});

const buildComponentResponse = (row: any): StoredComponent => {
  const properties = isPlainObject(row?.properties) ? row.properties : {};
  const derivedOrder =
    typeof properties.order === "number"
      ? properties.order
      : toComponentOrder(row?.order, 0);

  const resolvedType = toComponentType(row?.type);

  return {
    id: String(row?.id ?? ""),
    formId: String(row?.form_id ?? ""),
    name: typeof row?.name === "string" ? row.name : "",
    type: resolvedType,
    order: derivedOrder,
    properties,
  };
};

async function createFormRoutes(fastify: FastifyInstance) {
  fastify.post("/api/form/create", async (req, reply) => {
    const body = req.body as CreateFormBody;
    const title = typeof body?.title === "string" ? body.title.trim() : "";

    if (!title) {
      return sendReply(reply, 400, {
        message: "Form title is required.",
        value: { field: "title" },
      });
    }

    const userId = typeof body?.userId === "string" ? body.userId : "";

    const rawComponents = Array.isArray(body?.components) ? body.components : [];
    const normalisedComponents = rawComponents
      .map((component, index) => normaliseComponentInput(component, index))
      .filter((component): component is NormalisedComponent => component !== null)
      .sort((a, b) => a.order - b.order);

    if (isTestEnvironment) {
      const formId = String(testFormIdCounter++);
      const createdAt = new Date();

      const storedComponents: StoredComponent[] = normalisedComponents.map(
        (component) => ({
          ...component,
          id: String(testComponentIdCounter++),
          formId,
        })
      );

      const storedForm: StoredForm = {
        id: formId,
        title,
        userId,
        createdAt: createdAt.toISOString(),
        components: storedComponents,
      };

      testFormsStore.set(formId, storedForm);

      return sendReply(reply, 201, {
        message: "Form created successfully (test mode).",
        value: storedForm,
      });
    }

    if (!pool) {
      return sendReply(reply, 500, {
        message: "Database connection is not configured.",
        value: null,
      });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const formResult = await client.query<{
        id: number;
        title: string;
        user_id: string | null;
        created_at: Date;
      }>(
        `
          INSERT INTO forms (title, user_id, created_at)
          VALUES ($1, $2, NOW())
          RETURNING id, title, user_id, created_at;
        `,
        [title, userId || null]
      );

      const formRow = formResult.rows[0];
      const createdComponents: StoredComponent[] = [];

      for (const component of normalisedComponents) {
        const componentResult = await client.query(
          `
            INSERT INTO components (form_id, properties, name, type)
            VALUES ($1, $2, $3, $4)
            RETURNING id, form_id, name, type, properties;
          `,
          [
            formRow.id,
            { ...component.properties, order: component.order },
            component.name || null,
            component.type,
          ]
        );

        createdComponents.push(buildComponentResponse(componentResult.rows[0]));
      }

      await client.query("COMMIT");

      return sendReply(reply, 201, {
        message: "Form created successfully.",
        value: buildFormResponse(formRow, createdComponents),
      });
    } catch (error) {
      await client.query("ROLLBACK");
      fastify.log.error({ err: error }, "Form creation error");
      return sendReply(reply, 500, {
        message: "Failed to create form.",
        value: error instanceof Error ? error.message : String(error),
      });
    } finally {
      client.release();
    }
  });
}

export function getTestFormsSnapshot(): StoredForm[] {
  return Array.from(testFormsStore.values());
}

export default createFormRoutes;