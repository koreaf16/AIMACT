'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Database, Code, ShieldAlert, Cpu, User } from 'lucide-react';
import type { ChatMessage as ChatMessageType, AgentRole } from '../../lib/types';

const ROLE_ICONS: Record<AgentRole, React.ElementType> = {
  Architect: Database,
  Coder: Code,
  Debugger: ShieldAlert,
  Bulk: Cpu,
};

const ROLE_BADGE_COLORS: Record<AgentRole, string> = {
  Architect: 'bg-blue-50 text-blue-600 border-blue-100',
  Coder: 'bg-green-50 text-green-600 border-green-100',
  Debugger: 'bg-orange-50 text-orange-600 border-orange-100',
  Bulk: 'bg-purple-50 text-purple-600 border-purple-100',
};

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessageBubble({ message }: ChatMessageProps) {
  if (message.role === 'system') {
    return (
      <div className="flex justify-center my-4">
        <span className="text-[11px] text-gray-500 font-medium bg-gray-100 px-4 py-1.5 rounded-full border border-gray-200 shadow-sm">
          {message.content}
        </span>
      </div>
    );
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end mb-6">
        <div className="max-w-[85%] flex gap-4 flex-row-reverse">
          <div className="w-8 h-8 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center shrink-0 mt-1 shadow-sm">
            <User className="w-4.5 h-4.5 text-blue-600" />
          </div>
          <div className="bg-[#f0f4f9] border border-[#dfe1e5] rounded-[20px] rounded-tr-sm px-5 py-3.5 shadow-sm">
            <p className="text-[15px] text-gray-800 whitespace-pre-wrap leading-relaxed font-medium">{message.content}</p>
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  const agentRole = message.agentRole || 'Architect';
  const Icon = ROLE_ICONS[agentRole] || Database;
  const badgeColor = ROLE_BADGE_COLORS[agentRole] || ROLE_BADGE_COLORS.Architect;

  return (
    <div className="flex justify-start mb-8">
      <div className="max-w-[90%] flex gap-4">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-1 border shadow-sm ${badgeColor}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-md border shadow-sm ${badgeColor}`}>
              {agentRole}
            </span>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-1 py-1">
            <article className="prose prose-sm max-w-none prose-p:my-2 prose-pre:my-3 prose-headings:my-3 prose-ul:my-2 prose-ol:my-2 text-gray-800 px-4 py-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
              {message.isStreaming && (
                <span className="inline-block w-2 h-5 ml-1 bg-blue-500 animate-pulse align-middle rounded-sm" />
              )}
            </article>
          </div>
        </div>
      </div>
    </div>
  );
}
