import { describe, expect, test } from 'bun:test';

const TEST_USER_ID = '892d56fa-50c6-43b3-86e9-f162329760a1';
const route = (s: string) => `http://localhost:3000/${s}`;
const unique = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;

describe('Form Creation Route', () => {
  test('creates a form with ordered components', async () => {
    const body = {
      title: unique('ContactForm'),
      userId: TEST_USER_ID,
      components: [
        {
          type: 'text',
          name: unique('full_name'),
          order: 2,
          properties: { label: 'Full Name', required: true },
        },
        {
          type: 'select',
          name: unique('department'),
          order: 1,
          properties: {
            label: 'Department',
            options: ['Sales', 'Marketing', 'Support'],
          },
        },
      ],
    };

    const response = await fetch(route('api/form/create'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(201);

    const json = await response.json();
    const created = json?.value ?? json;

    expect(typeof created.id).toBe('string');
    expect(created.title).toBe(body.title);
    expect(Array.isArray(created.components)).toBe(true);
    expect(created.components.length).toBe(2);

    // components should be ordered ascending by their order property
    const orders = created.components.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (c: any) => c.order ?? c.properties?.order ?? 0
    );
    expect(orders).toEqual([...orders].sort((a: number, b: number) => a - b));

    // ensure the explicit order values are preserved
    expect(orders[0]).toBe(1);
    expect(orders[1]).toBe(2);
  });

  test('coerces unknown component types to default input type', async () => {
    const body = {
      title: unique('InvalidTypeForm'),
      userId: TEST_USER_ID,
      components: [{ type: 'email', name: unique('contact') }],
    };

    const response = await fetch(route('api/form/create'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    // API normalises unknown types to the default component type (input)
    expect(response.status).toBe(201);

    const json = await response.json();
    const created = json?.value ?? json;

    expect(typeof created.id).toBe('string');
    expect(Array.isArray(created.components)).toBe(true);
    expect(created.components.length).toBe(1);
    // component type should be the model-aligned default (e.g. "input")
    expect(created.components[0].type).toBe('input');
  });
});
