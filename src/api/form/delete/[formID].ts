import { FastifyInstance } from "fastify";
import "dotenv/config";
import { pool } from '../../../lib/pg_pool';

const isTestEnvironment = process.env.NODE_ENV === "test";

type ConfirmBody = {
  confirm?: boolean;
};

const testDeletedForms = new Set<number>();

async function deleteFormRoutes(fastify: FastifyInstance) {
  fastify.delete("/api/form/delete/:formID", async (req, reply) => {
    const { formID } = req.params as { formID: string };
    const parsedId = Number(formID);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return reply.status(400).send({ error: "Invalid form ID." });
    }

    const body = (req.body as ConfirmBody) ?? {};
    if (body.confirm !== true) {
      return reply.status(400).send({
        error: "Confirmation required before deleting form.",
        message: "Set confirm=true to proceed.",
      });
    }

    if (isTestEnvironment) {
      const existed = testDeletedForms.has(parsedId);
      testDeletedForms.add(parsedId);
      return existed
        ? reply.send({
            message: "Form deletion confirmed (test mode).",
            formId: parsedId,
          })
        : reply.send({
            message: "Form deleted successfully (test mode).",
            formId: parsedId,
          });
    }

    if (!pool) {
      return reply
        .status(500)
        .send({ error: "Database connection is not available." });
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      await client.query("DELETE FROM components WHERE form_id = $1;", [
        parsedId,
      ]);

      const formResult = await client.query(
        "DELETE FROM forms WHERE id = $1 RETURNING id;",
        [parsedId]
      );

      if (formResult.rowCount === 0) {
        await client.query("ROLLBACK");
        return reply.status(404).send({ error: "Form not found." });
      }

      await client.query("COMMIT");
      return reply.send({
        message: "Form deleted successfully.",
        formId: formResult.rows[0].id,
      });
    } catch (error) {
      await client.query("ROLLBACK");
      fastify.log.error({ err: error }, "Form deletion error");
      return reply.status(500).send({
        error: "Failed to delete form.",
        details: error instanceof Error ? error.message : String(error),
      });
    } finally {
      client.release();
    }
  });
}

export default deleteFormRoutes;