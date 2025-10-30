import { HTMLInputType } from './types';

export type Component = {
  id?: number;
  form_id: number;
  type: HTMLInputType | 'label';
  name?: string;
  properties: ComponentProperties; // Record<string, any>
};

export type ComponentProperties = LabelProperties | TextProperties | TableProperties;

type LabelProperties = {
  label: string;
};

type TextProperties = {
  label?: string;
  required: boolean;
  placeholder?: string;
};

type TableProperties = {
  label?: string;
  required: boolean;
  columnNames: string[];
  columnTypes: HTMLInputType[];
};
