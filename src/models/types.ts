export type HTMLInputType =
  | "text" | "button" | "checkbox" | "color" | "date"
  | "datetime-local" | "email" | "file" | "hidden" | "image"
  | "month" | "number" | "password" | "radio" | "range"
  | "reset" | "search" | "submit" | "tel" | "time"
  | "url" | "week";

export type ComponentType =
  | "button"
  | "checkbox"
  | "radio"
  | "text"
  | "number"
  | "select"
  | "datetime"
  | "file"
  | "image";

export type Component = {
  id?: number;
  form_id: number;
  type: ComponentType;
  name?: string;
  properties: Record<string, any>;
};
