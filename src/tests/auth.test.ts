import { describe, expect, test } from 'bun:test';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { route } from './util.js';


import '../index';
import { randomInt } from 'crypto';
import 'dotenv/config';

const firebaseConfig = JSON.parse(process.env.FIREBASE_CLIENT_CONFIG as string);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

describe('Authentication', () => {
  const email = `test-old+${randomInt(2 ** 32)}@example.com`;
  const password = 'Password1';
  const newEmail = `test-new+${randomInt(2 ** 32)}@example.com`;
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

  test(`Update a user without a email`, async () => {
    const { user } = await login(email, password);
    const idToken = await user.getIdToken();

    const headers = new Headers();
    headers.append('Authorization', `Bearer ${idToken}`);
    headers.append('Content-Type', 'application/json');

    const requestBody = JSON.stringify({
      updateRequest: { password: newPassword, email: '' },
    });

    const config = { method: 'POST', headers, body: requestBody };

    const response = await fetch(route('/update-user'), config);
    const { message } = await response.json();
    expect(message).toBe('Error updating user');
  });

  test(`Update a user without a password`, async () => {
    const { user } = await login(email, password);
    const idToken = await user.getIdToken();

    const headers = new Headers();
    headers.append('Authorization', `Bearer ${idToken}`);
    headers.append('Content-Type', 'application/json');

    const requestBody = JSON.stringify({
      updateRequest: { password: '', email: newEmail },
    });

    const config = { method: 'POST', headers, body: requestBody };

    const response = await fetch(route('/update-user'), config);
    const { message } = await response.json();
    expect(message).toBe('Error updating user');
  });

  test(`Server updates a user's password and email after logging in`, async () => {
    const { user } = await login(email, password);
    const idToken = await user.getIdToken();

    const headers = new Headers();
    headers.append('Authorization', `Bearer ${idToken}`);
    headers.append('Content-Type', 'application/json');

    const requestBody = JSON.stringify({
      updateRequest: { password: newPassword, email: newEmail },
    });

    const config = { method: 'POST', headers, body: requestBody };

    const response = await fetch(route('/update-user'), config);
    const { message } = await response.json();
    expect(message).toBe('Successfully updated user');
  });

  test(`Server deletes a user after logging in`, async () => {
    const { user } = await login(newEmail, newPassword);
    const idToken = await user.getIdToken();

    const headers = new Headers();
    headers.append('Authorization', `Bearer ${idToken}`);

    const config = { method: 'POST', headers };

    const response = await fetch(route('/delete-user'), config);
    const { message } = await response.json();
    expect(message).toBe('Successfully deleted user');
  });

  test(`User is created with an empty email`, async () => {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');

    const requestBody = JSON.stringify({ email: '', password });

    const config = { method: 'POST', headers, body: requestBody };

    const response = await fetch(route('/create-user'), config);
    const { message } = await response.json();

    expect(message).toBe('Error creating new user');
  });

  test(`User is created without an email`, async () => {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');

    const requestBody = JSON.stringify({ password });

    const config = { method: 'POST', headers, body: requestBody };

    const response = await fetch(route('/create-user'), config);
    const { message } = await response.json();

    expect(message).toBe('Error creating new user');
  });

  test(`User is created with an empty password`, async () => {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');

    const requestBody = JSON.stringify({ email, password: '' });

    const config = { method: 'POST', headers, body: requestBody };

    const response = await fetch(route('/create-user'), config);
    const { message } = await response.json();

    expect(message).toBe('Error creating new user');
  });

  test(`User is created without a password`, async () => {
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');

    const requestBody = JSON.stringify({ password });

    const config = { method: 'POST', headers, body: requestBody };

    const response = await fetch(route('/create-user'), config);
    const { message } = await response.json();

    expect(message).toBe('Error creating new user');
  });
});
