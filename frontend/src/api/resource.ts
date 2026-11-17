import type { ApiClient } from "./client";

export function resource<T, Input>(client: ApiClient, path: string, map: (value: T) => T) {
  return {
    async list(): Promise<T[]> {
      const result: T[] = [];
      for (let offset = 0; ; offset += 500) {
        const page = await client.request<T[]>(path + "?limit=500&offset=" + offset);
        result.push(...page.map(map));
        if (page.length < 500) return result;
      }
    },
    async get(id: string) { return map(await client.request<T>(path + "/" + encodeURIComponent(id))); },
    async create(input: Input) { return map(await client.request<T>(path, "POST", input)); },
    async update(id: string, input: Partial<Input>) {
      return map(await client.request<T>(path + "/" + encodeURIComponent(id), "PATCH", input));
    },
    remove(id: string) { return client.request<void>(path + "/" + encodeURIComponent(id), "DELETE"); },
  };
}
