import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"

/**
 * Encapsulates routes
 * @param {FastifyInstance} fastify  Encapsulated Fastify Instance
 * @param {Object} options plugin options, refer to https://fastify.dev/docs/latest/Reference/Plugins/#plugin-options
 */
async function routes(fastify: FastifyInstance, options: Object) {
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    return { hello: 'world', note: 'try visiting /mirror!' }
  })

  fastify.get('/mirror', async (request: FastifyRequest, reply: FastifyReply) => {
    return { request, reply }
  })
}

export default routes
