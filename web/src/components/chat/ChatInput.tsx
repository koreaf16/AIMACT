'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Plus, Mic, Square } from 'lucide-react';
import { RoleSelector } from './RoleSelector';
import type { AgentRole } from '../../lib/types';

interface ChatInputProps {
  activeRole: AgentRole;
  onRoleChange: (role: AgentRole) => void;
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function ChatInput({ activeRole, onRoleChange, onSend, onStop, isStreaming, disabled }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    }
  }, [value]);

  const handleSubmit = () => {
    if (!value.trim() || disabled) return;
    onSend(value.trim());
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="bg-white px-4 pb-8 pt-2">
      <div className="max-w-[820px] mx-auto w-full">
        <div className="relative bg-[#f0f4f9] rounded-[32px] flex items-end px-3 py-2 transition-all focus-within:bg-white focus-within:shadow-[0_1px_6px_rgba(32,33,36,0.28)] border border-transparent focus-within:border-[#dfe1e5]">
          
          {/* Left Actions */}
          <div className="flex items-center gap-0.5 mb-1.5 shrink-0 ml-1">
            <button
              className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-600 transition-colors"
              title="파일 첨부"
            >
              <Plus className="w-5.5 h-5.5" />
            </button>
            <RoleSelector
              value={activeRole}
              onChange={onRoleChange}
              disabled={disabled}
            />
          </div>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`${activeRole}에게 프롬프트를 입력하세요...`}
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent text-gray-900 placeholder:text-gray-500 resize-none px-4 py-3.5 focus:outline-none max-h-[400px] min-h-[56px] text-[16px] leading-relaxed"
          />

          {/* Right Actions */}
          <div className="flex items-center mb-1.5 shrink-0 gap-0.5 mr-1">
            {isStreaming ? (
              <button
                onClick={onStop}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-black text-white hover:bg-gray-800 shadow-sm transition-all active:scale-95 animate-in fade-in zoom-in duration-200"
                title="중지"
              >
                <Square className="w-4 h-4 fill-white" />
              </button>
            ) : !value.trim() ? (
               <button className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-600 transition-colors">
                 <Mic className="w-5.5 h-5.5" />
               </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={disabled}
                className="w-11 h-11 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 shadow-sm transition-all active:scale-95"
              >
                <Send className="w-5 h-5 ml-0.5" />
              </button>
            )}
          </div>

        </div>
        <p className="text-[11px] text-gray-400 text-center mt-3 font-medium">
          Enter 전송, Shift+Enter 줄바꿈. AI는 오답을 낼 수 있으므로 내용을 확인하세요.
        </p>
      </div>
    </div>
  );
}
