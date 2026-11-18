export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
export const errorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : "Something went wrong. Please try again.";

export interface ApiAuth { getAccessToken: () => Promise<string | null>; onUnauthorized?: () => void; }

export function createApiClient(baseUrl: string, auth?: ApiAuth) {
  const base = baseUrl.replace(/\/$/, "");
  return {
    async request<T>(path: string, method = "GET", body?: unknown, timeout = 20_000): Promise<T> {
      let response: Response;
      const accessToken = auth ? await auth.getAccessToken() : null;
      if (auth && !accessToken) { auth.onUnauthorized?.(); throw new ApiError("Your session has ended. Please sign in again.", 401); }
      try {
        response = await fetch(base + path, {
          method,
          signal: AbortSignal.timeout(timeout),
          headers: { Accept: "application/json", ...(body === undefined ? {} : {"Content-Type":"application/json"}),
            ...(accessToken ? {Authorization: `Bearer ${accessToken}`} : {}) },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch {
        throw new ApiError("Cannot reach the study server. Check your connection and try again.");
      }
      if (response.status === 401) { auth?.onUnauthorized?.(); throw new ApiError("Your session has ended. Please sign in again.", 401); }
      if (!response.ok) {
        let message = response.status === 404 ? "This record no longer exists. Refresh your data."
          : response.status === 409 ? "This change conflicts with existing data."
          : response.status === 400 || response.status === 422 ? "Check the entered values and try again."
          : "The study server is unavailable. Please try again.";
        if (response.status >= 400 && response.status < 500) {
          const data = await response.json().catch(() => null);
          if (typeof data?.detail === "string") message = data.detail;
          if (Array.isArray(data?.errors)) {
            const fields = data.errors.map((error: { loc?: string[]; msg?: string }) =>
              [error.loc?.slice(1).join(" "), error.msg].filter(Boolean).join(": "));
            if (fields.length) message += " " + fields.join("; ");
          }
        }
        throw new ApiError(message, response.status);
      }
      if (response.status === 204) return undefined as T;
      try { return await response.json() as T; }
      catch { throw new ApiError("The server returned an unreadable response. Please refresh."); }
    },
  };
}
export type ApiClient = ReturnType<typeof createApiClient>;
