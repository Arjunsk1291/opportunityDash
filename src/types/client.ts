export interface ClientContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface ClientLocation {
  city: string;
  country: string;
}

export interface ClientProfile {
  id: string;
  companyName: string;
  group?: string;
  domain: string;
  location: ClientLocation;
  contacts: ClientContact[];
  createdAt: string;
  updatedAt: string;
}

export interface ClientContactInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

export interface ClientInput {
  companyName: string;
  domain: string;
  city: string;
  country: string;
  contacts: ClientContactInput[];
}
