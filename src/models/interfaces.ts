import { UpdateRequest } from 'firebase-admin/lib/auth/auth-config';
import { Answer } from './answers';

export interface BodyType {
  loggedIn: boolean;
  email: string;
  password: string;
  userId: string;
  formId: number;
  submissionId: number;
  answers: Answer[];
  updateRequest: UpdateRequest;
}
