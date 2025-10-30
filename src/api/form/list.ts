import { FastifyInstance } from "fastify";
import "dotenv/config";
import { Component } from "../../models/types.js";
import { getTestFormsSnapshot } from './create';
import { pool } from '../../lib/pg_pool';


const isTestEnvironment = process.env.NODE_ENV === "test";


type FormRow = {
  id: number;
  title: string;
  user_id: string | null;
  created_at: string;
  components: Component[];
};

function sortComponents(components: Component[]): Component[] {
  return components
    .slice()
    .sort(
      (a, b) =>
        ((a.properties?.order as number | undefined) ?? 0) -
        ((b.properties?.order as number | undefined) ?? 0)
    );
}

async function listFormRoutes(fastify: FastifyInstance) {
  fastify.get("/api/form/list", async (_req, reply) => {
    if (isTestEnvironment) {
      const forms = getTestFormsSnapshot().map<FormRow>((form) => ({
        ...form,
        components: sortComponents(form.components),
      }));
      return reply.send({ forms });
    }

    if (!pool) {
      return reply
        .status(500)
        .send({ error: "Database connection is not available." });
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

      const forms = formsResult.rows.map<FormRow>((row) => ({
        id: row.id,
        title: row.title,
        user_id: row.user_id,
        created_at: row.created_at.toISOString(),
        components: [],
      }));

      const formIds = forms.map((form) => form.id);

      if (formIds.length > 0) {
        const componentsResult = await client.query<Component>(
          `
            SELECT id, form_id, type, name, properties
            FROM components
            WHERE form_id = ANY($1)
            ORDER BY
              COALESCE((properties->>'order')::int, 0),
              id;
          `,
          [formIds]
        );

        const formMap = new Map<number, FormRow>();
        forms.forEach((form) => formMap.set(form.id, form));

        for (const component of componentsResult.rows) {
          const targetForm = formMap.get(component.form_id);
          if (targetForm) {
            targetForm.components.push(component);
          }
        }
      }

      return reply.send({ forms });
    } catch (error) {
      fastify.log.error(
        `Form listing error: ${error instanceof Error ? error.stack ?? error.message : String(error)}`
      );
      return reply.status(500).send({
        error: "Failed to list forms.",
        details: error instanceof Error ? error.message : String(error),
      });
    } finally {
      client.release();
    }
  });
}

export default listFormRoutes;