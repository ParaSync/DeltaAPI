import { FastifyInstance, FastifyReply } from 'fastify';
import 'dotenv/config';
import { pool } from '../../../lib/pg_pool.js';
import { ReplyPayload } from '../../../models/routes.js';
import { ComponentType } from '../../../models/components.js';

type AnswerableComponent = {
	id: string;
	formId: string;
	type: ComponentType;
	name: string;
	order: number;
	properties: Record<string, unknown>;
};

type AnswerableForm = {
	id: string;
	title: string;
	userId: string;
	createdAt: string;
	components: AnswerableComponent[];
};

const ALLOWED_TYPES: ComponentType[] = ['image', 'label', 'input', 'table'];

const sendReply = (reply: FastifyReply, status: number, payload: ReplyPayload) =>
	reply.status(status).send(payload);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

const toComponentType = (candidate: unknown): ComponentType =>
	typeof candidate === 'string' && ALLOWED_TYPES.includes(candidate as ComponentType)
		? (candidate as ComponentType)
		: 'input';

const toComponentOrder = (rawOrder: unknown): number => {
	if (typeof rawOrder === 'number' && Number.isFinite(rawOrder)) return rawOrder;
	if (typeof rawOrder === 'string' && rawOrder.trim() !== '') {
		const parsed = Number(rawOrder);
		if (Number.isFinite(parsed)) return parsed;
	}
	return 0;
};

const sortComponents = (components: AnswerableComponent[]) =>
	components.slice().sort((a, b) => a.order - b.order);

const normaliseComponent = (raw: unknown): AnswerableComponent => {
	const obj = isPlainObject(raw) ? raw : {};
	const properties = isPlainObject(obj.properties) ? obj.properties : {};
	const order = toComponentOrder(obj.order ?? properties.order ?? properties.orderBy);

	return {
		id: String(obj.id ?? ''),
		formId: String(obj.form_id ?? obj.formId ?? ''),
		type: toComponentType(obj.type),
		name: typeof obj.name === 'string' ? obj.name : '',
		order,
		properties,
	};
};

const buildFormResponse = (
	rawForm: { id: unknown; title: unknown; user_id?: unknown; userId?: unknown; created_at?: unknown; createdAt?: unknown },
	components: AnswerableComponent[]
): AnswerableForm => {
	const rawCreated = rawForm.created_at ?? rawForm.createdAt;
	const createdAt =
		typeof rawCreated === 'string' || typeof rawCreated === 'number' || rawCreated instanceof Date
			? new Date(rawCreated).toISOString()
			: new Date().toISOString();

	return {
		id: String(rawForm.id ?? ''),
		title: typeof rawForm.title === 'string' ? rawForm.title : '',
		userId:
			typeof rawForm.user_id === 'string'
				? rawForm.user_id
				: typeof rawForm.userId === 'string'
				? rawForm.userId
				: '',
		createdAt,
		components: sortComponents(components),
	};
};

async function answersRoute(fastify: FastifyInstance) {
	// GET /api/form/answers/:formID/:submissionID
	fastify.get('/api/form/answers/:formID/:submissionID', async (req, reply) => {
		const { formID, submissionID } = req.params as { formID: string; submissionID: string };
		const parsedFormId = Number(formID);
		const parsedSubmissionId = Number(submissionID);

		if (!Number.isInteger(parsedFormId) || parsedFormId <= 0) {
			return sendReply(reply, 400, { message: 'Invalid form ID.', value: null });
		}

		if (!Number.isInteger(parsedSubmissionId) || parsedSubmissionId <= 0) {
			return sendReply(reply, 400, { message: 'Invalid submission ID.', value: null });
		}

		if (!pool) {
			return sendReply(reply, 500, { message: 'Database connection is not available.', value: null });
		}

		const client = await pool.connect();
		try {
			// Fetch form
			const formResult = await client.query(
				'SELECT id, title, user_id, created_at FROM forms WHERE id = $1;',
				[parsedFormId]
			);

			if (formResult.rowCount === 0) {
				return sendReply(reply, 404, { message: 'Form not found.', value: null });
			}

			// Fetch components
			const componentsResult = await client.query(
				'SELECT id, form_id, type, name, properties FROM components WHERE form_id = $1 ORDER BY COALESCE((properties->>\'order\')::int, 0), id;',
				[parsedFormId]
			);

			const components = componentsResult.rows.map(normaliseComponent);

			// Fetch submission
			const submissionResult = await client.query(
				'SELECT id, form_id, user_id, created_at FROM submissions WHERE id = $1 AND form_id = $2;',
				[parsedSubmissionId, parsedFormId]
			);

			if (submissionResult.rowCount === 0) {
				return sendReply(reply, 404, { message: 'Submission not found for this form.', value: null });
			}

			const submissionRow = submissionResult.rows[0];

			// Fetch answers for the submission
			const answersResult = await client.query(
				'SELECT component_id, properties FROM answers WHERE submission_id = $1;',
				[parsedSubmissionId]
			);

			const answersMap: Record<string, unknown> = {};
			for (const row of answersResult.rows) {
				const compId = row.component_id ?? row.componentId ?? row.component_id;
				const key = String(compId);
				const properties = isPlainObject(row.properties) ? row.properties : {};
				// stored payload in submit.ts used { value, type }
				if (properties.value !== undefined) {
					answersMap[key] = properties.value;
				} else if (properties.answer !== undefined) {
					answersMap[key] = properties.answer;
				} else {
					// fallback: whole properties
					answersMap[key] = properties;
				}
			}

			const formResponse = buildFormResponse(formResult.rows[0], components);

			return sendReply(reply, 200, {
				message: 'Submission loaded successfully.',
				value: {
					form: formResponse,
					submission: {
						id: submissionRow.id,
						form_id: submissionRow.form_id,
						respondent_id: submissionRow.user_id ?? null,
						submitted_at:
							submissionRow.created_at instanceof Date
								? submissionRow.created_at.toISOString()
								: String(submissionRow.created_at),
						answers: answersMap,
					},
				},
			});
		} catch (error) {
			fastify.log.error({ err: error }, 'Load submission error');
			return sendReply(reply, 500, { message: 'Failed to load submission.', value: error instanceof Error ? error.message : String(error) });
		} finally {
			client.release();
		}
	});
}

export default answersRoute;

