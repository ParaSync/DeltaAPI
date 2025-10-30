import { FastifyInstance } from "fastify";
import "dotenv/config";
import { Component } from "../../../models/types.js";
import { pool } from '../../../lib/pg_pool';
import { getTestFormsSnapshot } from "../create";


const isTestEnvironment = process.env.NODE_ENV === "test";

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deriveDefaultValue(component: Component): unknown {
  const props = isRecord(component.properties) ? component.properties : {};

  switch (component.type) {
    case "text":
      return props.defaultValue ?? "";
    case "number":
      return props.defaultValue ?? null;
    case "select": {
      if (props.multiple) {
        if (Array.isArray(props.defaultValue)) {
          return props.defaultValue;
        }
        return [];
      }
      return props.defaultValue ?? null;
    }
    case "checkbox":
      return Array.isArray(props.defaultValue) ? props.defaultValue : [];
    case "radio":
      return props.defaultValue ?? null;
    case "datetime":
      return props.defaultValue ?? null;
    case "file":
      return null;
    case "button":
    default:
      return null;
  }
}

async function clearFormRoutes(fastify: FastifyInstance) {
  fastify.post("/clear/:formID", async (req, reply) => {
    const { formID } = req.params as { formID: string };
    const parsedId = Number(formID);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return reply.status(400).send({ error: "Invalid form ID." });
    }

    let components: Component[] = [];

    if (isTestEnvironment) {
      const form = getTestFormsSnapshot().find(
        (storedForm) => storedForm.id === parsedId
      );

      if (!form) {
        return reply.status(404).send({ error: "Form not found." });
      }

      components = form.components;
    } else {
      if (!pool) {
        return reply
          .status(500)
          .send({ error: "Database connection is not available." });
      }

      const client = await pool.connect();

      try {
        const formResult = await client.query(
          `SELECT id FROM forms WHERE id = $1;`,
          [parsedId]
        );

        if (formResult.rowCount === 0) {
          return reply.status(404).send({ error: "Form not found." });
        }

        const componentsResult = await client.query<Component>(
          `
            SELECT id, form_id, type, name, properties
            FROM components
            WHERE form_id = $1
            ORDER BY COALESCE((properties->>'order')::int, 0), id;
          `,
          [parsedId]
        );

        components = componentsResult.rows;
      } catch (error) {
        fastify.log.error(
          "Form clear fetch error: " +
            (error instanceof Error ? error.stack ?? error.message : String(error))
        );
        return reply.status(500).send({
          error: "Failed to load form components.",
          details: error instanceof Error ? error.message : String(error),
        });
      } finally {
        client.release();
      }
    }

    const clearedValues: Record<string, unknown> = {};

    for (const component of components) {
      const componentId =
        typeof component.id === "number" ? component.id : Number(component.id);

      if (!Number.isNaN(componentId)) {
        clearedValues[String(componentId)] = deriveDefaultValue(component);
      }
    }

    return reply.send({
      formId: parsedId,
      clearedValues,
    });
  });
}

export default clearFormRoutes;