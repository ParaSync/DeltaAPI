import { UpdateRequest } from "firebase-admin/lib/auth/auth-config";

export interface BodyType {
  loggedIn: boolean;
  email: string;
  password: string;
  uid: string;
  updateRequest: UpdateRequest;
}
