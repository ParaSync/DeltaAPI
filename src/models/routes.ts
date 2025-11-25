import { ComponentProperties } from './components';

export interface BodyType {
  loggedIn: boolean;
  email: string;
  password: string;
  uid: string;
  formId: string;
  componentId: string;
  title: string;
  properties: ComponentProperties;
  updateRequest: Record<string, unknown>;
}

export interface ReplyPayload {
  message: string;
  value: unknown;
}
