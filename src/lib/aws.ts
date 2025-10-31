// ! WARN This file requires .env to contain
// ! WARN AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_BUCKET_NAME

import 'dotenv/config';
import AWS from 'aws-sdk';

AWS.config.getCredentials((err) => {
  if (err) {
    console.log(err.stack);
    throw new Error('Missing AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY environment variables');
  } else {
    console.log('AWS credentials were read successfully.');
  }
});

AWS.config.update({ region: 'ap-southeast-1' });

export const s3 = new AWS.S3({ apiVersion: '2006-03-01' });

const { AWS_BUCKET_NAME } = process.env;
if (AWS_BUCKET_NAME == undefined) {
  throw Error('Missing AWS_BUCKET_NAME environment variable');
}

const bucketParams = { Bucket: AWS_BUCKET_NAME };

export type FileParams = {
  Key: string;
  Body: AWS.S3.Body;
};

/**
 * Upload a file to S3 and return the public location URL (if available).
 * Throws on underlying AWS errors.
 */
export async function uploadToAWS(fileParams: FileParams): Promise<string> {
  const uploadParams: AWS.S3.PutObjectRequest & { Bucket: string } = {
    ...bucketParams,
    ...fileParams,
  };
  try {
    const data = await s3.upload(uploadParams).promise();
    console.log('Upload Success', data.Location);
    return data.Location;
  } catch (err) {
    console.error('Error uploading to S3', err);
    throw err as Error;
  }
}

/**
 * Retrieve an object from S3. Returns the GetObjectOutput on success.
 * Throws on underlying AWS errors.
 */
export async function getFromAWS(fileName: string): Promise<AWS.S3.GetObjectOutput> {
  const getParams: AWS.S3.GetObjectRequest = { ...bucketParams, Key: fileName };
  try {
    const data = await s3.getObject(getParams).promise();
    console.log('Get Success');
    return data;
  } catch (err) {
    console.error('Error getting object from S3', err);
    throw err as Error;
  }
}

/**
 * Delete an object from S3. Returns true if deletion succeeded, false otherwise.
 */
export async function deleteFromAWS(fileName: string): Promise<boolean> {
  const deleteParams: AWS.S3.DeleteObjectRequest = { ...bucketParams, Key: fileName };
  try {
    await s3.deleteObject(deleteParams).promise();
    console.log('Delete Success');
    return true;
  } catch (err) {
    console.error('Error deleting object from S3', err);
    return false;
  }
}
