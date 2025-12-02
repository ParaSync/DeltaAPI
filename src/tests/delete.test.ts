import { describe, expect, test } from 'bun:test';

const TEST_USER_ID = '892d56fa-50c6-43b3-86e9-f162329760a1';
const route = (s: string) => `http://localhost:3000/${s}`;

const unique = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

const createForm = async () => {
  const response = await fetch(route('api/form/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: unique('DeleteTestForm'),
      userId: TEST_USER_ID, // API expects userId (not user_id)
      components: [
        {
          type: 'radio', // will be normalised by the API (defaults to 'input')
          name: unique('choice'),
          properties: {
            label: 'Pick one',
            options: ['Option A', 'Option B'],
            order: 1,
          },
        },
      ],
    }),
  });

  expect(response.status).toBe(201);
  const json = await response.json();
  // API returns { message, value: <createdForm> }
  const createdForm = json?.value ?? json;
  return createdForm;
};

describe('Form Deletion Route', () => {
  test('requires confirmation flag before deletion', async () => {
    const form = await createForm();

    const deleteResponse = await fetch(route(`api/form/delete/${form.id}`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: false }),
    });

    expect(deleteResponse.status).toBe(400);

    const deleteJson = await deleteResponse.json();
    // API uses ReplyPayload { message, value }
    expect(deleteJson.message).toBe('Confirmation required before deleting form.');
    expect(deleteJson.value).toBeDefined();
    expect(deleteJson.value.hint).toBeDefined();
  });

  test('deletes a form after confirmation', async () => {
    const form = await createForm();

    const deleteResponse = await fetch(route(`api/form/delete/${form.id}`), {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });

    expect(deleteResponse.status).toBe(200);

    const deleteJson = await deleteResponse.json();
    expect(typeof deleteJson.message).toBe('string');
    expect(deleteJson.message).toContain('deleted');
    // API returns value: { formId: "<id>" }
    expect(deleteJson.value).toBeDefined();
    expect(deleteJson.value.formId).toBe(String(form.id));
  });
});
