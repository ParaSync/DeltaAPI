import { FastifyInstance, FastifyReply } from 'fastify';
import 'dotenv/config';
import { pool } from '../../../lib/pg_pool.js';
import { ReplyPayload } from '../../../models/routes.js';
import { ComponentType } from '../../../models/components.js';

type InputComponentBody = {
  formId?: unknown;
  type?: unknown;
  name?: unknown;
  properties?: unknown;
};

type StoredInputComponent = {
  id: string;
  formId: string;
  type: ComponentType;
  name: string;
  properties: Record<string, unknown>;
};

type ValidationResult =
  | {
      ok: true;
      value: {
        formId: number;
        type: ComponentType;
        name: string;
        properties: Record<string, unknown>;
      };
    }
  | {
      ok: false;
      httpStatus: number;
      payload: ReplyPayload;
    };

const ALLOWED_TYPES: ComponentType[] = ['image', 'label', 'input', 'table', 'heading'];
const DEFAULT_TYPE: ComponentType = 'input';

const sendReply = (reply: FastifyReply, status: number, payload: ReplyPayload) =>
  reply.status(status).send(payload);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const toComponentType = (candidate: unknown): ComponentType =>
  typeof candidate === 'string' && ALLOWED_TYPES.includes(candidate as ComponentType)
    ? (candidate as ComponentType)
    : DEFAULT_TYPE;

const normaliseComponentRow = (row: unknown): StoredInputComponent => {
  if (!isPlainObject(row)) throw new Error('Invalid component row');

  return {
    id: String(row?.id ?? ''),
    formId: String(row?.form_id ?? row?.formId ?? ''),
    type: toComponentType(row?.type),
    name: typeof row?.name === 'string' ? row.name : '',
    properties: isPlainObject(row?.properties) ? row.properties : {},
  };
};

const validateBody = (body: InputComponentBody): ValidationResult => {
  if (!isPlainObject(body)) {
    return {
      ok: false,
      httpStatus: 400,
      payload: { message: 'Request body must be a JSON object.', value: null },
    };
  }

  const formIdNumber = Number(body.formId);
  if (!Number.isInteger(formIdNumber) || formIdNumber <= 0) {
    return {
      ok: false,
      httpStatus: 400,
      payload: { message: 'A valid numeric formId is required.', value: null },
    };
  }

  const resolvedType = toComponentType(body.type);
  if (body.type !== undefined && resolvedType !== body.type) {
    return {
      ok: false,
      httpStatus: 400,
      payload: { message: 'Invalid component type.', value: { allowedTypes: ALLOWED_TYPES } },
    };
  }

  const resolvedName =
    typeof body.name === 'string' ? body.name : body.name === undefined ? '' : null;
  if (resolvedName === null) {
    return {
      ok: false,
      httpStatus: 400,
      payload: { message: 'Component name must be a string.', value: null },
    };
  }

  const resolvedProperties = isPlainObject(body.properties) ? body.properties : {};
  if (body.properties !== undefined && !isPlainObject(body.properties)) {
    return {
      ok: false,
      httpStatus: 400,
      payload: { message: 'Component properties must be a JSON object.', value: null },
    };
  }

  return {
    ok: true,
    value: {
      formId: formIdNumber,
      type: resolvedType,
      name: resolvedName,
      properties: resolvedProperties,
    },
  };
};

async function inputCreateRoutes(fastify: FastifyInstance) {
  fastify.post('/api/form/inputs/create', async (req, reply) => {
    const validation = validateBody(req.body as InputComponentBody);
    if (!validation.ok) {
      return sendReply(reply, validation.httpStatus, validation.payload);
    }

    const { formId, type, name, properties } = validation.value;

    if (!pool) {
      return sendReply(reply, 500, {
        message: 'Database connection is not available.',
        value: null,
      });
    }

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const formLookup = await client.query('SELECT id FROM forms WHERE id = $1;', [formId]);

      if (formLookup.rowCount === 0) {
        await client.query('ROLLBACK');
        return sendReply(reply, 404, { message: 'Form not found.', value: null });
      }

      const insertResult = await client.query(
        `
          INSERT INTO components (form_id, properties, name, type)
          VALUES ($1, $2, $3, $4)
          RETURNING id, form_id, name, type, properties;
        `,
        [formId, properties, name || null, type]
      );

      await client.query('COMMIT');

      return sendReply(reply, 201, {
        message: 'Component created successfully.',
        value: normaliseComponentRow(insertResult.rows[0]),
      });
    } catch (error) {
      await client.query('ROLLBACK');
      fastify.log.error({ err: error }, 'Component creation error');
      return sendReply(reply, 500, {
        message: 'Failed to create component.',
        value: error instanceof Error ? error.message : String(error),
      });
    } finally {
      client.release();
    }
  });
}

export default inputCreateRoutes;
