import axios from "axios";

import { env } from "@/shared/lib/env";
import {
  attachRequestInterceptor,
  createResponseErrorInterceptor,
} from "@/shared/http/interceptors";
import { useAuthStore } from "@/features/auth/state";

export const httpClient = axios.create({
  baseURL: env.apiBaseUrl,
  withCredentials: true,
});

httpClient.interceptors.request.use(attachRequestInterceptor());
httpClient.interceptors.response.use(
  (response) => response,
  createResponseErrorInterceptor(() => {
    useAuthStore.getState().setAnonymous();
  }),
);
