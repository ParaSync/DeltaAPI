import { describe, expect, test } from 'bun:test';

const route = (s: string) => `http://localhost:3000/${s}`;

const buildFormPayload = () => ({
  title: `ViewResponseForm ${Date.now()}-${Math.floor(Math.random() * 1000)}`,
  userId: '892d56fa-50c6-43b3-86e9-f162329760a1',
  components: [
    {
      type: 'text',
      name: `full_name_${Date.now()}`,
      order: 1,
      properties: {
        label: 'Full Name',
        required: true,
      },
    },
    {
      type: 'number',
      name: `age_${Date.now()}`,
      order: 2,
      properties: {
        label: 'Age',
        required: true,
        min: 0,
      },
    },
  ],
});

const createForm = async () => {
  const response = await fetch(route('api/form/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildFormPayload()),
  });

  expect(response.status).toBe(201);
  const json = await response.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json?.value ?? json) as any;
};

describe('View Form Response Route', () => {
  test('returns the correct form and answers for a submission', async () => {
    const form = await createForm();

    // pick components and build answers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const textComponent = form.components.find((c: any) => c.properties?.label === 'Full Name');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const numberComponent = form.components.find((c: any) => c.properties?.label === 'Age');

    expect(textComponent).toBeTruthy();
    expect(numberComponent).toBeTruthy();

    const textValue = 'Alice Example';
    const numberValue = 42;

    // submit answers
    const submitResp = await fetch(route(`api/form/answer/${form.id}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        respondent_id: '892d56fa-50c6-43b3-86e9-f162329760a1',
        answers: [
          { componentId: parseInt(String(textComponent.id)), value: textValue },
          { componentId: parseInt(String(numberComponent.id)), value: numberValue },
        ],
      }),
    });

    const submitJson = await submitResp.json();
    expect(submitResp.status).toBe(201);
    const submission = submitJson?.value?.submission ?? submitJson?.submission ?? null;
    expect(submission).toBeTruthy();

    const submissionId = submission.id;

    // fetch the combined form + submission answers
    const viewResp = await fetch(route(`api/form/answers/${form.id}/${submissionId}`));
    expect(viewResp.status).toBe(200);
    const viewJson = await viewResp.json();

    const returnedForm = viewJson?.value?.form ?? viewJson?.form ?? null;
    const returnedSubmission = viewJson?.value?.submission ?? viewJson?.submission ?? null;

    expect(returnedForm).toBeTruthy();
    expect(String(returnedForm.id)).toBe(String(form.id));
    expect(Array.isArray(returnedForm.components)).toBe(true);

    expect(returnedSubmission).toBeTruthy();
    expect(Number(returnedSubmission.form_id)).toBe(Number(form.id));
    expect(returnedSubmission.answers[String(textComponent.id)]).toBe(textValue);
    expect(returnedSubmission.answers[String(numberComponent.id)]).toBe(numberValue);
  });
});
