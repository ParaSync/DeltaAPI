export interface BodyType {
  loggedIn: boolean;
  email: string;
  password: string;
  uid: string;
  formId: string;
  componentId: string;
  properties: ComponentProperties;
  updateRequest: Record<string, unknown>;
}

export interface ReplyPayload {
  message: string;
  value: unknown;
}

// TODO: Sync with frontend's schemas for the various component types
// TODO: once they implement them. For now these would act as placeholders

export interface ComponentProperties {
  name: string;
  type: string;
}

export interface ImageProperties extends ComponentProperties {
  image: {
    name?: string;
    data?: Blob;
    placeholder?: string;
    location?: string; // will be set by backend
  };
}
