import { FastifyInstance } from "fastify";
import "dotenv/config";
import { Component } from "../../models/types.js";
import { getTestFormsSnapshot } from './create';
import { pool } from '../../lib/pg_pool';

const isTestEnvironment = process.env.NODE_ENV === "test";


type AnswerEntry = {
  componentId: number;
  value: unknown;
};

type AnswerSubmissionBody = {
  respondent_id?: string;
  answers?: AnswerEntry[];
};

type StoredResponse = {
  id: number;
  form_id: number;
  respondent_id: string | null;
  submitted_at: string;
  answers: Record<string, unknown>;
};

const testResponsesStore = new Map<number, StoredResponse[]>();
let testResponseIdCounter = 1;

function isRecord(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function extractOptionValues(options: unknown): string[] | null {
  if (!Array.isArray(options)) return null;

  const values: string[] = [];

  for (const option of options) {
    if (typeof option === "string") {
      values.push(option);
    } else if (isRecord(option) && typeof option.value === "string") {
      values.push(option.value);
    }
  }

  return values.length > 0 ? values : null;
}

function coerceNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function validateAnswer(component: Component, rawValue: unknown): {
  ok: boolean;
  value?: unknown;
  error?: string;
} {
  const props = isRecord(component.properties) ? component.properties : {};
  const required = Boolean(props.required);

  const answerMissing =
    rawValue === undefined ||
    rawValue === null ||
    (typeof rawValue === "string" && rawValue.trim() === "");

  if (answerMissing) {
    if (required) {
      return {
        ok: false,
        error: `Component '${component.name ?? component.id}' is required.`,
      };
    }
    return { ok: true };
  }

  switch (component.type) {
    case "text": {
      if (typeof rawValue !== "string") {
        return { ok: false, error: "Text answers must be strings." };
      }
      const trimmed = rawValue.trim();

      if (
        typeof props.minLength === "number" &&
        trimmed.length < props.minLength
      ) {
        return {
          ok: false,
          error: `Text answer must be at least ${props.minLength} characters long.`,
        };
      }

      if (
        typeof props.maxLength === "number" &&
        trimmed.length > props.maxLength
      ) {
        return {
          ok: false,
          error: `Text answer must be at most ${props.maxLength} characters long.`,
        };
      }

      return { ok: true, value: trimmed };
    }

    case "number": {
      const coerced = coerceNumber(rawValue);
      if (coerced === null) {
        return { ok: false, error: "Number answers must be numeric." };
      }

      if (typeof props.min === "number" && coerced < props.min) {
        return {
          ok: false,
          error: `Number answer cannot be less than ${props.min}.`,
        };
      }

      if (typeof props.max === "number" && coerced > props.max) {
        return {
          ok: false,
          error: `Number answer cannot be greater than ${props.max}.`,
        };
      }

      if (typeof props.step === "number" && props.step > 0) {
        const remainder = Math.abs((coerced - (props.min ?? 0)) % props.step);
        const epsilon = 1e-9;
        if (remainder > epsilon && Math.abs(remainder - props.step) > epsilon) {
          return {
            ok: false,
            error: `Number answer must align with step ${props.step}.`,
          };
        }
      }

      return { ok: true, value: coerced };
    }

    case "checkbox": {
      if (!Array.isArray(rawValue)) {
        return {
          ok: false,
          error: "Checkbox answers must be an array of selected values.",
        };
      }

      const optionValues = extractOptionValues(props.options);
      if (!optionValues) {
        return {
          ok: false,
          error: "Checkbox component is missing valid options for validation.",
        };
      }

      const selections = rawValue.map((entry) => String(entry));
      const invalid = selections.filter(
        (value) => !optionValues.includes(value)
      );

      if (invalid.length > 0) {
        return {
          ok: false,
          error: `Checkbox answer contains invalid option(s): ${invalid.join(
            ", "
          )}.`,
        };
      }

      if (
        typeof props.maxSelections === "number" &&
        selections.length > props.maxSelections
      ) {
        return {
          ok: false,
          error: `Checkbox answer cannot select more than ${props.maxSelections} options.`,
        };
      }

      return { ok: true, value: selections };
    }

    case "radio": {
      const optionValues = extractOptionValues(props.options);
      if (!optionValues) {
        return {
          ok: false,
          error: "Radio component is missing valid options for validation.",
        };
      }

      const selection = String(rawValue);

      if (!optionValues.includes(selection)) {
        return {
          ok: false,
          error: `Radio answer must be one of: ${optionValues.join(", ")}.`,
        };
      }

      return { ok: true, value: selection };
    }

    case "select": {
      const optionValues = extractOptionValues(props.options);
      if (!optionValues) {
        return {
          ok: false,
          error: "Select component is missing valid options for validation.",
        };
      }

      if (props.multiple) {
        if (!Array.isArray(rawValue)) {
          return {
            ok: false,
            error: "Select (multiple) answers must be an array of values.",
          };
        }

        const selections = rawValue.map((entry) => String(entry));
        const invalid = selections.filter(
          (value) => !optionValues.includes(value)
        );

        if (invalid.length > 0) {
          return {
            ok: false,
            error: `Select answer contains invalid option(s): ${invalid.join(
              ", "
            )}.`,
          };
        }

        return { ok: true, value: selections };
      }

      const selection = String(rawValue);

      if (!optionValues.includes(selection)) {
        return {
          ok: false,
          error: `Select answer must be one of: ${optionValues.join(", ")}.`,
        };
      }

      return { ok: true, value: selection };
    }

    case "datetime": {
      if (typeof rawValue !== "string") {
        return { ok: false, error: "Datetime answers must be ISO date strings." };
      }

      const timestamp = Date.parse(rawValue);
      if (Number.isNaN(timestamp)) {
        return {
          ok: false,
          error: "Datetime answer must be a valid ISO date string.",
        };
      }

      if (
        typeof props.min === "string" &&
        Date.parse(rawValue) < Date.parse(props.min)
      ) {
        return {
          ok: false,
          error: `Datetime answer cannot be earlier than ${props.min}.`,
        };
      }

      if (
        typeof props.max === "string" &&
        Date.parse(rawValue) > Date.parse(props.max)
      ) {
        return {
          ok: false,
          error: `Datetime answer cannot be later than ${props.max}.`,
        };
      }

      return { ok: true, value: rawValue };
    }

    case "file": {
      if (typeof rawValue !== "string") {
        return {
          ok: false,
          error: "File answers must be strings (e.g., URLs or IDs).",
        };
      }

      if (
        props.maxSizeMb &&
        rawValue.length / (1024 * 1024) > props.maxSizeMb
      ) {
        return {
          ok: false,
          error: `File answer exceeds max size of ${props.maxSizeMb} MB.`,
        };
      }

      return { ok: true, value: rawValue };
    }

    case "button": {
      if (rawValue !== undefined && typeof rawValue !== "string") {
        return {
          ok: false,
          error: "Button answers (if provided) must be strings.",
        };
      }
      return { ok: true, value: rawValue ?? null };
    }

    default:
      return {
        ok: false,
        error: `Unsupported component type: ${component.type}.`,
      };
  }
}

function ensureAllAnswersReferenced(
  answerEntries: AnswerEntry[],
  componentIds: Set<number>
): string | null {
  for (const entry of answerEntries) {
    if (!componentIds.has(entry.componentId)) {
      return `Answer references unknown component ID ${entry.componentId}.`;
    }
  }

  return null;
}

async function formSubmitRoutes(fastify: FastifyInstance) {
  fastify.post("/api/form/answer/:formID", async (req, reply) => {
    const { formID } = req.params as { formID: string };
    const parsedId = Number(formID);

    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      return reply.status(400).send({ error: "Invalid form ID." });
    }

    const body = req.body as AnswerSubmissionBody;

    if (!body || !Array.isArray(body.answers) || body.answers.length === 0) {
      return reply.status(400).send({
        error: "Answers payload is required.",
        details: "Provide an array of { componentId, value } entries.",
      });
    }

    const answerEntries = body.answers;
    const respondentId =
      typeof body.respondent_id === "string" ? body.respondent_id : null;

    let components: Component[] = [];

    if (isTestEnvironment) {
      const form = getTestFormsSnapshot().find(
        (storedForm) => storedForm.id === parsedId
      );

      if (!form) {
        return reply.status(404).send({ error: "Form not found." });
      }

      components = form.components;
    } else {
      if (!pool) {
        return reply
          .status(500)
          .send({ error: "Database connection is not available." });
      }

      const client = await pool.connect();
      let transactionStarted = false;

      try {
        const formResult = await client.query(
          `
          SELECT id
          FROM forms
          WHERE id = $1;
        `,
          [parsedId]
        );

        if (formResult.rowCount === 0) {
          return reply.status(404).send({ error: "Form not found." });
        }

        const componentsResult = await client.query<Component>(
          `
            SELECT id, form_id, type, name, properties
            FROM components
            WHERE form_id = $1
            ORDER BY COALESCE((properties->>'order')::int, 0), id;
          `,
          [parsedId]
        );

        components = componentsResult.rows;

        if (components.length === 0) {
          return reply.status(400).send({
            error: "Form has no components to answer.",
          });
        }

        const componentIds = new Set(
          components
            .map((component) => Number(component.id))
            .filter((id): id is number => !Number.isNaN(id))
        );

        const unknownAnswerError = ensureAllAnswersReferenced(
          answerEntries,
          componentIds
        );

        if (unknownAnswerError) {
          return reply.status(400).send({ error: unknownAnswerError });
        }

        const sanitizedAnswers = new Map<number, unknown>();
        const componentMap = new Map<number, Component>();

        for (const component of components) {
          const numericId = Number(component.id);
          if (!Number.isNaN(numericId)) {
            componentMap.set(numericId, component);
          }
        }

        for (const component of components) {
          const numericId = Number(component.id);
          if (Number.isNaN(numericId)) continue;

          const entry = answerEntries.find(
            (candidate) => candidate.componentId === numericId
          );

          const rawValue = entry?.value;
          const { ok, value, error } = validateAnswer(component, rawValue);

          if (!ok) {
            return reply.status(400).send({ error });
          }

          if (value !== undefined) {
            sanitizedAnswers.set(numericId, value);
          }
        }

        await client.query("BEGIN");
        transactionStarted = true;

        let submitterId: string;

        if (respondentId) {
          const username = `respondent_${respondentId.slice(0, 8)}`;
          await client.query(
            `
              INSERT INTO users (id, username)
              VALUES ($1, $2)
              ON CONFLICT (id) DO NOTHING;
            `,
            [respondentId, username]
          );
          submitterId = respondentId;
        } else {
          const generatedUsername = `respondent_${Date.now()}_${Math.random()
            .toString(16)
            .slice(2)}`;
          const userInsert = await client.query<{ id: string }>(
            `
              INSERT INTO users (username)
              VALUES ($1)
              RETURNING id;
            `,
            [generatedUsername]
          );
          submitterId = userInsert.rows[0].id;
        }

        const submissionResult = await client.query<{
          id: number;
          created_at: Date;
        }>(
          `
          INSERT INTO submissions (form_id, user_id, created_at)
          VALUES ($1, $2, NOW())
          RETURNING id, created_at;
        `,
          [parsedId, submitterId]
        );

        const submissionRow = submissionResult.rows[0];

        for (const [componentId, value] of sanitizedAnswers.entries()) {
          const component = componentMap.get(componentId);
          const payload = JSON.stringify({
            value,
            type: component?.type ?? null,
          });

          await client.query(
            `
            INSERT INTO answers (component_id, submission_id, properties)
            VALUES ($1, $2, $3::jsonb);
          `,
            [componentId, submissionRow.id, payload]
          );
        }

        await client.query("COMMIT");
        transactionStarted = false;

        const answersObject: Record<string, unknown> = {};
        for (const [componentId, value] of sanitizedAnswers.entries()) {
          answersObject[String(componentId)] = value;
        }

        return reply.status(201).send({
          message: "Form submitted successfully.",
          submission: {
            id: submissionRow.id,
            form_id: parsedId,
            respondent_id: submitterId,
            submitted_at: submissionRow.created_at.toISOString(),
            answers: answersObject,
          },
        });
      } catch (error) {
        if (transactionStarted) {
          await client.query("ROLLBACK");
        }

        fastify.log.error({ err: error }, "Form submission error:");

        return reply.status(500).send({
          error: "Failed to submit form.",
          details: error instanceof Error ? error.message : String(error),
        });
      } finally {
        client.release();
      }

      return;
    }

    const componentIds = new Set(
      components
        .map((component) => component.id)
        .filter((id): id is number => typeof id === "number")
    );

    const unknownAnswerError = ensureAllAnswersReferenced(
      answerEntries,
      componentIds
    );

    if (unknownAnswerError) {
      return reply.status(400).send({ error: unknownAnswerError });
    }

    const sanitizedAnswers = new Map<number, unknown>();

    for (const component of components) {
      if (typeof component.id !== "number") continue;

      const entry = answerEntries.find(
        (candidate) => candidate.componentId === component.id
      );

      const rawValue = entry?.value;
      const { ok, value, error } = validateAnswer(component, rawValue);

      if (!ok) {
        return reply.status(400).send({ error });
      }

      if (value !== undefined) {
        sanitizedAnswers.set(component.id, value);
      }
    }

    const answersObject: Record<string, unknown> = {};
    for (const [componentId, value] of sanitizedAnswers.entries()) {
      answersObject[String(componentId)] = value;
    }

    const response: StoredResponse = {
      id: testResponseIdCounter++,
      form_id: parsedId,
      respondent_id: respondentId,
      submitted_at: new Date().toISOString(),
      answers: answersObject,
    };

    const existing = testResponsesStore.get(parsedId) ?? [];
    existing.push(response);
    testResponsesStore.set(parsedId, existing);

    return reply.status(201).send({
      message: "Form submitted successfully (test mode).",
      submission: response,
      totalSubmissions: existing.length,
    });
  });
}

export default formSubmitRoutes;