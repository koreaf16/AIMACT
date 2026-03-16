'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChatSidebar } from '../chat/ChatSidebar';
import { ChatArea } from '../chat/ChatArea';
import { WelcomeScreen } from '../chat/WelcomeScreen';
import { StreamMonitor } from '../monitor/StreamMonitor';
import { useChat } from '../../hooks/useChat';
import { useSessions } from '../../hooks/useSessions';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { AGENT_ROLES } from '../../lib/types';
import type { AgentRole } from '../../lib/types';

interface AppShellProps {
  workspace: string;
}

export function AppShell({ workspace }: AppShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [monitorCollapsed, setMonitorCollapsed] = useState(true);
  const searchRef = useRef<HTMLInputElement>(null);

  const { sessions, refresh: refreshSessions, createSession, deleteSession, updateSession } = useSessions(workspace);

  const {
    messages, isStreaming, activeRole, setActiveRole,
    monitorEntries, approvalNeeded,
    loadMessages, sendMessage, stopGeneration, clearMonitor, setMessages,
  } = useChat({
    workspace,
    sessionId,
    onSessionRefresh: refreshSessions,
  });

  // Load messages when session changes
  useEffect(() => {
    if (sessionId) {
      loadMessages(sessionId);
    } else {
      setMessages([]);
    }
  }, [sessionId, loadMessages, setMessages]);

  const navigateToSession = useCallback((sid: string) => {
    router.push(`/workspace?path=${encodeURIComponent(workspace)}&session=${sid}`);
  }, [router, workspace]);

  const handleNewChat = useCallback(async (role?: AgentRole) => {
    const sid = await createSession(role);
    if (role) setActiveRole(role);
    navigateToSession(sid);
  }, [createSession, navigateToSession, setActiveRole]);

  const handleSelectSession = useCallback((sid: string) => {
    navigateToSession(sid);
  }, [navigateToSession]);

  const handleDeleteSession = useCallback(async (sid: string) => {
    await deleteSession(sid);
    if (sid === sessionId) {
      router.push(`/workspace?path=${encodeURIComponent(workspace)}`);
    }
  }, [deleteSession, sessionId, router, workspace]);

  const handleRenameSession = useCallback(async (sid: string, title: string) => {
    await updateSession(sid, { title });
  }, [updateSession]);

  const handleTogglePin = useCallback(async (sid: string, pinned: boolean) => {
    await updateSession(sid, { isPinned: pinned });
  }, [updateSession]);

  const handleQuickAction = useCallback(async (role: AgentRole) => {
    await handleNewChat(role);
  }, [handleNewChat]);

  const handleSend = useCallback(async (message: string) => {
    setMonitorCollapsed(false); // Auto-open monitor when sending
    await sendMessage(message);
  }, [sendMessage]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNewChat: () => handleNewChat(),
    onToggleSidebar: () => setSidebarCollapsed(v => !v),
    onToggleMonitor: () => setMonitorCollapsed(v => !v),
    onFocusSearch: () => searchRef.current?.focus(),
    onSwitchRole: (index) => {
      if (index >= 0 && index < AGENT_ROLES.length) {
        setActiveRole(AGENT_ROLES[index]);
      }
    },
  });

  return (
    <div className="flex flex-col h-screen bg-white text-gray-800 overflow-hidden font-sans">
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <ChatSidebar
          sessions={sessions}
          activeSessionId={sessionId}
          workspace={workspace}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(v => !v)}
          onSelectSession={handleSelectSession}
          onNewChat={handleNewChat}
          onDeleteSession={handleDeleteSession}
          onRenameSession={handleRenameSession}
          onTogglePin={handleTogglePin}
          searchRef={searchRef}
        />

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          {sessionId ? (
            <ChatArea
              messages={messages}
              isStreaming={isStreaming}
              activeRole={activeRole}
              onRoleChange={setActiveRole}
              onSend={handleSend}
              onStop={stopGeneration}
            />
          ) : (
            <WelcomeScreen onQuickAction={handleQuickAction} />
          )}
        </div>
      </div>

      {/* Stream Monitor */}
      <StreamMonitor
        entries={monitorEntries}
        collapsed={monitorCollapsed}
        onToggle={() => setMonitorCollapsed(v => !v)}
        onClear={clearMonitor}
      />
    </div>
  );
}
