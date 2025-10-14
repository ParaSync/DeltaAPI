export type HTMLInputType =
  | "text" | "button" | "checkbox" | "color" | "date"
  | "datetime-local" | "email" | "file" | "hidden" | "image"
  | "month" | "number" | "password" | "radio" | "range"
  | "reset" | "search" | "submit" | "tel" | "time"
  | "url" | "week";

export type Component = {
  id?: number;
  form_id: number;
  type: HTMLInputType;
  name?: string;
  properties: Record<string, any>;
};
