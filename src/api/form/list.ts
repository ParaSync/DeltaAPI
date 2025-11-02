import { FastifyInstance } from "fastify";
import "dotenv/config";
import { Form } from "../../models/forms.js";
import { ReplyPayload } from "../../models/routes.js";
import { ComponentType } from "../../models/components.js";
import { getTestFormsSnapshot } from "./create";
import { pool } from "../../lib/pg_pool.js";

const isTestEnvironment = process.env.NODE_ENV === "test";

type ListedComponent = {
  id: string;
  formId: string;
  type: ComponentType;
  name: string;
  order: number;
  properties: Record<string, unknown>;
};

type ListedForm = Form & {
  components: ListedComponent[];
};

const ALLOWED_TYPES: ComponentType[] = ["image", "label", "input", "table"];

const sendReply = (reply: any, status: number, payload: ReplyPayload) =>
  reply.status(status).send(payload);

const toComponentType = (candidate: unknown): ComponentType =>
  typeof candidate === "string" && ALLOWED_TYPES.includes(candidate as ComponentType)
    ? (candidate as ComponentType)
    : "input";

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const sortComponents = (components: ListedComponent[]): ListedComponent[] =>
  components.slice().sort((a, b) => a.order - b.order);

const toComponentOrder = (raw: unknown): number => {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const normaliseComponent = (component: any): ListedComponent => {
  const properties = isPlainObject(component?.properties) ? component.properties : {};
  const orderSource =
    component?.order ?? properties.order ?? properties.orderBy ?? properties.index;

  return {
    id: String(component.id),
    formId: String(component.form_id ?? component.formId ?? ""),
    type: toComponentType(component.type),
    name: typeof component.name === "string" ? component.name : "",
    order: toComponentOrder(orderSource),
    properties,
  };
};

const normaliseForm = (form: any): ListedForm => ({
  id: String(form.id),
  title: typeof form.title === "string" ? form.title : "",
  userId:
    typeof form.userId === "string"
      ? form.userId
      : typeof form.user_id === "string"
      ? form.user_id
      : "",
  createdAt: new Date(form.createdAt ?? form.created_at ?? Date.now()).toISOString(),
  components: sortComponents(
    Array.isArray(form.components)
      ? form.components.map(normaliseComponent)
      : []
  ),
});

async function listFormRoutes(fastify: FastifyInstance) {
  fastify.get("/api/form/list", async (_req, reply) => {
    if (isTestEnvironment) {
      const forms = getTestFormsSnapshot().map(normaliseForm);
      return sendReply(reply, 200, {
        message: "Forms retrieved successfully (test mode).",
        value: { forms },
      });
    }

    if (!pool) {
      return sendReply(reply, 500, {
        message: "Database connection is not available.",
        value: null,
      });
    }

    const client = await pool.connect();

    try {
      const formsResult = await client.query<{
        id: number;
        title: string;
        user_id: string | null;
        created_at: Date;
      }>(`
        SELECT id, title, user_id, created_at
        FROM forms
        ORDER BY created_at DESC;
      `);

      const forms: ListedForm[] = formsResult.rows.map((row) => ({
        id: String(row.id),
        title: row.title,
        userId: row.user_id ?? "",
        createdAt: row.created_at.toISOString(),
        components: [],
      }));

      const idLookup = new Map<number, ListedForm>();
      formsResult.rows.forEach((row, index) => {
        idLookup.set(row.id, forms[index]);
      });

      const formIds = formsResult.rows.map((row) => row.id);

      if (formIds.length > 0) {
        const componentsResult = await client.query(
          `
            SELECT id, form_id, type, name, properties
            FROM components
            WHERE form_id = ANY($1)
            ORDER BY COALESCE((properties->>'order')::int, 0), id;
          `,
          [formIds]
        );

        for (const componentRow of componentsResult.rows) {
          const targetForm = idLookup.get(componentRow.form_id);
          if (targetForm) {
            targetForm.components.push(normaliseComponent(componentRow));
          }
        }

        forms.forEach((form) => {
          form.components = sortComponents(form.components);
        });
      }

      return sendReply(reply, 200, {
        message: "Forms retrieved successfully.",
        value: { forms },
      });
    } catch (error) {
      fastify.log.error(
        `Form listing error: ${
          error instanceof Error ? error.stack ?? error.message : String(error)
        }`
      );
      return sendReply(reply, 500, {
        message: "Failed to list forms.",
        value: error instanceof Error ? error.message : String(error),
      });
    } finally {
      client.release();
    }
  });
}

export default listFormRoutes;