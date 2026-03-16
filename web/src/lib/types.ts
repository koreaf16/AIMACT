export type AgentRole = 'Architect' | 'Coder' | 'Debugger' | 'Bulk';

export const AGENT_ROLES: AgentRole[] = ['Architect', 'Coder', 'Debugger', 'Bulk'];

export interface ChatSession {
  id: string;
  workspacePath: string;
  title: string;
  lastRole: AgentRole;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id?: string;
  sessionId?: string;
  role: 'user' | 'assistant' | 'system';
  agentRole?: AgentRole;
  content: string;
  createdAt?: string;
  isStreaming?: boolean;
}

export interface StreamEvent {
  event: string;
  content?: string;
  role?: string;
  agent?: string;
  approvalId?: string;
  summary?: string;
  command?: string;
  model?: string;
  workspace?: string;
  env?: Record<string, string>;
  vectorContext?: string;
  historyContext?: string;
}

export interface MonitorEntry {
  timestamp: string;
  type: 'meta' | 'context' | 'token' | 'log' | 'error';
  agent: string;
  content: string;
}

export interface ModelInfo {
  id: string;
  name: string;
  model: string;
  command: string;
  contextStrategy: string;
  systemPrompt: string;
  customEnv: Record<string, string>;
}
