// TODO: Sync with frontend's schemas for the various component types
// TODO: once they implement them. For now these would act as placeholders

export type ComponentType = 'image' | 'label' | 'input' | 'table';

export type HTMLInputType =
  | 'text'
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
  | 'time'
  | 'url'
  | 'week';

export interface ComponentProperties {
  name: string;
  type: string;
}

export interface ImageProperties extends ComponentProperties {
  image: {
    name: string;
    data?: Blob;
    placeholder?: string;
    location?: string; // will be set by backend
  };
}

export interface LabelProperties extends ComponentProperties {
  label: {
    color?: string;
    backgroundColor?: string;
    fontFamily?: string;
    fontSize?: string | number;
    fontStyle?: 'italic';
    fontWeight?: number | 'bold';
    text: string;
    textDecoration?: 'underline' | 'none';
    textDecorationColor?: string;
  };
}

export interface InputProperties extends ComponentProperties {
  input: {
    type: HTMLInputType | 'select';
    placeholder?: string;
    value?: string;
    maxLength?: number;
    required?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    size?: number;
    multiple?: boolean;
    pattern?: string;
    min?: string;
    max?: string;
    step?: number;
    height?: number;
    width?: number;
    autocomplete?: string; // on, off
    choices?: string[];
  };
}

export interface TableProperties extends ComponentProperties {
  table: {
    rows?: number;
    maxRows?: number;
    minRows?: number;
    columns: [properties: InputProperties];
  };
}

export function isImageProperties(
  properties: ComponentProperties | undefined | unknown
): properties is ImageProperties {
  if (!properties) {
    return false;
  }

  const imageProperties = properties as ImageProperties;

  if (!('image' in imageProperties)) {
    return false;
  }

  if (!('name' in imageProperties.image)) {
    return false;
  }

  return true;
}

export function isInputProperties(
  properties: ComponentProperties | undefined | unknown
): properties is InputProperties {
  if (!properties) {
    return false;
  }

  const inputProperties = properties as InputProperties;

  if (!('input' in inputProperties)) {
    return false;
  }

  if (!('type' in inputProperties.input)) {
    return false;
  }

  return true;
}

export function isLabelProperties(
  properties: ComponentProperties | undefined | unknown
): properties is LabelProperties {
  if (!properties) {
    return false;
  }

  const labelProperties = properties as LabelProperties;

  if (!('label' in labelProperties)) {
    return false;
  }

  if (!('text' in labelProperties.label)) {
    return false;
  }

  return true;
}

export function isTableProperties(
  properties: ComponentProperties | undefined | unknown
): properties is TableProperties {
  if (!properties) {
    return false;
  }

  const tableProperties = properties as TableProperties;

  if (!('table' in tableProperties)) {
    return false;
  }

  if (!('columns' in tableProperties.table)) {
    return false;
  }

  return true;
}
