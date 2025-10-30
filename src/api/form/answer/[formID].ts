import { FastifyInstance } from "fastify";
import "dotenv/config";
import { Component } from "../../../models/types.js";
import { pool } from '../../../lib/pg_pool';
import { getTestFormsSnapshot } from "../create";
import formSubmitRoutes from "../submit";

const isTestEnvironment = process.env.NODE_ENV === "test";

function sortComponents(components: Component[]): Component[] {
  return components
    .slice()
    .sort(
      (a, b) =>
        ((a.properties?.order as number | undefined) ?? 0) -
        ((b.properties?.order as number | undefined) ?? 0)
    );
}

async function answerFormRoutes(fastify: FastifyInstance) {
  // GET - load form + components for answering (used by front-end to render questions)
  fastify.get("/api/form/answer/:formID", async (req, reply) => {
    const { formID } = req.params as { formID: string };
    const parsedId = Number(formID);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return reply.status(400).send({ error: "Invalid form ID." });
    }

    if (isTestEnvironment) {
      const form = getTestFormsSnapshot().find(
        (storedForm) => storedForm.id === parsedId
      );

      if (!form) {
        return reply.status(404).send({ error: "Form not found." });
      }

      return reply.send({
        form: {
          ...form,
          components: sortComponents(form.components),
        },
      });
    }

    if (!pool) {
      return reply
        .status(500)
        .send({ error: "Database connection is not available." });
    }

    const client = await pool.connect();
    try {
      const formResult = await client.query<{
        id: number;
        title: string;
        user_id: string | null;
        created_at: Date;
      }>(
        `
        SELECT id, title, user_id, created_at
        FROM forms
        WHERE id = $1;
        `,
        [parsedId]
      );

      if (formResult.rowCount === 0) {
        return reply.status(404).send({ error: "Form not found." });
      }

      const formRow = formResult.rows[0];

      const componentsResult = await client.query<Component>(
        `
        SELECT id, form_id, type, name, properties
        FROM components
        WHERE form_id = $1
        ORDER BY COALESCE((properties->>'order')::int, 0), id;
        `,
        [parsedId]
      );

      return reply.send({
        form: {
          id: formRow.id,
          title: formRow.title,
          user_id: formRow.user_id,
          created_at: formRow.created_at.toISOString(),
          components: sortComponents(componentsResult.rows),
        },
      });
    } catch (error) {
      fastify.log.error({ err: error }, "Form fetch error");
      return reply.status(500).send({
        error: "Failed to fetch form.",
        details: error instanceof Error ? error.message : String(error),
      });
    } finally {
      client.release();
    }
  });

  // POST - register submission handler (implemented in submit.ts)
  await formSubmitRoutes(fastify);
}

export default answerFormRoutes;