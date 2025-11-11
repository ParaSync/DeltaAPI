import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import 'dotenv/config';
import { BodyType, ReplyPayload } from '../models/interfaces';
import { pool } from '../lib/pg_pool';

//! WARN Currently we assume that the Firebase and Supabase servers
//! WARN are in sync. If a user exists in only one of them, stuff will break.

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
      const replyPayload: ReplyPayload = { message: '', value: {} };
      const { auth } = request.server.firebase;
      const { email, password } = request.body;
      try {
        const userRecord = await auth().createUser({ email, password });

        // Also create user record in Supabase
        const queryText = `INSERT INTO users (username) VALUES ($1) RETURNING id`;
        const result = await pool.query(queryText, [email]);
        console.log(`Insert result: `);
        console.log(result.rows);
        fastify.log.info(`email = ${email}; id = ${result.rows[0].id}`);
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
      const replyPayload: ReplyPayload = { message: '', value: {} };
      const { auth } = request.server.firebase;
      const { updateRequest } = request.body;
      const uid = request.headers.uid;
      try {
        if (typeof uid == 'string') {
          await auth().updateUser(uid, updateRequest);
          // Also update user record in Supabase
          const { email } = updateRequest;
          if (email) {
            const oldEmail = (await auth().getUser(uid)).email;
            const queryText = `UPDATE users SET username = ($1) WHERE username = ($2) RETURNING *`;
            const queryResult = await pool.query(queryText, [email, oldEmail]);
            console.log(`Update result: `);
            console.log(queryResult.rows);
          }
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
      const replyPayload: ReplyPayload = { message: '', value: {} };

      const { auth } = request.server.firebase;
      const uid = request.headers.uid;
      try {
        if (typeof uid == 'string') {
          const email = (await auth().getUser(uid)).email;
          await auth().deleteUser(uid);
          // Also delete user record in Supabase
          const queryText = `DELETE FROM users WHERE username = ($1) RETURNING *`;
          const queryResult = await pool.query(queryText, [email]);
          console.log(`Delete result: `);
          console.log(queryResult.rows);
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
