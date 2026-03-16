import { API_BASE } from './constants';
import type { ChatSession, ChatMessage, ModelInfo } from './types';

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  sessions: {
    list: (workspace: string) =>
      fetchJSON<ChatSession[]>(`${API_BASE}/api/sessions?workspace=${encodeURIComponent(workspace)}`),

    create: (workspace: string, title?: string, role?: string) =>
      fetchJSON<{ id: string }>(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, title, role }),
      }),

    update: (id: string, updates: Partial<Pick<ChatSession, 'title' | 'isPinned' | 'lastRole'>>) =>
      fetchJSON<{ success: boolean }>(`${API_BASE}/api/sessions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      }),

    delete: (id: string) =>
      fetchJSON<void>(`${API_BASE}/api/sessions/${id}`, { method: 'DELETE' }),

    getMessages: (id: string) =>
      fetchJSON<ChatMessage[]>(`${API_BASE}/api/sessions/${id}/messages`),
  },

  models: {
    list: () => fetchJSON<ModelInfo[]>(`${API_BASE}/api/models`),
  },

  roles: {
    list: () => fetchJSON<Record<string, string>>(`${API_BASE}/api/roles`),
  },

  workspaces: {
    list: () => fetchJSON<{ path: string; name: string; description?: string }[]>(`${API_BASE}/api/workspaces`),
  },

  tasks: {
    create: (workspace: string, prompt: string, agentId: string) =>
      fetchJSON<{ approvalId: string }>(`${API_BASE}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace, prompt, agentId }),
      }),
  },

  buildStreamUrl(taskId: string, params: {
    prompt: string;
    role: string;
    workspace: string;
    sessionId?: string;
  }): string {
    const url = new URL(`${API_BASE}/api/tasks/${taskId}/stream`);
    url.searchParams.append('prompt', params.prompt);
    url.searchParams.append('role', params.role);
    url.searchParams.append('workspace', params.workspace);
    if (params.sessionId) {
      url.searchParams.append('sessionId', params.sessionId);
    }
    return url.toString();
  },
};
