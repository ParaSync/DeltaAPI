import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isStringObject } from 'util/types';
import { BodyType } from '../models/interfaces';

/**
 * Encapsulates routes
 * @param {FastifyInstance} fastify  Encapsulated Fastify Instance
 * @param {Object} options plugin options, refer to https://fastify.dev/docs/latest/Reference/Plugins/#plugin-options
 */
async function authRoutes(fastify: FastifyInstance, options: Object) {
  fastify.get(
    '/session',
    async (request: FastifyRequest<{ Body: BodyType }>, reply: FastifyReply) => {
      reply.send(request.headers.cookie);
    }
  );

  fastify.post(
    '/create-user',
    async (request: FastifyRequest<{ Body: BodyType }>, reply: FastifyReply) => {
      const replyPayload = {
        message: '',
        value: {},
      };
      const { auth } = request.server.firebase;
      const { email, password } = request.body;
      try {
        request.log.info('Attempting to create user');
        const userRecord = await auth().createUser({ email, password });
        const token = await auth().createCustomToken(userRecord.uid);
        replyPayload.message = 'Successfully created new user';
        replyPayload.value = {...userRecord, token};
      } catch (error) {
        replyPayload.message = 'Error creating new user';
        replyPayload.value = JSON.stringify(error);
      }
      reply.send(replyPayload);
    }
  );

  fastify.post(
    '/update-user',
    async (request: FastifyRequest<{ Body: BodyType }>, reply: FastifyReply) => {
      const replyPayload = {
        message: '',
        value: {},
      };
      const { auth } = request.server.firebase;
      const { uid, updateRequest } = request.body;
      try {
        request.log.info('Attempting to update user');
        await auth().updateUser(uid, updateRequest);
        replyPayload.message = 'Successfully updated user';
      } catch (error) {
        replyPayload.message = 'Error updating user';
        replyPayload.value = JSON.stringify(error);
      }
      reply.send(replyPayload);
    }
  );

  fastify.post(
    '/delete-user',
    async (request: FastifyRequest<{ Body: BodyType }>, reply: FastifyReply) => {
      const replyPayload = {
        message: '',
        value: {},
      };
      const { auth } = request.server.firebase;
      const { uid } = request.body;
      try {
        request.log.info('Attempting to delete user');
        await auth().deleteUser(uid);
        replyPayload.message = 'Successfully deleted user';
      } catch (error) {
        replyPayload.message = 'Error deleting user';
      }
      reply.send(replyPayload);
    }
  );
}

export default authRoutes;
