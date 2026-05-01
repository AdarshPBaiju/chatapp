import axios, { AxiosRequestConfig } from "axios";

import { env } from "@/shared/lib/env";
import {
  attachRequestInterceptor,
  createResponseErrorInterceptor,
} from "@/shared/http/interceptors";
import { useAuthStore } from "@/modules/auth/state/authState";

const inFlightRequests = new Map<string, Promise<any>>();

export const httpClient = axios.create({
  baseURL: env.apiBaseUrl,
  withCredentials: true,
});

httpClient.interceptors.request.use((config) => {
  if (config.method?.toLowerCase() === "get") {
    const key = `${config.url}${JSON.stringify(config.params || {})}`;
    const inFlight = inFlightRequests.get(key);
    if (inFlight && !(config as any)._isPrimaryRequest) {
      config.adapter = async () => {
        const response = await inFlight;
        return {
          ...response,
          config,
        };
      };
    }
  }
  return attachRequestInterceptor()(config);
});

httpClient.interceptors.response.use(
  (response) => {
    if (response.config.method?.toLowerCase() === "get") {
      const key = `${response.config.url}${JSON.stringify(response.config.params || {})}`;
      inFlightRequests.delete(key);
    }
    return response;
  },
  (error) => {
    if (error.config?.method?.toLowerCase() === "get") {
      const key = `${error.config.url}${JSON.stringify(error.config.params || {})}`;
      inFlightRequests.delete(key);
    }
    return createResponseErrorInterceptor(() => {
      useAuthStore.getState().setAnonymous();
    })(error);
  },
);

const originalGet = httpClient.get;
httpClient.get = function <T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const key = `${url}${JSON.stringify(config?.params || {})}`;
  const inFlight = inFlightRequests.get(key);

  if (inFlight) {
    return originalGet.call(this, url, { ...config, _isPrimaryRequest: false } as any) as Promise<T>;
  }

  const actualConfig = { ...config, _isPrimaryRequest: true } as any;
  const promise = originalGet.call(this, url, actualConfig) as Promise<T>;
  inFlightRequests.set(key, promise);
  return promise;
};
