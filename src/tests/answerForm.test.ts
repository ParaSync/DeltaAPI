import { describe, expect, test } from 'bun:test';
import '../index';

const route = (s: string) => `http://localhost:3000/${s}`;

type CreatedForm = {
  id: number | string;
  title: string;
  components: Array<{
    id: number | string;
    type: string;
    name?: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    properties: Record<string, any>;
  }>;
};

const buildFormPayload = () => ({
  title: `Form ${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  userId: '892d56fa-50c6-43b3-86e9-f162329760a1', // API expects userId
  components: [
    {
      type: 'text',
      name: `full_name_${Date.now()}`,
      order: 1,
      properties: {
        label: 'Full Name',
        required: true,
        minLength: 2,
        maxLength: 50,
      },
    },
    {
      type: 'number',
      name: `age_${Date.now()}`,
      order: 2,
      properties: {
        label: 'Age',
        required: true,
        min: 18,
        max: 99,
        step: 1,
      },
    },
    {
      type: 'select',
      name: `department_${Date.now()}`,
      order: 3,
      properties: {
        label: 'Department',
        options: ['Sales', 'Marketing', 'Support'],
      },
    },
    {
      type: 'checkbox',
      name: `interests_${Date.now()}`,
      order: 4,
      properties: {
        label: 'Interests',
        options: ['Newsletters', 'Events', 'Offers'],
        maxSelections: 2,
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
  // API responses use { message, value }
  const created = json?.value ?? json;
  return created as CreatedForm;
};

const dumpOnError = async (resp: Response) => {
  if (resp.status >= 400) {
    try {
      const j = await resp.json();
      console.error('HTTP', resp.status, JSON.stringify(j, null, 2));
    } catch {
      console.error('HTTP', resp.status, 'failed to parse JSON body');
    }
  }
};

describe('Form Listing, Detail, and Answer Routes', () => {
  test('lists forms and includes newly created form with ordered components', async () => {
    const form = await createForm();

    const listResponse = await fetch(route('api/form/list'));
    expect(listResponse.status).toBe(200);

    const listJson = await listResponse.json();
    const forms = listJson?.value?.forms ?? listJson?.forms ?? [];
    expect(Array.isArray(forms)).toBe(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const found = forms.find((entry: any) => String(entry.id) === String(form.id));
    expect(found).toBeTruthy();
    expect(Array.isArray(found.components)).toBe(true);

    const orders = found.components.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (component: any) => component.properties?.order ?? component.order ?? 0
    );
    const sortedOrders = [...orders].sort((a: number, b: number) => a - b);
    expect(orders).toEqual(sortedOrders);
  });

  test('fetches form details for a given form ID', async () => {
    const form = await createForm();

    const detailResponse = await fetch(route(`api/form/answer/${form.id}`));
    expect(detailResponse.status).toBe(200);

    const detailJson = await detailResponse.json();
    const detailedForm = detailJson?.value?.form ?? detailJson?.form ?? null;
    expect(detailedForm).toBeTruthy();
    expect(String(detailedForm.id)).toBe(String(form.id));
    expect(detailedForm.title).toBe(form.title);
    expect(Array.isArray(detailedForm.components)).toBe(true);
    expect(detailedForm.components.length).toBe(form.components.length);
  });

  test('accepts valid answers for a form', async () => {
    const form = await createForm();

    // find components by their label (stable across normalization)
    const textComponent = form.components.find((c) => c.properties?.label === 'Full Name')!;
    const numberComponent = form.components.find((c) => c.properties?.label === 'Age')!;
    const selectComponent = form.components.find((c) => c.properties?.label === 'Department')!;
    const checkboxComponent = form.components.find((c) => c.properties?.label === 'Interests')!;

    expect(textComponent).toBeTruthy();
    expect(numberComponent).toBeTruthy();
    expect(selectComponent).toBeTruthy();
    expect(checkboxComponent).toBeTruthy();

    const validTextValue = 'A'.repeat(Number(textComponent.properties?.minLength ?? 1));

    const answerResponse = await fetch(route(`api/form/answer/${form.id}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        respondent_id: '892d56fa-50c6-433b-86e9-f162329760a1',
        answers: [
          { componentId: parseInt(String(textComponent.id)), value: validTextValue },
          {
            componentId: parseInt(String(numberComponent.id)),
            value: numberComponent.properties.min,
          },
          {
            componentId: parseInt(String(selectComponent.id)),
            value: selectComponent.properties.options[0],
          },
          {
            componentId: parseInt(String(checkboxComponent.id)),
            value: checkboxComponent.properties.options.slice(
              0,
              checkboxComponent.properties.maxSelections
            ),
          },
        ],
      }),
    });

    await dumpOnError(answerResponse);
    expect(answerResponse.status).toBe(201);

    const json = await answerResponse.json();
    expect(json.message).toBe('Form submitted successfully.');
    const submission = json?.value?.submission ?? json?.submission ?? null;
    expect(submission).toBeTruthy();
    expect(Number(submission.form_id)).toBe(Number(form.id));
    expect(submission.answers[String(textComponent.id)]).toBe(validTextValue);
  });

  test('rejects submission with missing required answers', async () => {
    const form = await createForm();

    const textComponent = form.components.find((c) => c.properties?.label === 'Full Name')!;
    const numberComponent = form.components.find((c) => c.properties?.label === 'Age')!;
    const selectComponent = form.components.find((c) => c.properties?.label === 'Department')!;
    const checkboxComponent = form.components.find((c) => c.properties?.label === 'Interests')!;

    const answerResponse = await fetch(route(`api/form/answer/${form.id}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        respondent_id: '892d56fa-50c6-43b-86e9-f162329760a1',
        answers: [
          { componentId: parseInt(String(textComponent.id)), value: '' },
          {
            componentId: parseInt(String(numberComponent.id)),
            value: numberComponent.properties.min,
          },
          {
            componentId: parseInt(String(selectComponent.id)),
            value: selectComponent.properties.options[0],
          },
          {
            componentId: parseInt(String(checkboxComponent.id)),
            value: checkboxComponent.properties.options.slice(
              0,
              checkboxComponent.properties.maxSelections
            ),
          },
        ],
      }),
    });

    expect(answerResponse.status).toBe(400);

    const json = await answerResponse.json();
    // API returns the validation message in `message`
    expect(typeof json.message).toBe('string');
    expect(json.message.toLowerCase()).toContain('required');
  });
});
