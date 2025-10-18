import { describe, expect, test } from '@jest/globals';
import { isStringLiteral } from 'typescript';

const url = 'http://localhost:3000/';

test('Server returns an error when fetching undefined routes', async () => {
  const response = await fetch(`${url}some-invalid-route-that-does-not-exist`);
  const body = await response.json();
  expect(body.statusCode).toBe(404);
});

test('Server does not send session cookie if one does not exist yet', async () => {
  const response = await fetch(`${url}session`);
  const body = await response.text();
  console.log(`/session response body: '${body}'`);
  expect(body).toBeFalsy();
});

describe('Server', () => {
  let TEST_USER_UID: string;

  test('creates a new user', async () => {
    const config = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'justin-test5@example.com',
        password: '123456',
      }),
    };
    const response = await fetch(`${url}create-user`, config);
    const body = await response.json();
    const userRecord = body.value;
    console.log(`body: '${JSON.stringify(body)}'`);

    expect(body.message).toBe('Successfully created new user');
    expect(userRecord).toHaveProperty('uid');

    TEST_USER_UID = userRecord.uid;
  });

  test('updates a user', async () => {
    const config = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uid: TEST_USER_UID,
        updateRequest: {
          password: 'myCoolerPassword'
        }
      }),
    };
    const response = await fetch(`${url}update-user`, config);
    const body = await response.json();
    expect(body.message).toBe('Successfully updated user');
  });

  test('deletes a user', async () => {
    const config = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        uid: TEST_USER_UID,
      }),
    };
    const response = await fetch(`${url}delete-user`, config);
    const body = await response.json();
    expect(body.message).toBe('Successfully deleted user');
  });
});
