import { describe, expect, test } from "@jest/globals";

const TEST_USER_ID = "892d56fa-50c6-43b3-86e9-f162329760a1";
const route = (s: string) => `http://localhost:3000/${s}`;

const unique = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const buildFormPayload = () => ({
  title: unique("ComponentTestForm"),
  user_id: TEST_USER_ID,
  components: [
    {
      type: "text",
      name: unique("seed_text"),
      order: 1,
      properties: { label: "Seed Text Field" },
    },
  ],
});

const createForm = async () => {
  const response = await fetch(route("api/form/create"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildFormPayload()),
  });

  expect(response.status).toBe(201);
  return response.json();
};

describe("Component Routes", () => {
  test("creates a valid text component", async () => {
    const form = await createForm();
    const componentBody = {
      form_id: form.id,
      type: "text",
      name: unique("username"),
      properties: {
        label: "Enter your name",
        required: true,
        placeholder: "e.g. Lance Tan",
        minLength: 2,
        maxLength: 30,
      },
    };

    const response = await fetch(route("components"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(componentBody),
    });

    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.type).toBe("text");
    expect(json.form_id).toBe(form.id);
    expect(json.properties.label).toBe(componentBody.properties.label);
  });

  test("rejects number component with non-numeric defaults", async () => {
    const form = await createForm();

    const response = await fetch(route("components"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        form_id: form.id,
        type: "number",
        name: unique("age"),
        properties: {
          label: "Age",
          defaultValue: "twenty",
        },
      }),
    });

    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toBe("Number property 'defaultValue' must be a number.");
  });

  test("rejects select component without options array", async () => {
    const form = await createForm();

    const response = await fetch(route("components"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        form_id: form.id,
        type: "select",
        name: unique("department"),
        properties: {
          label: "Department",
          options: "Sales,Marketing",
        },
      }),
    });

    expect(response.status).toBe(400);

    const json = await response.json();
    expect(json.error).toContain(
      "select components require an 'options' array"
    );
  });

  test("fetches components for a form", async () => {
    const form = await createForm();

    await fetch(route("components"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        form_id: form.id,
        type: "text",
        name: unique("extra_field"),
        properties: { label: "Extra Field", order: 2 },
      }),
    });

    const response = await fetch(route(`forms/${form.id}/components`));
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBeGreaterThan(0);
    expect(json.some((c: any) => c.form_id === form.id)).toBe(true);
  });
});