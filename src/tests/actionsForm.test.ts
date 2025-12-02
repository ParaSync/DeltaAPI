import { describe, expect, test } from 'bun:test';
import { randomUUID } from 'crypto';
import '../index';

const TEST_USER_ID = '892d56fa-50c6-43b3-86e9-f162329760a1';
const route = (s: string) => `http://localhost:3000/${s}`;
const unique = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

type CreatedForm = {
  id: string;
  components: Array<{
    id: string;
    type: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: Record<string, any>;
  }>;
};

const buildFormPayload = () => ({
  title: unique('ActionsForm'),
  userId: TEST_USER_ID, // align with API (userId)
  components: [
    {
      type: 'text',
      name: unique('full_name'),
      order: 1,
      properties: {
        label: 'Full Name',
        required: true,
        defaultValue: 'John Doe',
      },
    },
    {
      type: 'number',
      name: unique('age'),
      order: 2,
      properties: {
        label: 'Age',
        required: true,
        min: 18,
        max: 99,
        defaultValue: 30,
      },
    },
    {
      type: 'select',
      name: unique('department'),
      order: 3,
      properties: {
        label: 'Department',
        options: ['Sales', 'Marketing', 'Support'],
        defaultValue: 'Marketing',
      },
    },
    {
      type: 'checkbox',
      name: unique('interests'),
      order: 4,
      properties: {
        label: 'Interests',
        options: ['Newsletters', 'Events', 'Offers'],
        defaultValue: ['Newsletters'],
      },
    },
  ],
});

const createForm = async (): Promise<CreatedForm> => {
  const response = await fetch(route('api/form/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildFormPayload()),
  });

  expect(response.status).toBe(201);

  const json = await response.json();
  const created = json?.value ?? json;
  // created.id and component ids are strings per models
  return created as CreatedForm;
};

const toNumericId = (id: number | string) => Number(id);

describe('Form Actions', () => {
  test('Submit Button – sends completed form data', async () => {
    const form = await createForm();

    // locate components by their label (stable)
    const textComponent = form.components.find((c) => c.properties?.label === 'Full Name')!;
    const numberComponent = form.components.find((c) => c.properties?.label === 'Age')!;
    const selectComponent = form.components.find((c) => c.properties?.label === 'Department')!;
    const checkboxComponent = form.components.find((c) => c.properties?.label === 'Interests')!;

    expect(textComponent).toBeTruthy();
    expect(numberComponent).toBeTruthy();
    expect(selectComponent).toBeTruthy();
    expect(checkboxComponent).toBeTruthy();

    const submitResponse = await fetch(route(`api/form/answer/${form.id}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        respondent_id: randomUUID(),
        answers: [
          { componentId: toNumericId(textComponent.id), value: 'Alice Example' },
          { componentId: toNumericId(numberComponent.id), value: 28 },
          { componentId: toNumericId(selectComponent.id), value: 'Sales' },
          {
            componentId: toNumericId(checkboxComponent.id),
            value: ['Events'],
          },
        ],
      }),
    });

    expect(submitResponse.status).toBe(201);

    const submitJson = await submitResponse.json();
    expect(submitJson.message).toMatch(/Form submitted successfully/);

    const submission = submitJson?.value?.submission ?? null;
    expect(submission).toBeTruthy();
    expect(Number(submission.form_id)).toBe(Number(form.id));
    expect(submission.answers[String(toNumericId(textComponent.id))]).toBe('Alice Example');
    expect(submission.answers[String(toNumericId(numberComponent.id))]).toBe(28);
  });

  test('Reset/Clear – returns default component values', async () => {
    const form = await createForm();

    const clearResponse = await fetch(route(`api/form/clear/${form.id}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(clearResponse.status).toBe(200);

    const clearJson = await clearResponse.json();
    // API returns { message, value: { formId, clearedValues } }
    const value = clearJson?.value ?? clearJson;
    expect(String(value.formId)).toBe(String(form.id));

    const cleared = value.clearedValues as Record<string, unknown>;
    form.components.forEach((component) => {
      const key = String(toNumericId(component.id));
      expect(cleared).toHaveProperty(key);

      const label = component.properties?.label;
      switch (label) {
        case 'Full Name':
          expect(cleared[key]).toBe('John Doe');
          break;
        case 'Age':
          expect(cleared[key]).toBe(30);
          break;
        case 'Department':
          expect(cleared[key]).toBe('Marketing');
          break;
        case 'Interests':
          expect(cleared[key]).toEqual(['Newsletters']);
          break;
        default:
          break;
      }
    });
  });
});
