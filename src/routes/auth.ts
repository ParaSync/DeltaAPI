import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { BodyType } from '../models/interfaces';

/**
 * Encapsulates routes
 * @param {FastifyInstance} fastify  Encapsulated Fastify Instance
 * @param {Object} options plugin options, refer to https://fastify.dev/docs/latest/Reference/Plugins/#plugin-options
 */
async function authRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/session',
    async (request: FastifyRequest<{ Body: BodyType }>, reply: FastifyReply) => {
      reply.send(request.headers.cookie);
    }
  );

  fastify.post(
    '/create-user',
    async (request: FastifyRequest<{ Body: BodyType }>, reply: FastifyReply) => {
      const replyPayload = { message: '', value: {} };
      const { auth } = request.server.firebase;
      const { email, password } = request.body;
      try {
        const userRecord = await auth().createUser({ email, password });
        replyPayload.message = 'Successfully created new user';
        replyPayload.value = userRecord;
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
      const replyPayload = { message: '', value: {} };
      const { auth } = request.server.firebase;
      const { updateRequest } = request.body;
      const uid = request.headers.uid;
      try {
        if (typeof uid == 'string') {
          await auth().updateUser(uid, updateRequest);
          replyPayload.message = 'Successfully updated user';
        } else {
          throw TypeError(`typeof request.headers.uid must be string, not ${typeof uid}`);
        }
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
      const replyPayload = { message: '', value: {} };

      const { auth } = request.server.firebase;
      const uid = request.headers.uid;
      try {
        if (typeof uid == 'string') {
          await auth().deleteUser(uid);
        } else {
          throw TypeError(`typeof request.headers.uid must be string, not ${typeof uid}`);
        }
        replyPayload.message = 'Successfully deleted user';
      } catch (error) {
        replyPayload.message = 'Error deleting user';
        replyPayload.value = JSON.stringify(error);
      }
      reply.send(replyPayload);
    }
  );
}

export default authRoutes;
