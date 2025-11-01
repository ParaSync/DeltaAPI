export type Form = {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
};

export type Submission = {
  id: string;
  formId: string;
  userId: string;
  createdAt: string;
};

export type Answer = {
  options?: AnswerOptions;
  componentId: string;
  submissionId: string;
};

type AnswerOptions = {
  selected?: string[];
  input?: string;
};
