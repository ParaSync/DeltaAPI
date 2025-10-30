import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { BodyType } from '../models/interfaces';
import pg from 'pg';
import { Answer, AnswerProperties } from '../models/answers';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 200 });

async function actionRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/submit',
    async (request: FastifyRequest<{ Body: BodyType }>, reply: FastifyReply) => {
      const { answers, formId } = request.body;
      const { uid } = request.headers;
      const client = await pool.connect();
      if (typeof uid == 'string') {
        const submissionId = await createNewSubmission(client, formId, uid);
        await insertAnswers(client, submissionId, answers);
        return reply.status(200);
      }
      client.release();
    }
  );

  fastify.post(
    '/reset',
    async (request: FastifyRequest<{ Body: BodyType }>, reply: FastifyReply) => {
      console.log(request.body);
      const { answers } = request.body;
      answers.map((answer) => {
        answer.properties = undefined;
        return answer;
      });
      return reply.status(200).send(answers);
    }
  );
}

async function createNewSubmission(
  client: pg.PoolClient,
  formId: number,
  userId: string
): Promise<number> {
  const query = `
        INSERT INTO submissions (form_id, user_id) VALUES ($1, $2) RETURNING id;
    `;
  const values = [formId, userId];
  const result = await client.query(query, values);
  client.release();
  return result.rows[0].id;
}

async function insertAnswers(client: pg.PoolClient, submissionId: number, answers: Answer[]) {
  const columns = ['component_id', 'submission_id', 'properties'];
  const valuePlaceholders: string[] = [];
  const values: (string | number | AnswerProperties)[] = [];
  answers.forEach((answer, index) => {
    const start = index * columns.length + 1;
    valuePlaceholders.push(`($${start}, $${start + 1})`);
    if (answer.properties != undefined) {
      values.push(answer.componentId, submissionId, answer.properties);
    }
  });
  const query = `
        INSERT INTO answers (${columns.join(', ')}})
        VALUES ${valuePlaceholders.join(', ')}
        RETURNING *;
    `;
  await client.query(query, values);
  client.release();
}

export default actionRoutes;
