export type ContactStatus = "pending" | "accepted" | "blocked" | "incoming";

export interface ContactUser {
  id: string;
  full_name: string;
  username: string;
  email: string;
  profile_picture: string | null;
  banner_picture: string | null;
  bio: string | null;
  nickname: string | null;
  gender: string | null;
  date_joined: string;
  total_contacts: number;
  mutual_contacts: number;
  is_contact: boolean;
  contact_status: ContactStatus | null;
}

export interface SearchResponse {
  success: boolean;
  message: string;
  data: ContactUser[];
}
