import { FastifyInstance, FastifyReply } from 'fastify';
import 'dotenv/config';
import { Form } from '../../models/forms.js';
import { ReplyPayload } from '../../models/routes.js';
import { ComponentType } from '../../models/components.js';
import { pool } from '../../lib/pg_pool.js';

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

const ALLOWED_TYPES: ComponentType[] = ['image', 'label', 'input', 'table'];

/**
 * Send a Fastify reply with the correct payload type.
 */
const sendReply = (reply: FastifyReply, status: number, payload: ReplyPayload) =>
  reply.status(status).send(payload);

/**
 * Convert unknown value to a valid ComponentType.
 */
const toComponentType = (candidate: unknown): ComponentType =>
  typeof candidate === 'string' && ALLOWED_TYPES.includes(candidate as ComponentType)
    ? (candidate as ComponentType)
    : 'input';

/**
 * Type guard to check if a value is a plain object.
 */
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Sort components by order.
 */
const sortComponents = (components: ListedComponent[]): ListedComponent[] =>
  components.slice().sort((a, b) => a.order - b.order);

/**
 * Convert a value to a numeric order.
 */
const toComponentOrder = (raw: unknown): number => {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

/**
 * Normalize a component record from the database.
 */
const normaliseComponent = (component: unknown): ListedComponent => {
  if (!isPlainObject(component)) {
    throw new Error('Invalid component object');
  }

  const properties = isPlainObject(component.properties) ? component.properties : {};
  const orderSource = component.order ?? properties.order ?? properties.orderBy ?? properties.index;

  return {
    id: String(component.id),
    formId: String(component.form_id ?? component.formId ?? ''),
    type: toComponentType(component.type),
    name: typeof component.name === 'string' ? component.name : '',
    order: toComponentOrder(orderSource),
    properties,
  };
};

/**
 * Normalize a form record from the database.
 */
// const normaliseForm = (form: unknown): ListedForm => {
//   if (!isPlainObject(form)) {
//     throw new Error('Invalid form object');
//   }

//   const createdRaw = form.createdAt ?? form.created_at ?? Date.now();
//   let createdDate: Date;

//   if (typeof createdRaw === 'string' || typeof createdRaw === 'number' || createdRaw instanceof Date) {
//     createdDate = new Date(createdRaw);
//   } else {
//     createdDate = new Date(); // fallback if value is not string/number/Date
//   }

//   return {
//     id: String(form.id),
//     title: typeof form.title === 'string' ? form.title : '',
//     userId:
//       typeof form.userId === 'string'
//         ? form.userId
//         : typeof form.user_id === 'string'
//         ? form.user_id
//         : '',
//     createdAt: createdDate.toISOString(),
//     components: sortComponents(
//       Array.isArray(form.components) ? form.components.map(normaliseComponent) : []
//     ),
//   };
// };

/**
 * Register route for listing forms.
 */
async function listFormRoutes(fastify: FastifyInstance) {
  fastify.get('/api/form/list', async (_req, reply) => {
    if (!pool) {
      return sendReply(reply, 500, {
        message: 'Database connection is not available.',
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
        userId: row.user_id ?? '',
        createdAt: row.created_at.toISOString(),
        components: [],
      }));

      const idLookup = new Map<number, ListedForm>();
      formsResult.rows.forEach((row, index) => {
        idLookup.set(row.id, forms[index]);
      });

      const formIds = formsResult.rows.map((row) => row.id);

      if (formIds.length > 0) {
        const componentsResult = await client.query<{
          id: number;
          form_id: number;
          type: string;
          name: string;
          properties: Record<string, unknown>;
        }>(
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
        message: 'Forms retrieved successfully.',
        value: { forms },
      });
    } catch (error) {
      fastify.log.error(
        `Form listing error: ${
          error instanceof Error ? (error.stack ?? error.message) : String(error)
        }`
      );
      return sendReply(reply, 500, {
        message: 'Failed to list forms.',
        value: error instanceof Error ? error.message : String(error),
      });
    } finally {
      client.release();
    }
  });

  fastify.get('/api/form/list/all/:userId', async (req, reply) => {
    const { userId } = req.params as { userId: string };

    try {
      const result = await pool.query(
        `SELECT id, title, user_id, created_at, status
        FROM forms
        WHERE user_id = $1
        ORDER BY created_at DESC`,
        [userId]
      );

      return reply.send({
        message: 'Forms retrieved successfully.',
        value: result.rows,
      });
    } catch (err) {
      return reply.status(500).send({
        message: 'Failed to load forms.',
        value: err instanceof Error ? err.message : String(err),
      });
    }
  });

  fastify.get('/api/form/list/published/:userId', async (req, reply) => {
    const { userId } = req.params as { userId: string };

    try {
      const result = await pool.query(
        `SELECT 
          f.id,
          f.title,
          f.user_id,
          f.created_at,
          f.status,
          COUNT(s.id) AS responses
        FROM forms f
        LEFT JOIN submissions s ON s.form_id = f.id
        WHERE f.status = 'published'
          AND f.user_id = $1
        GROUP BY f.id
        ORDER BY f.created_at DESC;`,
        [userId]
      );

      return reply.send({
        message: 'Forms retrieved successfully.',
        value: result.rows,
      });
    } catch (err) {
      return reply.status(500).send({
        message: 'Failed to load forms.',
        value: err instanceof Error ? err.message : String(err),
      });
    }
  });

  fastify.get('/api/form/fetch/:formId', async (req, reply) => {
    const { formId } = req.params as { formId: string };

    try {
      const result = await pool.query(
        `SELECT c.type, c.properties
        FROM forms f
        LEFT JOIN components c ON c.form_id = f.id
        WHERE f.id = $1 
        ORDER BY (c.properties->>'order')::int`,
        [formId]
      );

      return reply.send({
        message: `Form ${formId} retrieved successfully.`,
        value: result.rows,
      });
    } catch (err) {
      return reply.status(500).send({
        message: `Failed to load form ${formId}.`,
        value: err instanceof Error ? err.message : String(err),
      });
    }
  });

  fastify.get('/api/form/answered/:userId', async (req, reply) => {
    const { userId } = req.params as { userId: string };

    try {
      const result = await pool.query(
        `SELECT COUNT(*) AS total_answered
        FROM submissions
        WHERE user_id = $1`,
        [userId]
      );

      return reply.send({
        message: `Answered forms by ${userId} retrieved successfully.`,
        value: result.rows[0].total_answered,
      });
    } catch (err) {
      return reply.status(500).send({
        message: `Failed to load form ${userId}.`,
        value: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

export default listFormRoutes;
