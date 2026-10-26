export type Address = {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export type EmergencyContact = {
  name: string;
  relationship: string;
  phone: string;
};

export type ProfileView = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  address: Address | null;
  emergencyContact: EmergencyContact | null;
  createdAt: Date;
  updatedAt: Date;
};
