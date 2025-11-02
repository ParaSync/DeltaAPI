import Fastify from 'fastify';
import { FastifyReply, FastifyRequest } from 'fastify';
import fastifyFirebase from 'fastify-firebase';
import firebasePrivateKeyJson from '../neuron-delta-firebase-adminsdk-fbsvc-e748a310fb.json';
import authRoutes from './routes/auth';
import uploadRoutes from './routes/upload';
import componentRoutes from './routes/components';
import { BodyType } from './models/interfaces';

const fastify = Fastify({
  logger: {
    level: 'debug',
    transport: {
      target: 'pino-pretty',
    },
  },
});

fastify.register(fastifyFirebase, firebasePrivateKeyJson);
fastify.register(authRoutes);
fastify.register(uploadRoutes);
fastify.register(componentRoutes);

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

fastify.get('/healthcheck', (request: FastifyRequest, reply: FastifyReply) => {
  return reply.code(200).send('OK');
});

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    console.log('Server running on http://localhost:3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
