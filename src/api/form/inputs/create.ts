import { FastifyInstance } from "fastify";
import "dotenv/config";
import { Component, ComponentType } from "../../../models/types.js";
import { pool } from '../../../lib/pg_pool';


const isTestEnvironment = process.env.NODE_ENV === "test";

const ALLOWED_COMPONENT_TYPES: ComponentType[] = [
  "button",
  "checkbox",
  "radio",
  "text",
  "number",
  "select",
  "datetime",
  "file",
];
const ALLOWED_COMPONENT_TYPES_SET = new Set<ComponentType>(ALLOWED_COMPONENT_TYPES);

const testComponentsStore = new Map<number, Component[]>();
let testComponentIdCounter = 1;

function isPlainObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateCommonProperties(props: Record<string, any>): string | null {
  if ("label" in props && typeof props.label !== "string") {
    return "Property 'label' must be a string.";
  }
  if ("placeholder" in props && typeof props.placeholder !== "string") {
    return "Property 'placeholder' must be a string.";
  }
  if ("required" in props && typeof props.required !== "boolean") {
    return "Property 'required' must be a boolean.";
  }
  if ("order" in props && typeof props.order !== "number") {
    return "Property 'order' must be a number.";
  }
  return null;
}

function validateOptionsArray(
  options: unknown,
  minLength: number,
  componentType: ComponentType
): string | null {
  if (!Array.isArray(options) || options.length < minLength) {
    return `${componentType} components require an 'options' array with at least ${minLength} entries.`;
  }

  const isValidOption = (option: unknown) =>
    typeof option === "string" ||
    (isPlainObject(option) &&
      typeof option.label === "string" &&
      typeof option.value === "string");

  if (!options.every(isValidOption)) {
    return `${componentType} component options must be strings or objects with 'label' and 'value' strings.`;
  }

  return null;
}

function validateComponentProperties(
  type: ComponentType,
  props: Record<string, any>
): string | null {
  const commonError = validateCommonProperties(props);
  if (commonError) return commonError;

  switch (type) {
    case "button": {
      if (typeof props.label !== "string" && typeof props.text !== "string") {
        return "Button components require a 'label' or 'text' string.";
      }
      if ("action" in props && typeof props.action !== "string") {
        return "Button property 'action' must be a string when provided.";
      }
      return null;
    }

    case "checkbox": {
      const error = validateOptionsArray(props.options, 1, type);
      if (error) return error;
      if ("maxSelections" in props && typeof props.maxSelections !== "number") {
        return "Checkbox property 'maxSelections' must be a number.";
      }
      return null;
    }

    case "radio": {
      const error = validateOptionsArray(props.options, 2, type);
      if (error) return error;
      return null;
    }

    case "select": {
      const error = validateOptionsArray(props.options, 1, type);
      if (error) return error;
      if ("multiple" in props && typeof props.multiple !== "boolean") {
        return "Select property 'multiple' must be a boolean.";
      }
      return null;
    }

    case "text": {
      if ("defaultValue" in props && typeof props.defaultValue !== "string") {
        return "Text property 'defaultValue' must be a string.";
      }
      if ("minLength" in props && typeof props.minLength !== "number") {
        return "Text property 'minLength' must be a number.";
      }
      if ("maxLength" in props && typeof props.maxLength !== "number") {
        return "Text property 'maxLength' must be a number.";
      }
      if (
        typeof props.minLength === "number" &&
        typeof props.maxLength === "number" &&
        props.minLength > props.maxLength
      ) {
        return "Text property 'minLength' cannot be greater than 'maxLength'.";
      }
      return null;
    }

    case "number": {
      const numericFields = ["defaultValue", "min", "max", "step"] as const;
      for (const field of numericFields) {
        if (field in props && typeof props[field] !== "number") {
          return `Number property '${field}' must be a number.`;
        }
      }
      if (
        typeof props.min === "number" &&
        typeof props.max === "number" &&
        props.min > props.max
      ) {
        return "Number property 'min' cannot be greater than 'max'.";
      }
      if ("step" in props && props.step <= 0) {
        return "Number property 'step' must be greater than 0.";
      }
      return null;
    }

    case "datetime": {
      const datetimeFields = ["defaultValue", "min", "max"] as const;
      for (const field of datetimeFields) {
        if (field in props) {
          if (typeof props[field] !== "string") {
            return `Datetime property '${field}' must be an ISO date string.`;
          }
          const dateValue = Date.parse(props[field]);
          if (Number.isNaN(dateValue)) {
            return `Datetime property '${field}' must be a valid ISO date string.`;
          }
        }
      }
      if (
        typeof props.min === "string" &&
        typeof props.max === "string" &&
        Date.parse(props.min) > Date.parse(props.max)
      ) {
        return "Datetime property 'min' cannot be later than 'max'.";
      }
      return null;
    }

    case "file": {
      if (
        "accept" in props &&
        (!Array.isArray(props.accept) ||
          props.accept.some((item: unknown) => typeof item !== "string"))
      ) {
        return "File property 'accept' must be an array of MIME type strings.";
      }
      if (
        "maxSizeMb" in props &&
        (typeof props.maxSizeMb !== "number" || props.maxSizeMb <= 0)
      ) {
        return "File property 'maxSizeMb' must be a positive number.";
      }
      return null;
    }

    default:
      return null;
  }
}

async function inputCreateRoutes(fastify: FastifyInstance) {
  // Create a component (auto-create form if needed)
  fastify.post("/components", async (req, reply) => {
    const body = req.body as Component;

    if (!body.form_id || !body.type) {
      return reply.status(400).send({ error: "Missing form_id or type" });
    }

    if (!ALLOWED_COMPONENT_TYPES_SET.has(body.type)) {
      return reply.status(400).send({
        error: "Invalid component type",
        validTypes: ALLOWED_COMPONENT_TYPES,
      });
    }

    if (body.properties === undefined) {
      body.properties = {};
    }

    if (!isPlainObject(body.properties)) {
      return reply
        .status(400)
        .send({ error: "Component properties must be an object." });
    }

    const validationError = validateComponentProperties(
      body.type,
      body.properties
    );
    if (validationError) {
      return reply.status(400).send({ error: validationError });
    }

    const sanitizedProperties = { ...body.properties };

    if (isTestEnvironment) {
      const formId = body.form_id;
      const existing = testComponentsStore.get(formId) ?? [];
      const newComponent: Component = {
        id: testComponentIdCounter++,
        form_id: formId,
        type: body.type,
        name: body.name,
        properties: sanitizedProperties,
      };
      existing.push(newComponent);
      testComponentsStore.set(formId, existing);
      return reply.send(newComponent);
    }

    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // Check if form exists
      const formCheck = await client.query(
        "SELECT id FROM forms WHERE id = $1",
        [body.form_id]
      );

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
      const values = [formId, body.type, body.name, sanitizedProperties];
      const result = await client.query(query, values);

      await client.query("COMMIT");
      return reply.send(result.rows[0]);
    } catch (err: any) {
      await client.query("ROLLBACK");
      fastify.log.error("Component creation error:", err);
      return reply.status(500).send({ error: err.message });
    } finally {
      client.release();
    }
  });

  // Get all components for a form
  fastify.get("/forms/:id/components", async (req, reply) => {
    const { id } = req.params as { id: string };
    const formId = Number(id);

    if (isTestEnvironment) {
      return reply.send(testComponentsStore.get(formId) ?? []);
    }

    const result = await pool.query(
      "SELECT * FROM components WHERE form_id = $1;",
      [formId]
    );
    return reply.send(result.rows);
  });
}

export default inputCreateRoutes;