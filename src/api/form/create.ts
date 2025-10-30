import { FastifyInstance } from "fastify";
import "dotenv/config";
import { Component, ComponentType } from "../../models/types.js";
import { pool } from '../../lib/pg_pool';


type ComponentInput = {
  type: ComponentType;
  name?: string;
  properties?: Record<string, any>;
  order?: number;
};

type CreateFormBody = {
  title: string;
  user_id?: string;
  components?: ComponentInput[];
};

const VALID_COMPONENT_TYPES: ComponentType[] = [
  "button",
  "checkbox",
  "radio",
  "text",
  "number",
  "select",
  "datetime",
  "file",
  "image"
];
const VALID_COMPONENT_TYPES_SET = new Set<ComponentType>(VALID_COMPONENT_TYPES);

const isTestEnvironment = process.env.NODE_ENV === "test";

type TestForm = {
  id: number;
  title: string;
  user_id: string | null;
  created_at: string;
  components: Component[];
};

const testFormsStore = new Map<number, TestForm>();
let testFormIdCounter = 1;
let testComponentIdCounter = 1;

function normaliseOrder(value: number | undefined, fallback: number) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function augmentProperties(
  properties: Record<string, any> | undefined,
  order: number
) {
  return {
    ...(properties ?? {}),
    order,
  };
}

async function createFormRoutes(fastify: FastifyInstance) {
 
  fastify.post("/api/form/create", async (req, reply) => {
    const body = req.body as CreateFormBody;

    if (!body || typeof body.title !== "string" || body.title.trim() === "") {
      return reply
        .status(400)
        .send({ error: "Form title is required", field: "title" });
    }

    const components = Array.isArray(body.components) ? body.components : [];

    for (const component of components) {
      if (!component?.type || !VALID_COMPONENT_TYPES_SET.has(component.type)) {
        return reply.status(400).send({
          error: "Invalid component type supplied",
          validTypes: VALID_COMPONENT_TYPES,
        });
      }
    }

   
    if (isTestEnvironment) {
      const formId = testFormIdCounter++;
      const createdAt = new Date().toISOString();

      const storedComponents = components.map((component, idx) => {
        const order = normaliseOrder(component.order, idx);
        const storedComponent: Component = {
          id: testComponentIdCounter++,
          form_id: formId,
          type: component.type,
          name: component.name,
          properties: augmentProperties(component.properties, order),
        };
        return storedComponent;
      });

      storedComponents.sort(
        (a, b) => (a.properties?.order ?? 0) - (b.properties?.order ?? 0)
      );

      const storedForm: TestForm = {
        id: formId,
        title: body.title,
        user_id: body.user_id ?? null,
        created_at: createdAt,
        components: storedComponents,
      };

      testFormsStore.set(formId, storedForm);

      return reply.status(201).send(storedForm);
    }

   
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      const formResult = await client.query(
        `INSERT INTO forms (title, user_id, created_at)
         VALUES ($1, $2, NOW())
         RETURNING id, title, user_id, created_at;`,
        [body.title, body.user_id ?? null]
      );

      const formRow = formResult.rows[0];
      const createdComponents: Component[] = [];

      for (const [idx, component] of components.entries()) {
        const order = normaliseOrder(component.order, idx);
        const properties = augmentProperties(component.properties, order);

        const componentResult = await client.query(
          `INSERT INTO components (form_id, type, name, properties)
           VALUES ($1, $2, $3, $4)
           RETURNING id, form_id, type, name, properties;`,
          [formRow.id, component.type, component.name ?? null, properties]
        );

        createdComponents.push(componentResult.rows[0] as Component);
      }

      await client.query("COMMIT");

      createdComponents.sort(
        (a, b) => (a.properties?.order ?? 0) - (b.properties?.order ?? 0)
      );

      return reply.status(201).send({
        ...formRow,
        components: createdComponents,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      fastify.log.error({ err: error }, "Form creation error");
      return reply.status(500).send({
        error: "Failed to create form",
        details: error instanceof Error ? error.message : String(error),
      });
    } finally {
      client.release();
    }
  });
}

export function getTestFormsSnapshot(): TestForm[] {
  return Array.from(testFormsStore.values());
}

export default createFormRoutes;
