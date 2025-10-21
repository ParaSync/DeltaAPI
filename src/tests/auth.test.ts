import { describe, expect, test } from '@jest/globals';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import firebaseConfig from '../../firebase-client-config.json';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const route = (s: string) => `http://localhost:3000/${s}`;

describe('Authentication', () => {
  const email = 'test@example.com';
  const password = 'Password';
  const newPassword = 'Password2';
  const login = async (email: string, password: string) =>
    await signInWithEmailAndPassword(auth, email, password);

  test('Server does not send session cookie if not logged in', async () => {
    const response = await fetch(route('/session'));
    const responseBody = await response.text();

    expect(responseBody).toBeFalsy();
  });

  test('Server creates a new user', async () => {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');

    const requestBody = JSON.stringify({ email, password });

    const config = { method: 'POST', headers, body: requestBody };

    const response = await fetch(route('/create-user'), config);
    const { message, value: userRecord } = await response.json();

    expect(message).toBe('Successfully created new user');
    expect(userRecord).toHaveProperty('uid');
  });

  test('Server sends session cookie after logging in', async () => {
    const { user } = await login(email, password);
    const idToken = await user.getIdToken();

    const headers = new Headers();
    headers.append('Authorization', `Bearer ${idToken}`);

    const config = { method: 'GET', headers };

    const response = await fetch(route('/session'), config);
    const responseBody = await response.text();

    expect(responseBody).toBeTruthy();
  });

  test(`Server updates a user's password after logging in`, async () => {
    const { user } = await login(email, password);
    const idToken = await user.getIdToken();

    const headers = new Headers();
    headers.append('Authorization', `Bearer ${idToken}`);
    headers.append('Content-Type', 'application/json');

    const requestBody = JSON.stringify({ updateRequest: { password: newPassword } });

    const config = { method: 'POST', headers, body: requestBody };

    const response = await fetch(route('/update-user'), config);
    const { message } = await response.json();
    expect(message).toBe('Successfully updated user');
  });

  test(`Server deletes a user after logging in`, async () => {
    const { user } = await login(email, newPassword);
    const idToken = await user.getIdToken();

    const headers = new Headers();
    headers.append('Authorization', `Bearer ${idToken}`);

    const config = { method: 'POST', headers };

    const response = await fetch(route('/delete-user'), config);
    const { message } = await response.json();
    expect(message).toBe('Successfully deleted user');
  });
});
