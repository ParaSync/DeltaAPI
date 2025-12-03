import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import 'dotenv/config';
import { pool } from '../../../lib/pg_pool.js';
import { ComponentProperties } from '../../../models/components.js';
import { ReplyPayload, BodyType } from '../../../models/routes.js';
import { Form } from '../../../models/forms.js';

async function getForm(formId: string): Promise<Form> {
  const queryText = `
        SELECT * FROM forms WHERE id = $1
    `;
  const values = [formId];
  const result = await pool.query(queryText, values);
  return result.rows[0];
}

async function getFormComponents(formId: string): Promise<Array<ComponentProperties>> {
  const queryText = `
        SELECT * FROM components WHERE form_id = $1
    `;
  const values = [formId];
  const result = await pool.query(queryText, values);
  return result.rows;
}

async function editFormRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/api/form/edit/:formId',
    async (request: FastifyRequest<{ Body: BodyType }>, reply: FastifyReply) => {
      let replyPayload: ReplyPayload = { message: '', value: '' };

      const { formId } = request.params as { formId: string };

      try {
        const form = await getForm(formId);
        const components = await getFormComponents(formId);
        replyPayload = {
          message: 'Form retrieved successfully',
          value: { form, components },
        };
        return reply.status(200).send(replyPayload);
      } catch (error: unknown) {
        replyPayload.message = 'An error occurred';
        replyPayload.value = error;
        return reply.status(500).send(replyPayload);
      }
    }
  );

  fastify.post(
    '/api/form/edit/rename/:formId',
    async (request: FastifyRequest<{ Body: BodyType }>, reply: FastifyReply) => {
      const replyPayload: ReplyPayload = { message: '', value: '' };

      const { formId } = request.params as { formId: string };
      const { title } = request.body;

      const queryText = `UPDATE forms SET title = $1 WHERE id = $2`;
      const values = [title, formId];

      try {
        const result = await pool.query(queryText, values);
        replyPayload.message = 'Form renamed successfully';
        replyPayload.value = result;
        return reply.status(200).send(replyPayload);
      } catch (error: unknown) {
        replyPayload.message = 'An error occurred';
        replyPayload.value = error;
        return reply.status(500).send(replyPayload);
      }
    }
  );

  fastify.get(
    '/api/form/edit/publish/:formId',
    async (request: FastifyRequest<{ Body: BodyType }>, reply: FastifyReply) => {
      const replyPayload: ReplyPayload = { message: '', value: '' };

      const { formId } = request.params as { formId: string };

      const queryText = `UPDATE forms SET status = 'published' WHERE id = $1`;
      const values = [formId];

      try {
        const result = await pool.query(queryText, values);
        replyPayload.message = 'Form published successfully';
        replyPayload.value = result;
        return reply.status(200).send(replyPayload);
      } catch (error: unknown) {
        replyPayload.message = 'An error occurred';
        replyPayload.value = error;
        return reply.status(500).send(replyPayload);
      }
    }
  );
}

export default editFormRoutes;
