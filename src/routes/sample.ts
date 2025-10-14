import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"

async function routes (fastify: FastifyInstance, options: Object) {
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    return { hello: 'world', note: 'try visiting /mirror!' }
  })
  
  fastify.get('/mirror', async (request: FastifyRequest, reply: FastifyReply) => {
    return {
      method: request.method,
      url: request.url,
      headers: request.headers,
      query: request.query,
      body: request.body
    }
  })
}

export default routes
