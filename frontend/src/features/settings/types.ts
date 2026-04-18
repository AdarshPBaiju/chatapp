export type UserProfile = {
  user_id: string;
  email: string;
  full_name: string;
  bio: string;
  profile_picture: string | null;
  gender: 'male' | 'female' | 'other' | '';
  phone_number: string | null;
  is_two_factor_enabled: boolean;
};

export type TwoFactorSetup = {
  secret: string;
  provisioning_uri: string;
};

export type TwoFactorVerification = {
  backup_codes: string[];
};
