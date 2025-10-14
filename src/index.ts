import Fastify from 'fastify'
import fastifyFirebase from 'fastify-firebase'
import firebasePrivateKeyJson from '../neuron-delta-firebase-adminsdk-fbsvc-e748a310fb.json'
import routes from './routes/sample'

const fastify = Fastify({
  logger: true
})

fastify.register(fastifyFirebase, firebasePrivateKeyJson)
fastify.register(routes)

const start = async () => {
  try {
    await fastify.listen({ port: 3000 })
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}
start()