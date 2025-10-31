type HTMLInputType =
  | 'button'
  | 'checkbox'
  | 'color'
  | 'date'
  | 'datetime-local'
  | 'email'
  | 'file'
  | 'hidden'
  | 'image'
  | 'month'
  | 'number'
  | 'password'
  | 'radio'
  | 'range'
  | 'reset'
  | 'search'
  | 'submit'
  | 'tel'
  | 'text'
  | 'time'
  | 'url'
  | 'week';

export type Form = {
  id: string;
  title: string;
  userId: string;
  createdAt: string;
}

export type Component = {
  id: string;
  formId: string;
  type: HTMLInputType;
  options?: ComponentOptions;
};

type ComponentOptions = {
  choices?: string[];
  label?: string;
};

export type Submission = {
  id: string;
  formId: string;
  userId: string;
  createdAt: string;
}

export type Answer = {
  options?: AnswerOptions;
  componentId: string;
  submissionId: string;
};

type AnswerOptions = {
  selected?: string[];
  input?: string;
}
