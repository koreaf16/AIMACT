'use client';

import { useState, useMemo, useRef } from 'react';
import { Plus, Search, Settings, Database, ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { ChatSessionItem } from './ChatSessionItem';
import type { ChatSession, AgentRole } from '../../lib/types';

interface ChatSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  workspace: string;
  collapsed: boolean;
  onToggle: () => void;
  onSelectSession: (id: string) => void;
  onNewChat: (role?: AgentRole) => void;
  onDeleteSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  searchRef?: React.RefObject<HTMLInputElement | null>;
}

function groupByDate(sessions: ChatSession[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const pinned: ChatSession[] = [];
  const todayGroup: ChatSession[] = [];
  const yesterdayGroup: ChatSession[] = [];
  const weekGroup: ChatSession[] = [];
  const older: ChatSession[] = [];

  for (const s of sessions) {
    if (s.isPinned) { pinned.push(s); continue; }
    const d = new Date(s.updatedAt);
    if (d >= today) todayGroup.push(s);
    else if (d >= yesterday) yesterdayGroup.push(s);
    else if (d >= weekAgo) weekGroup.push(s);
    else older.push(s);
  }

  return { pinned, todayGroup, yesterdayGroup, weekGroup, older };
}

export function ChatSidebar({
  sessions, activeSessionId, workspace, collapsed, onToggle,
  onSelectSession, onNewChat, onDeleteSession, onRenameSession, onTogglePin, searchRef
}: ChatSidebarProps) {
  const [search, setSearch] = useState('');
  const localSearchRef = useRef<HTMLInputElement>(null);
  const inputRef = searchRef || localSearchRef;

  const filtered = useMemo(() => {
    if (!search.trim()) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(s => s.title.toLowerCase().includes(q));
  }, [sessions, search]);

  const { pinned, todayGroup, yesterdayGroup, weekGroup, older } = useMemo(() => groupByDate(filtered), [filtered]);

  if (collapsed) {
    return (
      <div className="w-16 bg-white border-r border-gray-200 flex flex-col items-center py-4 gap-4 shrink-0">
        <button onClick={onToggle} className="p-2 hover:bg-gray-200 rounded-full text-gray-600 transition-colors">
          <ChevronLeft className="w-5 h-5 rotate-180" />
        </button>
        <button onClick={() => onNewChat()} className="p-3 bg-white shadow-sm hover:shadow-md border border-gray-100 rounded-2xl text-blue-600 transition-all active:scale-95">
          <Plus className="w-6 h-6" />
        </button>
      </div>
    );
  }

  const renderGroup = (label: string, items: ChatSession[]) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-4">
        <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider px-4 mb-2">{label}</div>
        {items.map(s => (
          <ChatSessionItem
            key={s.id}
            session={s}
            isActive={s.id === activeSessionId}
            onClick={() => onSelectSession(s.id)}
            onDelete={() => onDeleteSession(s.id)}
            onRename={(title) => onRenameSession(s.id, title)}
            onTogglePin={() => onTogglePin(s.id, !s.isPinned)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="w-[280px] bg-white border-r border-gray-200 flex flex-col shrink-0 h-full">
      {/* Header */}
      <div className="p-4 space-y-4 shrink-0">
        <div className="flex items-center justify-between">
          <button onClick={onToggle} className="p-2 hover:bg-gray-200 rounded-full text-gray-600 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => onNewChat()}
            className="flex items-center gap-2 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-full text-sm font-medium border border-gray-200 shadow-sm transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 text-blue-600" /> 새 대화
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="대화 검색..."
            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
          />
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1 custom-scrollbar">
        {renderGroup('고정됨', pinned)}
        {renderGroup('오늘', todayGroup)}
        {renderGroup('어제', yesterdayGroup)}
        {renderGroup('지난 7일', weekGroup)}
        {renderGroup('이전', older)}

        {filtered.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-xs">
            {search ? '검색 결과 없음' : '대화가 없습니다'}
          </div>
        )}
      </div>

      {/* Footer Links */}
      <div className="p-4 border-t border-gray-200 flex items-center justify-around shrink-0 bg-white">
        <Link
          href={`/knowledge?workspace=${encodeURIComponent(workspace)}`}
          className="flex items-center gap-2 text-xs text-gray-600 hover:text-blue-600 transition-colors font-medium"
        >
          <Database className="w-4 h-4" /> 지식 베이스
        </Link>
        <Link
          href="/agents"
          className="flex items-center gap-2 text-xs text-gray-600 hover:text-blue-600 transition-colors font-medium"
        >
          <Settings className="w-4 h-4" /> 모델 관리
        </Link>
      </div>
    </div>
  );
}
