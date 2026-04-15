export type ApiEnvelope<T> = {
  success: boolean;
  message: string;
  code: number;
  data: T | null;
  errors: unknown;
  meta: {
    timestamp: string;
  } & Record<string, unknown>;
};
