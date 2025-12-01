import Fastify from 'fastify';
import { FastifyReply, FastifyRequest } from 'fastify';
import fastifyFirebase from 'fastify-firebase';
import authRoutes from './routes/auth';
import uploadRoutes from './routes/upload';
import componentRoutes from './routes/components';
import { BodyType } from './models/routes';
import createFormRoutes from './api/form/create.js';
import listFormRoutes from './api/form/list.js';
import formAnswerRoutes from './api/form/answer/[formID].js';
import formClearRoutes from './api/form/clear/[formID].js';
import formDeleteRoutes from './api/form/delete/[formID].js';
import inputCreateRoutes from './api/form/inputs/create.js';
import viewFormResponsesRoutes from './api/form/[formID]/answers.js';
import 'dotenv/config';
import cors from '@fastify/cors';

const fastify = Fastify({
  logger: {
    level: 'debug',
    transport: {
      target: 'pino-pretty',
    },
  },
});

fastify.register(cors, {
  origin: '*', // set your frontend origin here
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

const fastifyServiceAccountConfig = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT as string);
fastify.register(fastifyFirebase, fastifyServiceAccountConfig);
fastify.register(authRoutes);
fastify.register(uploadRoutes);
fastify.register(componentRoutes);
fastify.register(createFormRoutes);
fastify.register(listFormRoutes);
fastify.register(formAnswerRoutes);
fastify.register(formClearRoutes, { prefix: '/api/form' });
fastify.register(formDeleteRoutes);
fastify.register(inputCreateRoutes);
fastify.register(viewFormResponsesRoutes);

// Authentication hook
fastify.addHook(
  'onRequest',
  async (request: FastifyRequest<{ Body: BodyType }>, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    const firebase = request.server.firebase;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      request.body = { ...request.body, loggedIn: false };
      request.log.warn(`AuthHook: Auth header missing or invalid`);
      return;
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
      const decodedToken = await firebase.auth().verifyIdToken(idToken);
      if (decodedToken.uid) {
        const expiresIn = 1209600000; // 2 weeks (in milliseconds), Firebase limit
        const cookie = await firebase.auth().createSessionCookie(idToken, { expiresIn });
        request.headers.cookie = cookie;
        request.headers.uid = decodedToken.uid;
      }
    } catch (error) {
      request.log.warn(`Firebase ID Token verification failed ${error}`);
      reply.code(403).send({ error: 'Invalid or expired authentication token' });
      return;
    }
  }
);

const start = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server running on http://0.0.0.0:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
