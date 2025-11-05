/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO: remove the above

import { FastifyInstance } from 'fastify';
import 'dotenv/config';
import { ReplyPayload } from '../../../models/routes.js';
import { ComponentType } from '../../../models/components.js';
import { pool } from '../../../lib/pg_pool.js';
import { getTestFormsSnapshot } from '../create';

const isTestEnvironment = process.env.NODE_ENV === 'test';

type ComponentForClear = {
  id: number;
  type: ComponentType;
  name?: string;
  properties: Record<string, unknown>;
};

const ALLOWED_TYPES: ComponentType[] = ['image', 'label', 'input', 'table'];

const sendReply = (reply: any, status: number, payload: ReplyPayload) =>
  reply.status(status).send(payload);

const toComponentType = (candidate: unknown): ComponentType =>
  typeof candidate === 'string' && ALLOWED_TYPES.includes(candidate as ComponentType)
    ? (candidate as ComponentType)
    : 'input';

const buildClearedValues = (components: ComponentForClear[]) => {
  const clearedValues: Record<string, unknown> = {};
  for (const component of components) {
    clearedValues[String(component.id)] = deriveDefaultValue(component);
  }
  return clearedValues;
};

function deriveDefaultValue(component: ComponentForClear): unknown {
  const props = isRecord(component.properties) ? component.properties : {};

  if (props.defaultValue !== undefined) {
    return props.defaultValue;
  }

  if (props.multiple === true) {
    return Array.isArray(props.defaultValue) ? props.defaultValue : [];
  }

  return null;
}

const normaliseComponent = (raw: any): ComponentForClear | null => {
  const id = Number(raw?.id);
  if (!Number.isFinite(id)) {
    return null;
  }

  const properties = isRecord(raw?.properties) ? raw.properties : {};

  return {
    id,
    type: toComponentType(raw?.type),
    name: typeof raw?.name === 'string' ? raw.name : undefined,
    properties,
  };
};

async function clearFormRoutes(fastify: FastifyInstance) {
  fastify.post('/clear/:formID', async (req, reply) => {
    const { formID } = req.params as { formID: string };
    const parsedId = Number(formID);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return sendReply(reply, 400, {
        message: 'Invalid form ID.',
        value: null,
      });
    }

    if (isTestEnvironment) {
      const form = getTestFormsSnapshot().find((storedForm) => Number(storedForm.id) === parsedId);

      if (!form) {
        return sendReply(reply, 404, {
          message: 'Form not found.',
          value: null,
        });
      }

      const components = form.components
        .map(normaliseComponent)
        .filter((component): component is ComponentForClear => component !== null);

      return sendReply(reply, 200, {
        message: 'Form fields reset to default values.',
        value: {
          formId: String(parsedId),
          clearedValues: buildClearedValues(components),
        },
      });
    }

    if (!pool) {
      return sendReply(reply, 500, {
        message: 'Database connection is not available.',
        value: null,
      });
    }

    const client = await pool.connect();
    let transactionActive = false;

    try {
      await client.query('BEGIN');
      transactionActive = true;

      const formResult = await client.query(`SELECT id FROM forms WHERE id = $1;`, [parsedId]);

      if (formResult.rowCount === 0) {
        await client.query('ROLLBACK');
        transactionActive = false;
        return sendReply(reply, 404, {
          message: 'Form not found.',
          value: null,
        });
      }

      const componentsResult = await client.query(
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

      await client.query(
        `
          DELETE FROM answers
          WHERE submission_id IN (
            SELECT id FROM submissions WHERE form_id = $1
          );
        `,
        [parsedId]
      );

      await client.query(`DELETE FROM submissions WHERE form_id = $1;`, [parsedId]);

      await client.query('COMMIT');
      transactionActive = false;

      return sendReply(reply, 200, {
        message: 'Form answers cleared successfully.',
        value: {
          formId: String(parsedId),
          clearedValues,
        },
      });
    } catch (error) {
      if (transactionActive) {
        await client.query('ROLLBACK');
      }
      fastify.log.error(
        'Form clear error: ' +
          (error instanceof Error ? (error.stack ?? error.message) : String(error))
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export default clearFormRoutes;
