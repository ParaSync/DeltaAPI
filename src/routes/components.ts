import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import 'dotenv/config';
import { pool } from '../lib/pg_pool';
import {
  BodyType,
  ComponentProperties,
  ImageProperties,
  ReplyPayload,
} from '../models/interfaces.js';
import { deleteFromAWS, uploadToAWS } from '../lib/aws.js';
import { randomUUID } from 'crypto';
import { DatabaseError } from 'pg';

async function componentRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/api/form/:componentType/create',
    async (request: FastifyRequest<{ Body: BodyType }>, reply: FastifyReply) => {
      const { uid } = request.headers;
      let replyPayload: ReplyPayload;

      // Uncomment to let only authenticated clients create components:
      // if (typeof uid != 'string') {
      //   replyPayload = { 'message': 'Forbidden', 'value': 'You need to be logged in to create components (and forms).' };
      //   return reply.status(403).send(replyPayload);
      // }

      const { componentType } = request.params as { componentType: string };
      const { formId } = request.body;
      let { properties } = request.body;

      validateComponent(componentType, properties);

      const { name } = properties;
      const queryText =
        'INSERT INTO components (form_id, properties, name, type) VALUES ($1, $2, $3, $4) RETURNING id';
      const values = [formId, properties, name, componentType];

      switch (componentType) {
        case 'image':
          // "as string" added to make testing easier
          properties = await handleCreateImageComponent(
            uid as string,
            properties as ImageProperties
          );
          break;
      }

      try {
        const queryResult = await pool.query(queryText, values);
        replyPayload = { message: 'Component created successfully', value: queryResult.rows[0] };
        return reply.status(200).send(replyPayload);
      } catch (err: unknown) {
        if (err instanceof DatabaseError) {
          replyPayload = { message: 'DatabaseError', value: err.message };
          return reply.status(500).send(replyPayload);
        } else if (err instanceof Error) {
          replyPayload = { message: err.name, value: err.message };
          return reply.status(500).send(replyPayload);
        }
      }

      replyPayload = { message: 'Unknown error', value: 'An uncaught error has occurred.' };
      return reply.status(500).send();
    }
  );

  fastify.post(
    '/api/form/component/delete',
    async (request: FastifyRequest<{ Body: BodyType }>, reply: FastifyReply) => {
      const { formId, componentId } = request.body;
      const queryText =
        'DELETE FROM components WHERE form_id = $1 AND id = $2 RETURNING id, form_id, properties, type';
      const values = [formId, componentId];
      let replyPayload: ReplyPayload;

      try {
        const queryResult = await pool.query(queryText, values);
        const { properties, type: componentType } = queryResult.rows[0];
        switch (componentType) {
          case 'image':
            handleDeleteImageComponent(properties);
            break;
        }
        replyPayload = { message: 'Component deleted successfully', value: queryResult };
        return reply.status(200).send(replyPayload);
      } catch (err: unknown) {
        if (err instanceof DatabaseError) {
          replyPayload = { message: 'DatabaseError', value: err.message };
          return reply.status(500).send(replyPayload);
        } else if (err instanceof Error) {
          replyPayload = { message: err.name, value: err.message };
          return reply.status(500).send(replyPayload);
        }
      }
    }
  );

  // Get all components for a form
  fastify.get('/api/form/:id/list-components', async (req, reply) => {
    const { id } = req.params as { id: string };
    const result = await pool.query('SELECT * FROM components WHERE form_id = $1;', [id]);
    return reply.send(result.rows);
  });
}

function validateComponent(componentType: string, properties: ComponentProperties) {
  console.log(
    `Validating ${componentType} component with properties ${properties} is a TODO feature.`
  );
  // TODO
}

async function handleCreateImageComponent(
  userId: string,
  properties: ImageProperties
): Promise<ImageProperties> {
  // Upload the image to AWS, then set the `location` to be the AWS link to the image, and unset the `data` field.
  if (
    properties.image &&
    properties.image != undefined &&
    properties.image.name != undefined &&
    properties.image.data != undefined
  ) {
    const key = `${userId}/${randomUUID()}/${properties.image.name}`;
    properties.image.location = await uploadToAWS({ Key: key, Body: properties.image.data });
    delete properties.image.data;
  } else {
    throw Error('Image component requested to be created, but image properties are undefined');
  }
  return properties;
}

async function handleDeleteImageComponent(properties: ImageProperties): Promise<boolean> {
  // Delete the image from AWS.
  const { location } = properties.image;
  if (location != undefined) {
    return deleteFromAWS(location);
  } else {
    throw Error('Image component requested to be deleted, but image location is undefined');
  }
}

export default componentRoutes;
