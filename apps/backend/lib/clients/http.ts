import 'server-only';
import axios, { type AxiosRequestConfig } from 'axios';
import { IntegrationError } from '@/lib/utils/errors';

export const http = axios.create({
  timeout: 8_000,
  maxContentLength: 2 * 1024 * 1024,
  maxBodyLength: 2 * 1024 * 1024,
  validateStatus: (status) => status >= 200 && status < 300,
});

export async function integrationGet<T>(
  integration: string,
  url: string,
  config: AxiosRequestConfig = {},
): Promise<T> {
  const started = Date.now();
  try {
    const response = await http.get<T>(url, { ...config, timeout: config.timeout ?? 8_000 });
    return response.data;
  } catch (error: any) {
    throw new IntegrationError(
      integration,
      'UPSTREAM_REQUEST_FAILED',
      `${integration} request failed`,
      error?.response?.status === 429 ? 503 : 502,
      { status: error?.response?.status, latencyMs: Date.now() - started },
    );
  }
}

export async function integrationPost<T>(
  integration: string,
  url: string,
  body: unknown,
  config: AxiosRequestConfig = {},
): Promise<T> {
  try {
    const response = await http.post<T>(url, body, { ...config, timeout: config.timeout ?? 10_000 });
    return response.data;
  } catch (error: any) {
    throw new IntegrationError(
      integration,
      'UPSTREAM_REQUEST_FAILED',
      `${integration} request failed`,
      error?.response?.status === 429 ? 503 : 502,
      { status: error?.response?.status },
    );
  }
}
