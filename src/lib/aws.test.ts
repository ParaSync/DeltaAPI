import { describe, expect, test } from '@jest/globals';
import { uploadToAWS, getFromAWS, deleteFromAWS } from './aws';

describe('AWS', () => {
  test('Can upload, read, and delete a file', async () => {
    const location = await uploadToAWS({ Key: 'test.txt', Body: 'Hello world!' });
    expect(location).toBeDefined();

    const getResult = await getFromAWS('test.txt');
    expect(getResult?.Body?.toString()).toBe('Hello world!');

    const deleteResult = await deleteFromAWS('test.txt');
    expect(deleteResult).toBeTruthy();
  });
});
