// import { HTMLInputType } from "./types";

export type Form = {
  id: number;
  title: string;
  userId: string;
  createdAt: Date;
};

export type Submission = {
  id: number;
  formId: string;
  userId: string;
  createdAt: string;
};
