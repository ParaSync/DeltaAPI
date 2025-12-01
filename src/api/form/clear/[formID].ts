import { FastifyInstance, FastifyReply } from 'fastify';
import 'dotenv/config';
import { pool } from '../../../lib/pg_pool.js';
import { ReplyPayload } from '../../../models/routes.js';
import { ComponentType } from '../../../models/components.js';

type ComponentForClear = {
  id: number;
  type: ComponentType;
  name?: string;
  properties: Record<string, unknown>;
};

// Allowed component types
const ALLOWED_TYPES: ComponentType[] = ['image', 'label', 'input', 'table'];

// Send a reply
const sendReply = (reply: FastifyReply, status: number, payload: ReplyPayload) =>
  reply.status(status).send(payload);

// Type guard for plain object
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

// Convert raw type to ComponentType
const toComponentType = (candidate: unknown): ComponentType =>
  typeof candidate === 'string' && ALLOWED_TYPES.includes(candidate as ComponentType)
    ? (candidate as ComponentType)
    : 'input';

// Typed raw component from DB
type RawComponent = {
  id?: unknown;
  type?: unknown;
  name?: unknown;
  properties?: unknown;
};

// Normalize raw component to ComponentForClear
const normaliseComponent = (raw: unknown): ComponentForClear | null => {
  if (!isRecord(raw)) return null;

  const typed = raw as RawComponent;

  const id = Number(typed.id);
  if (!Number.isFinite(id)) return null;

  return {
    id,
    type: toComponentType(typed.type),
    name: typeof typed.name === 'string' ? typed.name : undefined,
    properties: isRecord(typed.properties) ? typed.properties : {},
  };
};

// Derive default value for a component
const deriveDefaultValue = (component: ComponentForClear): unknown => {
  const props = component.properties;

  if (props.defaultValue !== undefined) return props.defaultValue;

  if (props.multiple === true) return [];

  return null;
};

// Build cleared values object
const buildClearedValues = (components: ComponentForClear[]): Record<string, unknown> => {
  const clearedValues: Record<string, unknown> = {};
  for (const component of components) {
    clearedValues[String(component.id)] = deriveDefaultValue(component);
  }
  return clearedValues;
};

// Main route function
async function clearFormRoutes(fastify: FastifyInstance) {
  fastify.post('/clear/:formID', async (req, reply) => {
    const { formID } = req.params as { formID: string };
    const parsedId = Number(formID);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return sendReply(reply, 400, { message: 'Invalid form ID.', value: null });
    }

    if (!pool) {
      return sendReply(reply, 500, { message: 'Database connection is not available.', value: null });
    }

    const client = await pool.connect();
    let transactionActive = false;

    try {
      await client.query('BEGIN');
      transactionActive = true;

      // Check if form exists
      const formResult = await client.query<{ id: number }>('SELECT id FROM forms WHERE id = $1;', [parsedId]);
      if (formResult.rowCount === 0) {
        await client.query('ROLLBACK');
        transactionActive = false;
        return sendReply(reply, 404, { message: 'Form not found.', value: null });
      }

      // Fetch components
      const componentsResult = await client.query<RawComponent>(
        `
        SELECT id, form_id, type, name, properties
        FROM components
        WHERE form_id = $1
        ORDER BY COALESCE((properties->>'order')::int, 0), id;
        `,
        [parsedId]
      );

      const components = componentsResult.rows
        .map(normaliseComponent)
        .filter((component): component is ComponentForClear => component !== null);

      const clearedValues = buildClearedValues(components);

      // Delete all answers for this form
      await client.query(
        `
        DELETE FROM answers
        WHERE submission_id IN (
          SELECT id FROM submissions WHERE form_id = $1
        );
        `,
        [parsedId]
      );

      // Delete submissions
      await client.query('DELETE FROM submissions WHERE form_id = $1;', [parsedId]);

      await client.query('COMMIT');
      transactionActive = false;

      return sendReply(reply, 200, {
        message: 'Form answers cleared successfully.',
        value: { formId: String(parsedId), clearedValues },
      });
    } catch (error) {
      if (transactionActive) await client.query('ROLLBACK');
      fastify.log.error(
        'Form clear error: ' + (error instanceof Error ? (error.stack ?? error.message) : String(error))
      );
      return sendReply(reply, 500, {
        message: 'Failed to clear form answers.',
        value: error instanceof Error ? error.message : String(error),
      });
    } finally {
      client.release();
    }
  });
}

export default clearFormRoutes;
