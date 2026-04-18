export type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  code: number;
  error_code?: string;
  data: T | null;
  errors: unknown;
  meta: {
    timestamp: string;
  } & Record<string, unknown>;
};
