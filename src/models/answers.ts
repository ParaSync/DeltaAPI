// import { HTMLInputType } from "./types";

export type Answer = {
  componentId: number;
  properties?: AnswerProperties;
};

export type AnswerProperties = TextAnswerProperties | TableAnswerProperties;

type TextAnswerProperties = {
  answer: string;
};

type TableAnswerProperties = {
  answers: string[][];
};
