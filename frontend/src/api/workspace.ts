import type { ApiClient } from './client';

export type ImportMode = 'MERGE' | 'REPLACE';
export interface WorkspaceCounts { subjects: number; tasks: number; availability: number; study_sessions: number; }
export interface WorkspaceDocument {
  format: 'ai-study-planner-workspace'; version: 1; exported_at: string;
  workspace: { subjects: unknown[]; tasks: unknown[]; availability: unknown[]; study_sessions: unknown[]; };
}
export interface ImportIssue { entity: keyof WorkspaceCounts; row: number; code: string; message: string; }
export interface ImportPreview {
  mode: ImportMode; evaluated_at: string; expires_at: string; fingerprint: string; can_apply: boolean;
  additions: WorkspaceCounts; existing: WorkspaceCounts; duplicates: WorkspaceCounts;
  conflicts: ImportIssue[]; invalid_rows: ImportIssue[]; warnings: string[];
}
export interface ImportCommand { mode: ImportMode; content: string; }
export interface ApplyImportCommand extends ImportCommand { evaluated_at: string; fingerprint: string; confirmation: '' | 'REPLACE'; }
export interface ImportResult { applied: boolean; imported: WorkspaceCounts; duplicates: WorkspaceCounts; conflicts_skipped: number; }
export const workspaceApi = (client: ApiClient) => ({
  export: () => client.request<WorkspaceDocument>('/api/workspace/export', 'GET', undefined, 60_000),
  preview: (input: ImportCommand) => client.request<ImportPreview>('/api/workspace/import/preview', 'POST', input, 60_000),
  apply: (input: ApplyImportCommand) => client.request<ImportResult>('/api/workspace/import/apply', 'POST', input, 60_000),
});
