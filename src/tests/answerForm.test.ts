import { describe, expect, test } from "@jest/globals";

const route = (s: string) => `http://localhost:3000/${s}`;

type CreatedForm = {
  id: number | string;
  title: string;
  components: Array<{
    id: number | string;
    type: string;
    name?: string;
    properties: Record<string, any>;
  }>;
};

const buildFormPayload = () => ({
  title: `Form ${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  user_id: "892d56fa-50c6-43b3-86e9-f162329760a1",
  components: [
    {
      type: "text",
      name: `full_name_${Date.now()}`,
      order: 1,
      properties: {
        label: "Full Name",
        required: true,
        minLength: 2,
        maxLength: 50,
      },
    },
    {
      type: "number",
      name: `age_${Date.now()}`,
      order: 2,
      properties: {
        label: "Age",
        required: true,
        min: 18,
        max: 99,
        step: 1,
      },
    },
    {
      type: "select",
      name: `department_${Date.now()}`,
      order: 3,
      properties: {
        label: "Department",
        options: ["Sales", "Marketing", "Support"],
      },
    },
    {
      type: "checkbox",
      name: `interests_${Date.now()}`,
      order: 4,
      properties: {
        label: "Interests",
        options: ["Newsletters", "Events", "Offers"],
        maxSelections: 2,
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

  return (await response.json()) as CreatedForm;
};

describe("Form Listing, Detail, and Answer Routes", () => {
  test("lists forms and includes newly created form with ordered components", async () => {
    const form = await createForm();

    const listResponse = await fetch(route("api/form/list"));
    expect(listResponse.status).toBe(200);

    const { forms } = await listResponse.json();
    expect(Array.isArray(forms)).toBe(true);

    const found = forms.find((entry: any) => entry.id === form.id);
    expect(found).toBeTruthy();
    expect(Array.isArray(found.components)).toBe(true);

    const orders = found.components.map(
      (component: any) => component.properties?.order ?? 0
    );
    const sortedOrders = [...orders].sort((a, b) => a - b);
    expect(orders).toEqual(sortedOrders);
  });

  test("fetches form details for a given form ID", async () => {
    const form = await createForm();

    const detailResponse = await fetch(route(`api/form/answer/${form.id}`));
    expect(detailResponse.status).toBe(200);

    const { form: detailedForm } = await detailResponse.json();
    expect(detailedForm.id).toBe(form.id);
    expect(detailedForm.title).toBe(form.title);
    expect(Array.isArray(detailedForm.components)).toBe(true);
    expect(detailedForm.components.length).toBe(form.components.length);
  });

  test("accepts valid answers for a form", async () => {
    const form = await createForm();

    const textComponent = form.components.find((c) => c.type === "text")!;
    const numberComponent = form.components.find((c) => c.type === "number")!;
    const selectComponent = form.components.find((c) => c.type === "select")!;
    const checkboxComponent = form.components.find((c) => c.type === "checkbox")!;

    const validTextValue = "A".repeat(textComponent.properties.minLength);

    const answerResponse = await fetch(
      route(`api/form/answer/${form.id}`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          respondent_id: "892d56fa-50c6-43b3-86e9-f162329760a1",
          answers: [
            { componentId: parseInt(String(textComponent.id)), value: validTextValue },
            { componentId: parseInt(String(numberComponent.id)), value: numberComponent.properties.min },
            { componentId: parseInt(String(selectComponent.id)), value: selectComponent.properties.options[0] },
            {
              componentId: parseInt(String(checkboxComponent.id)),
              value: checkboxComponent.properties.options.slice(0, checkboxComponent.properties.maxSelections),
            },
          ],
        }),
      }
    );

    expect(answerResponse.status).toBe(201);

    const json = await answerResponse.json();
    expect(json.message).toBe("Form submitted successfully.");
    expect(json.submission.form_id).toBe(parseInt(String(form.id)));
    expect(json.submission.answers[String(textComponent.id)]).toBe(validTextValue);
  });

  test("rejects submission with missing required answers", async () => {
    const form = await createForm();

    const textComponent = form.components.find((c) => c.type === "text")!;
    const numberComponent = form.components.find((c) => c.type === "number")!;
    const selectComponent = form.components.find((c) => c.type === "select")!;
    const checkboxComponent = form.components.find((c) => c.type === "checkbox")!;

    const answerResponse = await fetch(
      route(`api/form/answer/${form.id}`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          respondent_id: "892d56fa-50c6-43b3-86e9-f162329760a1",
          answers: [
            { componentId: parseInt(String(textComponent.id)), value: "" },
            { componentId: parseInt(String(numberComponent.id)), value: numberComponent.properties.min },
            { componentId: parseInt(String(selectComponent.id)), value: selectComponent.properties.options[0] },
            {
              componentId: parseInt(String(checkboxComponent.id)),
              value: checkboxComponent.properties.options.slice(0, checkboxComponent.properties.maxSelections),
            },
          ],
        }),
      }
    );

    expect(answerResponse.status).toBe(400);

    const json = await answerResponse.json();
    expect(json.error).toContain("required");
  });
});