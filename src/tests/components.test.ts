import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import { route } from './util.js';

import '../index';

describe('Component Routes', () => {
  let componentId: string;
  const formId = 9999;

  beforeAll(() => {
    // TODO: Log in (for now, the component routes' uid check is commented out)
    // TODO: Create form and get formId
  });

  afterAll(() => {
    // TODO: Delete form using formId
  });

  test('creates a new text input component', async () => {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    const properties = {
      name: 'first-name',
      type: 'input',
      input: {
        type: 'text',
        placeholder: 'First Name',
        required: true,
      },
    };
    const body = JSON.stringify({
      formId,
      properties,
    });
    const config = { method: 'POST', headers, body };
    const createResult = await fetch(route('/api/form/input/create'), config);
    console.log(await createResult.json());
    expect(createResult.status).toBe(200);
  });

  test('creates a new image component', async () => {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    const properties = {
      name: 'hero',
      type: 'image',
      image: {
        name: 'hero-img.png',
        data: await new Blob(['pretend this is imagedata'], { type: 'image/png' }).text(),
        placeholder: 'A big hero image.',
      },
    };
    const body = JSON.stringify({
      formId, // test form in Supabase
      properties,
    });
    const config = { method: 'POST', headers, body };
    const createResult = await fetch(route('/api/form/image/create'), config);
    const createResultJson = await createResult.json();
    console.log(createResultJson);
    componentId = createResultJson.value.component_id;
    expect(createResult.status).toBe(200);
  });

  test('fetches components for a form', async () => {
    const response = await fetch(route(`/api/form/${formId}/list-components`));
    const json = await response.json();

    expect(Array.isArray(json)).toBe(true);
    expect(json.length).toBeGreaterThan(0); // should now pass
  });

  test('edits component', async () => {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    const properties = {
      name: 'new-hero',
      type: 'image',
      image: {
        name: 'new-hero-img.png',
        data: await new Blob(['pretend this is edited imagedata'], { type: 'image/png' }).text(),
        placeholder: 'A big hero image, but edited.',
      },
    };
    const body = JSON.stringify({ formId, componentId, properties });
    const config = { method: 'POST', headers, body };
    console.log(componentId);
    const editResult = await fetch(route('/api/form/image/edit'), config);
    console.log(await editResult.json());
    expect(editResult.status).toBe(200);
  });

  test('deletes component', async () => {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    const body = JSON.stringify({ formId, componentId });
    const config = { method: 'POST', headers, body };
    const deleteResult = await fetch(route('/api/form/image/delete'), config);
    console.log(await deleteResult.json());
    expect(deleteResult.status).toBe(200);
  });
});
