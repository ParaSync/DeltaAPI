import { FastifyInstance, FastifyReply } from 'fastify';
import 'dotenv/config';
import { ReplyPayload } from '../../models/routes.js';
import { ComponentType } from '../../models/components.js';
import { pool } from '../../lib/pg_pool.js';

type FormComponent = {
  id: number | string;
  form_id?: number | string;
  type: ComponentType | string;
  name?: string;
  properties?: Record<string, unknown>;
};

type AnswerEntry = {
  componentId: number;
  value: unknown;
};

type AnswerSubmissionBody = {
  respondent_id?: string;
  answers?: AnswerEntry[];
};

const ALLOWED_TYPES: ComponentType[] = ['image', 'label', 'input', 'table'];

/**
 * Send a reply with a proper payload.
 */
const sendReply = (reply: FastifyReply, status: number, payload: ReplyPayload) => {
  return reply.status(status).send(payload);
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toComponentType(candidate: unknown): ComponentType {
  if (typeof candidate === 'string' && ALLOWED_TYPES.includes(candidate as ComponentType)) {
    return candidate as ComponentType;
  }
  return 'input';
}

function toNumericId(id: number | string | undefined): number | null {
  if (typeof id === 'number' && Number.isFinite(id)) return id;
  if (typeof id === 'string' && id.trim() !== '') {
    const parsed = Number(id);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractOptionValues(options: unknown): string[] | null {
  if (!Array.isArray(options)) return null;
  const values: string[] = [];
  for (const option of options) {
    if (typeof option === 'string') {
      values.push(option);
    } else if (isRecord(option) && typeof option.value === 'string') {
      values.push(option.value);
    }
  }
  return values.length > 0 ? values : null;
}

function coerceNumber(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resolveInputKind(props: Record<string, unknown>): string {
  const candidates = [
    props.inputType,
    props.fieldType,
    props.type,
    props.kind,
    props.variant,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;
  }

  return 'text';
}

function validateInputAnswer(
  inputKind: string,
  props: Record<string, unknown>,
  rawValue: unknown
): { ok: boolean; value?: unknown; error?: string } {
  const getNumberProp = (key: string): number | undefined =>
    typeof props[key] === 'number' ? props[key] : undefined;

  const getBooleanProp = (key: string): boolean | undefined =>
    typeof props[key] === 'boolean' ? props[key] : undefined;

  const getStringProp = (key: string): string | undefined =>
    typeof props[key] === 'string' ? props[key] : undefined;

  switch (inputKind) {
    case 'number': {
      const coerced = coerceNumber(rawValue);
      if (coerced === null) {
        return { ok: false, error: 'Number answers must be numeric.' };
      }

      const min = getNumberProp('min');
      const max = getNumberProp('max');
      const step = getNumberProp('step');

      if (min !== undefined && coerced < min) {
        return { ok: false, error: `Number answer cannot be less than ${min}.` };
      }

      if (max !== undefined && coerced > max) {
        return { ok: false, error: `Number answer cannot be greater than ${max}.` };
      }

      if (step !== undefined && step > 0) {
        const base = min ?? 0;
        const remainder = Math.abs((coerced - base) % step);
        const epsilon = 1e-9;
        if (remainder > epsilon && Math.abs(remainder - step) > epsilon) {
          return { ok: false, error: `Number answer must align with step ${step}.` };
        }
      }

      return { ok: true, value: coerced };
    }

    case 'checkbox': {
      if (!Array.isArray(rawValue)) {
        return { ok: false, error: 'Checkbox answers must be an array of selected values.' };
      }

      const optionValues = extractOptionValues(props.options);
      if (!optionValues) return { ok: false, error: 'Checkbox input is missing valid options.' };

      const selections = rawValue.map((entry) => String(entry));
      const invalid = selections.filter((value) => !optionValues.includes(value));

      if (invalid.length > 0) {
        return { ok: false, error: `Checkbox answer contains invalid option(s): ${invalid.join(', ')}.` };
      }

      const maxSelections = getNumberProp('maxSelections');
      if (maxSelections !== undefined && selections.length > maxSelections) {
        return { ok: false, error: `Checkbox answer cannot select more than ${maxSelections} options.` };
      }

      return { ok: true, value: selections };
    }

    case 'radio':
    case 'select': {
      const optionValues = extractOptionValues(props.options);
      if (!optionValues) return { ok: false, error: 'Select/radio input is missing valid options.' };

      const multiple = getBooleanProp('multiple') === true;

      if (multiple) {
        if (!Array.isArray(rawValue)) {
          return { ok: false, error: 'Multi-select answers must be an array of values.' };
        }

        const selections = rawValue.map((entry) => String(entry));
        const invalid = selections.filter((value) => !optionValues.includes(value));

        if (invalid.length > 0) {
          return { ok: false, error: `Select answer contains invalid option(s): ${invalid.join(', ')}.` };
        }

        return { ok: true, value: selections };
      }

      const selection = String(rawValue);

      if (!optionValues.includes(selection)) {
        return { ok: false, error: `Select answer must be one of: ${optionValues.join(', ')}.` };
      }

      return { ok: true, value: selection };
    }

    case 'datetime': {
      if (typeof rawValue !== 'string') return { ok: false, error: 'Datetime answers must be ISO date strings.' };

      const timestamp = Date.parse(rawValue);
      if (Number.isNaN(timestamp)) return { ok: false, error: 'Datetime answer must be a valid ISO date string.' };

      const minDate = getStringProp('min');
      const maxDate = getStringProp('max');

      if (minDate && Date.parse(rawValue) < Date.parse(minDate)) {
        return { ok: false, error: `Datetime answer cannot be earlier than ${minDate}.` };
      }

      if (maxDate && Date.parse(rawValue) > Date.parse(maxDate)) {
        return { ok: false, error: `Datetime answer cannot be later than ${maxDate}.` };
      }

      return { ok: true, value: rawValue };
    }

    case 'file': {
      if (typeof rawValue !== 'string') return { ok: false, error: 'File answers must be strings.' };

      const maxSizeMb = getNumberProp('maxSizeMb');
      if (maxSizeMb !== undefined && rawValue.length / (1024 * 1024) > maxSizeMb) {
        return { ok: false, error: `File answer exceeds max size of ${maxSizeMb} MB.` };
      }

      return { ok: true, value: rawValue };
    }

    case 'button': {
      if (rawValue !== undefined && typeof rawValue !== 'string') {
        return { ok: false, error: 'Button answers (if provided) must be strings.' };
      }
      return { ok: true, value: rawValue ?? null };
    }

    case 'text':
    default: {
      if (typeof rawValue !== 'string') return { ok: false, error: 'Text answers must be strings.' };
      const trimmed = rawValue.trim();
      const minLength = getNumberProp('minLength');
      const maxLength = getNumberProp('maxLength');

      if (minLength !== undefined && trimmed.length < minLength) {
        return { ok: false, error: `Text answer must be at least ${minLength} characters long.` };
      }

      if (maxLength !== undefined && trimmed.length > maxLength) {
        return { ok: false, error: `Text answer must be at most ${maxLength} characters long.` };
      }

      return { ok: true, value: trimmed };
    }
  }
}

function validateAnswer(
  component: FormComponent,
  rawValue: unknown
): { ok: boolean; value?: unknown; error?: string } {
  const props = isRecord(component.properties) ? component.properties : {};
  const resolvedType = toComponentType(component.type);

  const required = Boolean(props.required);

  const answerMissing =
    rawValue === undefined ||
    rawValue === null ||
    (typeof rawValue === 'string' && rawValue.trim() === '');

  if (answerMissing) {
    if (required) {
      return { ok: false, error: `Component '${component.name ?? component.id}' is required.` };
    }
    return { ok: true };
  }

  if (resolvedType !== 'input') {
    return { ok: true, value: rawValue };
  }

  const inputKind = resolveInputKind(props).toLowerCase();
  return validateInputAnswer(inputKind, props, rawValue);
}

function ensureAllAnswersReferenced(answerEntries: AnswerEntry[], componentIds: Set<number>): string | null {
  for (const entry of answerEntries) {
    if (!componentIds.has(entry.componentId)) {
      return `Answer references unknown component ID ${entry.componentId}.`;
    }
  }
  return null;
}

async function formSubmitRoutes(fastify: FastifyInstance) {
  fastify.post('/api/form/answer/:formID', async (req, reply) => {
    const { formID } = req.params as { formID: string };
    const parsedId = Number(formID);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return sendReply(reply, 400, {
        message: 'Invalid form ID.',
        value: null,
      });
    }

    const body = req.body as AnswerSubmissionBody;

    if (!body || !Array.isArray(body.answers) || body.answers.length === 0) {
      return sendReply(reply, 400, {
        message: 'Answers payload is required.',
        value: {
          details: 'Provide an array of { componentId, value } entries.',
        },
      });
    }

    const answerEntries = body.answers;
    const respondentId = typeof body.respondent_id === 'string' ? body.respondent_id : null;

    if (!pool) {
      return sendReply(reply, 500, {
        message: 'Database connection is not available.',
        value: null,
      });
    }

    const client = await pool.connect();
    let transactionStarted = false;

    try {
      const formResult = await client.query(
        `SELECT id FROM forms WHERE id = $1;`,
        [parsedId]
      );

      if (formResult.rowCount === 0) {
        return sendReply(reply, 404, {
          message: 'Form not found.',
          value: null,
        });
      }

      const componentsResult = await client.query<FormComponent>(
        `
        SELECT id, form_id, type, name, properties
        FROM components
        WHERE form_id = $1
        ORDER BY COALESCE((properties->>'order')::int, 0), id;
        `,
        [parsedId]
      );

      const components = componentsResult.rows.map((row) => ({
        ...row,
        type: toComponentType(row.type),
      }));

      if (components.length === 0) {
        return sendReply(reply, 400, {
          message: 'Form has no components to answer.',
          value: null,
        });
      }

      const componentIds = new Set<number>();
      const componentMap = new Map<number, FormComponent>();
      for (const component of components) {
        const numericId = toNumericId(component.id);
        if (numericId !== null) {
          componentIds.add(numericId);
          componentMap.set(numericId, component);
        }
      }

      const unknownAnswerError = ensureAllAnswersReferenced(answerEntries, componentIds);
      if (unknownAnswerError) {
        return sendReply(reply, 400, {
          message: unknownAnswerError,
          value: null,
        });
      }

      const sanitizedAnswers = new Map<number, unknown>();
      for (const component of components) {
        const numericId = toNumericId(component.id);
        if (numericId === null) continue;

        const entry = answerEntries.find((candidate) => candidate.componentId === numericId);
        const rawValue = entry?.value;
        const { ok, value, error } = validateAnswer(component, rawValue);

        if (!ok) {
          return sendReply(reply, 400, {
            message: error ?? 'Answer failed validation.',
            value: { componentId: component.id },
          });
        }

        if (value !== undefined) {
          sanitizedAnswers.set(numericId, value);
        }
      }

      await client.query('BEGIN');
      transactionStarted = true;

      let submitterId: string;

      if (respondentId) {
        const username = `respondent_${respondentId.slice(0, 8)}`;
        await client.query(
          `INSERT INTO users (id, username) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING;`,
          [respondentId, username]
        );
        submitterId = respondentId;
      } else {
        const generatedUsername = `respondent_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const userInsert = await client.query<{ id: string }>(
          `INSERT INTO users (username) VALUES ($1) RETURNING id;`,
          [generatedUsername]
        );
        submitterId = userInsert.rows[0].id;
      }

      const submissionResult = await client.query<{ id: number; created_at: Date }>(
        `INSERT INTO submissions (form_id, user_id, created_at) VALUES ($1, $2, NOW()) RETURNING id, created_at;`,
        [parsedId, submitterId]
      );

      const submissionRow = submissionResult.rows[0];

      for (const [componentId, value] of sanitizedAnswers.entries()) {
        const component = componentMap.get(componentId);
        const payload = JSON.stringify({ value, type: component?.type ?? null });

        await client.query(
          `INSERT INTO answers (component_id, submission_id, properties) VALUES ($1, $2, $3::jsonb);`,
          [componentId, submissionRow.id, payload]
        );
      }

      await client.query('COMMIT');
      transactionStarted = false;

      const answersObject: Record<string, unknown> = {};
      for (const [componentId, value] of sanitizedAnswers.entries()) {
        answersObject[String(componentId)] = value;
      }

      return sendReply(reply, 201, {
        message: 'Form submitted successfully.',
        value: {
          submission: {
            id: submissionRow.id,
            form_id: parsedId,
            respondent_id: submitterId,
            submitted_at: submissionRow.created_at.toISOString(),
            answers: answersObject,
          },
        },
      });
    } catch (error) {
      if (transactionStarted) await client.query('ROLLBACK');
      fastify.log.error({ err: error }, 'Form submission error:');
      return sendReply(reply, 500, {
        message: 'Failed to submit form.',
        value: error instanceof Error ? error.message : String(error),
      });
    } finally {
      client.release();
    }
  });
}

export default formSubmitRoutes;
