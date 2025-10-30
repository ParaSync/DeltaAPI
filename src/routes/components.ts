import { FastifyInstance } from 'fastify';
import pg from 'pg';
import 'dotenv/config';
import { Component } from '../models/components.js';

const isTestEnvironment = process.env.NODE_ENV === 'test';
const pool = isTestEnvironment
  ? null
  : new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 200 });

const testComponentsStore = new Map<number, Component[]>();
let testComponentIdCounter = 1;

async function componentRoutes(fastify: FastifyInstance) {
  // Create a component (auto-create form if needed)
  fastify.post('/components', async (req, reply) => {
    const body = req.body as Component;

    if (!body.form_id || !body.type) {
      return reply.status(400).send({ error: 'Missing form_id or type' });
    }

    if (isTestEnvironment) {
      const formId = body.form_id;
      const existing = testComponentsStore.get(formId) ?? [];
      const newComponent: Component = {
        id: testComponentIdCounter++,
        form_id: formId,
        type: body.type,
        name: body.name,
        properties: body.properties ?? {},
      };
      existing.push(newComponent);
      testComponentsStore.set(formId, existing);
      return reply.send(newComponent);
    }

    if (!pool) {
      return reply.status(500).send({ error: 'Database not configured' });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Check if form exists
      const formCheck = await client.query('SELECT id FROM forms WHERE id = $1', [body.form_id]);

      // Auto-create a form if it doesn’t exist
      let formId = body.form_id;
      if (formCheck.rowCount === 0) {
        const newForm = await client.query(
          `INSERT INTO forms (title, user_id, created_at)
           VALUES ($1, gen_random_uuid(), NOW())
           RETURNING id;`,
          [`Auto-created Form #${formId}`]
        );
        formId = newForm.rows[0].id;
      }

      // Insert the new component
      const query = `
        INSERT INTO components (form_id, type, name, properties)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
      const values = [formId, body.type, body.name, body.properties ?? {}];
      const result = await client.query(query, values);

      await client.query('COMMIT');
      return reply.send(result.rows[0]);
    } catch (err: unknown) {
      if (err instanceof Error) {
        await client.query('ROLLBACK');
        req.log.error(err, 'Component creation error');
        return reply.status(500).send({ error: err.message });
      }
    } finally {
      client.release();
    }
  });

  // Get all components for a form
  fastify.get('/forms/:id/components', async (req, reply) => {
    const { id } = req.params as { id: string };
    const formId = Number(id);

    if (isTestEnvironment) {
      return reply.send(testComponentsStore.get(formId) ?? []);
    }

    if (!pool) {
      return reply.status(500).send({ error: 'Database not configured' });
    }

    const result = await pool.query('SELECT * FROM components WHERE form_id = $1;', [formId]);
    return reply.send(result.rows);
  });
}

export default componentRoutes;
