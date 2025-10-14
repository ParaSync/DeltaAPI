import { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { randomUUID } from "crypto";
import supabase from "../lib/supabase";

async function uploadRoutes(fastify: FastifyInstance) {
  fastify.register(multipart);

  fastify.post("/upload", async (req, reply) => {
    try {
      const file = await req.file();
      if (!file) return reply.status(400).send({ error: "No file uploaded" });

      const allowed = ["image/png", "image/jpeg", "image/svg+xml"];
      if (!allowed.includes(file.mimetype)) {
        return reply.status(400).send({ error: "Invalid file type" });
      }

      const filename = `${randomUUID()}-${file.filename}`;
      const buffer = await file.toBuffer();

      const { error } = await (supabase.storage
        .from(process.env.SUPABASE_BUCKET!)
        .upload(filename, buffer, {
          contentType: file.mimetype,
          upsert: true,
          duplex: "half",
        } as any));

      if (error) {
        console.error('Upload error:', error);
        return reply.status(500).send({ error: error.message });
      }

      const { data: publicUrlData } = supabase.storage
        .from(process.env.SUPABASE_BUCKET!)
        .getPublicUrl(filename);

      return reply.send({
        src: publicUrlData.publicUrl,
        filename,
        message: "Upload successful"
      });
    } catch (err) {
      console.error('Route error:', err);
      return reply.status(500).send({ error: "Internal server error" });
    }
  });
}

export default uploadRoutes;
