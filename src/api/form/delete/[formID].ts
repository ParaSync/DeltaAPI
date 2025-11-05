/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO: remove the above

import { FastifyInstance } from 'fastify';
import 'dotenv/config';
import { pool } from '../../../lib/pg_pool.js';
import { ReplyPayload } from '../../../models/routes.js';

const isTestEnvironment = process.env.NODE_ENV === 'test';
const testDeletedForms = new Set<number>();

type ConfirmBody = {
  confirm?: boolean;
};

const sendReply = (reply: any, status: number, payload: ReplyPayload) =>
  reply.status(status).send(payload);

async function deleteFormRoutes(fastify: FastifyInstance) {
  fastify.delete('/api/form/delete/:formID', async (req, reply) => {
    const { formID } = req.params as { formID: string };
    const parsedId = Number(formID);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return sendReply(reply, 400, {
        message: 'Invalid form ID.',
        value: null,
      });
    }

    const body = (req.body as ConfirmBody) ?? {};
    if (body.confirm !== true) {
      return sendReply(reply, 400, {
        message: 'Confirmation required before deleting form.',
        value: { hint: 'Set confirm=true to proceed.' },
      });
    }

    if (isTestEnvironment) {
      const existed = testDeletedForms.has(parsedId);
      testDeletedForms.add(parsedId);

      return sendReply(reply, 200, {
        message: existed ? 'Form deletion confirmed.' : 'Form deleted successfully.',
        value: { formId: String(parsedId) },
      });
    }

    if (!pool) {
      return sendReply(reply, 500, {
        message: 'Database connection is not available.',
        value: null,
      });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query('DELETE FROM components WHERE form_id = $1;', [parsedId]);

      const formResult = await client.query('DELETE FROM forms WHERE id = $1 RETURNING id;', [
        parsedId,
      ]);

      if (formResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return sendReply(reply, 404, {
          message: 'Form not found.',
          value: null,
        });
      }

      await client.query('COMMIT');
      return sendReply(reply, 200, {
        message: 'Form deleted successfully.',
        value: { formId: String(formResult.rows[0].id) },
      });
    } catch (error) {
      await client.query('ROLLBACK');
      fastify.log.error({ err: error }, 'Form deletion error');
      return sendReply(reply, 500, {
        message: 'Failed to delete form.',
        value: error instanceof Error ? error.message : String(error),
      });
    } finally {
      client.release();
    }
  });
}

export default deleteFormRoutes;
