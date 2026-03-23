/**
 * SFMC REST API Client
 * Wraps fetch with automatic token injection and error handling.
 */

import { SFMCAuth } from "./auth.js";

export class SFMCRestClient {
  constructor(private auth: SFMCAuth) {}

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const baseUrl = await this.auth.getRestUrl();
    const url = new URL(baseUrl + path);
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    }
    return this.request<T>("GET", url.toString());
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const baseUrl = await this.auth.getRestUrl();
    return this.request<T>("POST", baseUrl + path, body);
  }

  async patch<T>(path: string, body: unknown): Promise<T> {
    const baseUrl = await this.auth.getRestUrl();
    return this.request<T>("PATCH", baseUrl + path, body);
  }

  async delete<T>(path: string, body?: unknown): Promise<T> {
    const baseUrl = await this.auth.getRestUrl();
    return this.request<T>("DELETE", baseUrl + path, body);
  }

  private async request<T>(
    method: string,
    url: string,
    body?: unknown
  ): Promise<T> {
    const token = await this.auth.getToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `SFMC REST API error (${response.status}) [${method} ${url}]: ${errorText}`
      );
    }

    // Some DELETE/204 responses have no body
    const text = await response.text();
    if (!text) return {} as T;
    return JSON.parse(text) as T;
  }
}
