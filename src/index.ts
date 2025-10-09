import Fastify from 'fastify'
import routes from './routes/sample'

const fastify = Fastify({
  logger: true
})

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