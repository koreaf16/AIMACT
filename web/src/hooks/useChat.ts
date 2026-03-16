import { useState, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import { useSSEStream } from './useSSEStream';
import type { ChatMessage, AgentRole, StreamEvent, MonitorEntry } from '../lib/types';

interface UseChatOptions {
  workspace: string;
  sessionId: string | null;
  onSessionRefresh?: () => void;
}

export function useChat({ workspace, sessionId, onSessionRefresh }: UseChatOptions) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeRole, setActiveRole] = useState<AgentRole>('Architect');
  const [monitorEntries, setMonitorEntries] = useState<MonitorEntry[]>([]);
  const [approvalNeeded, setApprovalNeeded] = useState<{ id: string; summary: string } | null>(null);
  const isStreamingRef = useRef(false);

  const addMonitorEntry = useCallback((type: MonitorEntry['type'], agent: string, content: string) => {
    setMonitorEntries(prev => [...prev, {
      timestamp: new Date().toLocaleTimeString(),
      type,
      agent,
      content,
    }]);
  }, []);

  const handleSSEEvent = useCallback((event: StreamEvent) => {
    const agent = event.agent || activeRole;

    switch (event.event) {
      case 'stream_meta':
        addMonitorEntry('meta', agent,
          `ROLE: ${agent} | CMD: ${event.command} | MODEL: ${event.model}\nWORKSPACE: ${event.workspace}\nENV: ${JSON.stringify(event.env || {})}`
        );
        break;

      case 'context_injected':
        if (event.vectorContext) {
          addMonitorEntry('context', agent, `[Vector Context]\n${event.vectorContext}`);
        }
        if (event.historyContext) {
          addMonitorEntry('context', agent, `[History Context]\n${event.historyContext}`);
        }
        break;

      case 'agent_start':
        setMessages(prev => [...prev, { role: 'system', content: `[${agent}] 에이전트 연결됨...` }]);
        addMonitorEntry('log', agent, 'Agent started');
        break;

      case 'chat_token':
        setMessages(prev => {
          const last = prev[prev.length - 1];
          // If last message is an in-progress assistant message, append token
          if (last && last.role === 'assistant' && last.isStreaming) {
            const updated = [...prev];
            updated[updated.length - 1] = {
              ...last,
              content: last.content + (event.content || ''),
            };
            return updated;
          }
          // Otherwise create a new assistant message
          return [...prev, {
            role: 'assistant',
            agentRole: agent as AgentRole,
            content: event.content || '',
            isStreaming: true,
          }];
        });
        break;

      case 'raw_token':
        addMonitorEntry('token', agent, event.content || '');
        break;

      case 'stream_log':
        addMonitorEntry('log', agent, event.content || '');
        break;

      case 'chat_message':
        if (event.role === 'system') {
          setMessages(prev => [...prev, { role: 'system', content: event.content || '' }]);
        }
        addMonitorEntry('log', agent, event.content || '');
        break;

      case 'agent_complete':
        // Finalize streaming message
        setMessages(prev => prev.map(m =>
          m.isStreaming ? { ...m, isStreaming: false } : m
        ));
        setIsStreaming(false);
        isStreamingRef.current = false;
        addMonitorEntry('log', agent, 'Agent complete');
        onSessionRefresh?.();
        break;

      case 'approval_needed':
        setApprovalNeeded({ id: event.approvalId || '', summary: event.summary || '' });
        setIsStreaming(false);
        isStreamingRef.current = false;
        break;
    }
  }, [activeRole, addMonitorEntry, onSessionRefresh]);

  const handleSSEError = useCallback(() => {
    setIsStreaming(false);
    isStreamingRef.current = false;
    setMessages(prev => prev.map(m =>
      m.isStreaming ? { ...m, isStreaming: false } : m
    ));
  }, []);

  const { connect, disconnect } = useSSEStream({ onEvent: handleSSEEvent, onError: handleSSEError });

  const stopGeneration = useCallback(() => {
    disconnect();
    setIsStreaming(false);
    isStreamingRef.current = false;
    setMessages(prev => prev.map(m =>
      m.isStreaming ? { ...m, isStreaming: false } : m
    ));
    addMonitorEntry('log', activeRole, 'Generation stopped by user');
  }, [disconnect, activeRole, addMonitorEntry]);

  const loadMessages = useCallback(async (sid: string) => {
    try {
      const msgs = await api.sessions.getMessages(sid);
      setMessages(msgs);
    } catch (err) {
      console.error('Failed to load messages:', err);
      setMessages([]);
    }
  }, []);

  const sendMessage = useCallback(async (prompt: string) => {
    if (!prompt.trim() || !sessionId || isStreamingRef.current) return;

    // Add user message to UI immediately
    setMessages(prev => [...prev, { role: 'user', content: prompt }]);
    setIsStreaming(true);
    isStreamingRef.current = true;
    setApprovalNeeded(null);

    try {
      // Get role assignments to find the model ID
      const roles = await api.roles.list();
      const modelId = roles[activeRole];

      const taskData = await api.tasks.create(workspace, prompt, modelId);
      const streamUrl = api.buildStreamUrl(taskData.approvalId, {
        prompt,
        role: activeRole,
        workspace,
        sessionId,
      });

      connect(streamUrl);
    } catch (err) {
      console.error('Send failed:', err);
      setIsStreaming(false);
      isStreamingRef.current = false;
    }
  }, [sessionId, activeRole, workspace, connect]);

  const clearMonitor = useCallback(() => {
    setMonitorEntries([]);
  }, []);

  return {
    messages,
    isStreaming,
    activeRole,
    setActiveRole,
    monitorEntries,
    approvalNeeded,
    loadMessages,
    sendMessage,
    stopGeneration,
    clearMonitor,
    setMessages,
  };
}
