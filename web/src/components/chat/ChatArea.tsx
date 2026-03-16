'use client';

import { useEffect, useRef } from 'react';
import { ChatMessageBubble } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { TypingIndicator } from './TypingIndicator';
import type { ChatMessage, AgentRole } from '../../lib/types';

interface ChatAreaProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  activeRole: AgentRole;
  onRoleChange: (role: AgentRole) => void;
  onSend: (message: string) => void;
  onStop: () => void;
}

export function ChatArea({ messages, isStreaming, activeRole, onRoleChange, onSend, onStop }: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="max-w-3xl mx-auto py-6 px-4">
          {messages.length === 0 && (
            <div className="text-center text-gray-400 py-20">
              <p className="text-sm font-medium">이 대화에 아직 메시지가 없습니다.</p>
              <p className="text-xs mt-1">아래에서 메시지를 보내 시작하세요.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <ChatMessageBubble key={i} message={msg} />
          ))}
          {isStreaming && !messages.some(m => m.isStreaming) && (
            <TypingIndicator />
          )}
          <div ref={scrollRef} />
        </div>
      </div>

      {/* Input */}
      <ChatInput
        activeRole={activeRole}
        onRoleChange={onRoleChange}
        onSend={onSend}
        onStop={onStop}
        isStreaming={isStreaming}
      />
    </div>
  );
}
