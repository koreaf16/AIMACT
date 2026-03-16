import { useState, useCallback, useEffect } from 'react';
import { api } from '../lib/api';
import type { ChatSession, AgentRole } from '../lib/types';

export function useSessions(workspace: string) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!workspace) return;
    setLoading(true);
    try {
      const data = await api.sessions.list(workspace);
      setSessions(data);
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoading(false);
    }
  }, [workspace]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createSession = useCallback(async (role?: AgentRole) => {
    const { id } = await api.sessions.create(workspace, undefined, role);
    await refresh();
    return id;
  }, [workspace, refresh]);

  const deleteSession = useCallback(async (id: string) => {
    await api.sessions.delete(id);
    await refresh();
  }, [refresh]);

  const updateSession = useCallback(async (id: string, updates: Partial<Pick<ChatSession, 'title' | 'isPinned'>>) => {
    await api.sessions.update(id, updates);
    await refresh();
  }, [refresh]);

  return { sessions, loading, refresh, createSession, deleteSession, updateSession };
}
