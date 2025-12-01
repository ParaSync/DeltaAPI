import { FastifyInstance, FastifyReply } from 'fastify';
import 'dotenv/config';
import { pool } from '../../../lib/pg_pool.js';
import { ReplyPayload } from '../../../models/routes.js';
import { ComponentType } from '../../../models/components.js';
import formSubmitRoutes from '../submit';

type AnswerableComponent = {
  id: string;
  formId: string;
  type: ComponentType;
  name: string;
  order: number;
  properties: Record<string, unknown>;
};

type AnswerableForm = {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
  components: AnswerableComponent[];
};

const ALLOWED_TYPES: ComponentType[] = ['image', 'label', 'input', 'table'];

const sendReply = (reply: FastifyReply, status: number, payload: ReplyPayload) =>
  reply.status(status).send(payload);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const toComponentType = (candidate: unknown): ComponentType =>
  typeof candidate === 'string' && ALLOWED_TYPES.includes(candidate as ComponentType)
    ? (candidate as ComponentType)
    : 'input';

const toComponentOrder = (rawOrder: unknown): number => {
  if (typeof rawOrder === 'number' && Number.isFinite(rawOrder)) return rawOrder;
  if (typeof rawOrder === 'string' && rawOrder.trim() !== '') {
    const parsed = Number(rawOrder);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const sortComponents = (components: AnswerableComponent[]) =>
  components.slice().sort((a, b) => a.order - b.order);

const normaliseComponent = (raw: unknown): AnswerableComponent => {
  const obj = isPlainObject(raw) ? raw : {};
  const properties = isPlainObject(obj.properties) ? obj.properties : {};
  const order = toComponentOrder(obj.order ?? properties.order ?? properties.orderBy);

  return {
    id: String(obj.id ?? ''),
    formId: String(obj.form_id ?? obj.formId ?? ''),
    type: toComponentType(obj.type),
    name: typeof obj.name === 'string' ? obj.name : '',
    order,
    properties,
  };
};

const buildFormResponse = (
  rawForm: { id: unknown; title: unknown; user_id?: unknown; userId?: unknown; created_at?: unknown; createdAt?: unknown },
  components: AnswerableComponent[]
): AnswerableForm => {
  const rawCreated = rawForm.created_at ?? rawForm.createdAt;
  const createdAt =
    typeof rawCreated === 'string' || typeof rawCreated === 'number' || rawCreated instanceof Date
      ? new Date(rawCreated).toISOString()
      : new Date().toISOString();

  return {
    id: String(rawForm.id ?? ''),
    title: typeof rawForm.title === 'string' ? rawForm.title : '',
    userId:
      typeof rawForm.user_id === 'string'
        ? rawForm.user_id
        : typeof rawForm.userId === 'string'
        ? rawForm.userId
        : '',
    createdAt,
    components: sortComponents(components),
  };
};

async function answerFormRoutes(fastify: FastifyInstance) {
  // GET - load form + components for answering
  fastify.get('/api/form/answer/:formID', async (req, reply) => {
    const { formID } = req.params as { formID: string };
    const parsedId = Number(formID);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return sendReply(reply, 400, { message: 'Invalid form ID.', value: null });
    }

    if (!pool) {
      return sendReply(reply, 500, { message: 'Database connection is not available.', value: null });
    }

    const client = await pool.connect();
    try {
      const formResult = await client.query<{ id: number; title: string; user_id: string | null; created_at: Date }>(
        'SELECT id, title, user_id, created_at FROM forms WHERE id = $1;',
        [parsedId]
      );

      if (formResult.rowCount === 0) {
        return sendReply(reply, 404, { message: 'Form not found.', value: null });
      }

      const componentsResult = await client.query(
        'SELECT id, form_id, type, name, properties FROM components WHERE form_id = $1 ORDER BY COALESCE((properties->>\'order\')::int, 0), id;',
        [parsedId]
      );

      const formResponse = buildFormResponse(
        formResult.rows[0],
        componentsResult.rows.map(normaliseComponent)
      );

      return sendReply(reply, 200, { message: 'Form loaded successfully.', value: { form: formResponse } });
    } catch (error) {
      fastify.log.error({ err: error }, 'Form fetch error');
      return sendReply(reply, 500, { message: 'Failed to fetch form.', value: error instanceof Error ? error.message : String(error) });
    } finally {
      client.release();
    }
  });

  // POST - register submission handler (from submit.ts)
  await formSubmitRoutes(fastify);
}

export default answerFormRoutes;
