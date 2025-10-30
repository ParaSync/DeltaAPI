import { describe, expect, test, beforeAll, beforeEach, afterAll } from '@jest/globals';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-client-config.json';

import { route, dummyUser } from './utils';
import { Answer } from '../models/answers';

describe('Actions', () => {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const { email, password } = dummyUser;
  let user: User;
  let idToken: string;
  let headers: Headers;
  const formId = 999;
  const componentId = 239;
  let answers: Answer[];

  beforeAll(async () => {
    // Create a user
    const headers = new Headers();
    headers.append('Content-Type', 'application/json');
    const requestBody = JSON.stringify({ email, password });
    const config = { method: 'POST', headers, body: requestBody };
    await fetch(route('/create-user'), config);
  });

  beforeEach(async () => {
    // Log-in
    user = (await signInWithEmailAndPassword(auth, email, password)).user;
    idToken = await user.getIdToken();
    headers = new Headers();
    headers.append('Authorization', `Bearer ${idToken}`);
    headers.append('Content-Type', 'application/json');

    // Answer form
    answers = [
      {
        componentId,
        properties: { answer: 'David Tan' },
      },
    ];
  });

  test('User can submit answers to a form', async () => {
    const requestBody = JSON.stringify({ answers, formId });
    const config = { method: 'POST', headers, body: requestBody };
    const response = await fetch(route('/submit'), config);
    expect(response.status).toBe(200);
  });

  test('User can reset their answers', async () => {
    const requestBody = JSON.stringify({ answers });
    const config = { method: 'POST', headers, body: requestBody };
    const response = await fetch(route('/reset'), config);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(JSON.stringify([{ componentId }]));
  });

  afterAll(async () => {
    // Delete the user
    const config = { method: 'POST', headers };
    await fetch(route('/delete-user'), config);
  });
});
