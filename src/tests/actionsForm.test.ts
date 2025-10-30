import { describe, expect, test } from "@jest/globals";
import { randomUUID } from "crypto";

const TEST_USER_ID = "892d56fa-50c6-43b3-86e9-f162329760a1";
const route = (s: string) => `http://localhost:3000/${s}`;
const unique = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

type CreatedForm = {
  id: number;
  components: Array<{
    id: number;
    type: string;
    properties: Record<string, any>;
  }>;
};

const buildFormPayload = () => ({
  title: unique("ActionsForm"),
  user_id: TEST_USER_ID,
  components: [
    {
      type: "text",
      name: unique("full_name"),
      order: 1,
      properties: {
        label: "Full Name",
        required: true,
        defaultValue: "John Doe",
      },
    },
    {
      type: "number",
      name: unique("age"),
      order: 2,
      properties: {
        label: "Age",
        required: true,
        min: 18,
        max: 99,
        defaultValue: 30,
      },
    },
    {
      type: "select",
      name: unique("department"),
      order: 3,
      properties: {
        label: "Department",
        options: ["Sales", "Marketing", "Support"],
        defaultValue: "Marketing",
      },
    },
    {
      type: "checkbox",
      name: unique("interests"),
      order: 4,
      properties: {
        label: "Interests",
        options: ["Newsletters", "Events", "Offers"],
        defaultValue: ["Newsletters"],
      },
    },
  ],
});

const createForm = async (): Promise<CreatedForm> => {
  const response = await fetch(route("api/form/create"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildFormPayload()),
  });

  expect(response.status).toBe(201);
  return response.json();
};

const toNumericId = (id: number | string) => Number(id);

describe("Form Actions", () => {
  test("Submit Button – sends completed form data", async () => {
    const form = await createForm();

    const textComponent = form.components.find((c) => c.type === "text")!;
    const numberComponent = form.components.find((c) => c.type === "number")!;
    const selectComponent = form.components.find((c) => c.type === "select")!;
    const checkboxComponent = form.components.find((c) => c.type === "checkbox")!;

    const submitResponse = await fetch(route(`api/form/answer/${form.id}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        respondent_id: randomUUID(),
        answers: [
          { componentId: toNumericId(textComponent.id), value: "Alice Example" },
          { componentId: toNumericId(numberComponent.id), value: 28 },
          { componentId: toNumericId(selectComponent.id), value: "Sales" },
          {
            componentId: toNumericId(checkboxComponent.id),
            value: ["Events"],
          },
        ],
      }),
    });

    expect(submitResponse.status).toBe(201);

    const submitJson = await submitResponse.json();
    expect(submitJson.message).toMatch(/Form submitted successfully/);
    expect(Number(submitJson.submission.form_id)).toBe(Number(form.id));
    expect(
      submitJson.submission.answers[String(toNumericId(textComponent.id))]
    ).toBe("Alice Example");
    expect(
      submitJson.submission.answers[String(toNumericId(numberComponent.id))]
    ).toBe(28);
  });

  test("Reset/Clear – returns default component values", async () => {
    const form = await createForm();

    const clearResponse = await fetch(route(`api/form/clear/${form.id}`), {

      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(clearResponse.status).toBe(200);

    const clearJson = await clearResponse.json();
    expect(Number(clearJson.formId)).toBe(Number(form.id));

    const cleared = clearJson.clearedValues as Record<string, unknown>;
    form.components.forEach((component) => {
      const key = String(toNumericId(component.id));
      expect(cleared).toHaveProperty(key);

      switch (component.type) {
        case "text":
          expect(cleared[key]).toBe("John Doe");
          break;
        case "number":
          expect(cleared[key]).toBe(30);
          break;
        case "select":
          expect(cleared[key]).toBe("Marketing");
          break;
        case "checkbox":
          expect(cleared[key]).toEqual(["Newsletters"]);
          break;
        default:
          break;
      }
    });
  });
});