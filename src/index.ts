import Fastify from "fastify";
import routes from "./routes/sample";
import uploadRoutes from "./routes/upload";
import componentRoutes from "./routes/components";

const fastify = Fastify({ logger: true });

fastify.register(routes);
fastify.register(uploadRoutes);
fastify.register(componentRoutes);

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    console.log("Server running on http://localhost:3000");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
