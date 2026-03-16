'use client';

import { useState } from 'react';
import { Database, Code, ShieldAlert, Cpu, MoreHorizontal, Pin, Pencil, Trash2, Download } from 'lucide-react';
import type { ChatSession, AgentRole } from '../../lib/types';

const ROLE_ICONS: Record<AgentRole, React.ElementType> = {
  Architect: Database,
  Coder: Code,
  Debugger: ShieldAlert,
  Bulk: Cpu,
};

interface ChatSessionItemProps {
  session: ChatSession;
  isActive: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRename: (title: string) => void;
  onTogglePin: () => void;
  onExport?: () => void;
}

export function ChatSessionItem({ session, isActive, onClick, onDelete, onRename, onTogglePin, onExport }: ChatSessionItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(session.title);
  const Icon = ROLE_ICONS[session.lastRole as AgentRole] || Database;

  const handleRename = () => {
    if (editTitle.trim() && editTitle !== session.title) {
      onRename(editTitle.trim());
    }
    setEditing(false);
  };

  return (
    <div
      className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition-all text-sm ${
        isActive
          ? 'bg-[#e8f0fe] text-[#1967d2] font-medium'
          : 'text-gray-700 hover:bg-[#e9eaeb] hover:text-gray-900'
      }`}
      onClick={onClick}
    >
      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#1967d2]' : 'opacity-60 text-gray-500'}`} />

      {editing ? (
        <input
          autoFocus
          value={editTitle}
          onChange={(e) => setEditTitle(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditing(false); }}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 bg-white border border-blue-300 rounded px-2 py-0.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-100"
        />
      ) : (
        <span className="flex-1 truncate text-xs">{session.title}</span>
      )}

      {session.isPinned && <Pin className="w-3 h-3 text-amber-500 shrink-0 fill-amber-500" />}

      {/* Context menu */}
      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
        className={`opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-300/50 rounded-full transition-all shrink-0 ${menuOpen ? 'opacity-100' : ''}`}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {menuOpen && (
        <div
          className="absolute right-0 top-full mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden py-1 animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => { setEditing(true); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-xs hover:bg-gray-100 text-gray-700">
            <Pencil className="w-3.5 h-3.5" /> 이름 변경
          </button>
          <button onClick={() => { onTogglePin(); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-xs hover:bg-gray-100 text-gray-700">
            <Pin className="w-3.5 h-3.5" /> {session.isPinned ? '고정 해제' : '고정'}
          </button>
          {onExport && (
            <button onClick={() => { onExport(); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-xs hover:bg-gray-100 text-gray-700">
              <Download className="w-3.5 h-3.5" /> 내보내기
            </button>
          )}
          <div className="h-px bg-gray-100 my-1" />
          <button onClick={() => { onDelete(); setMenuOpen(false); }} className="w-full flex items-center gap-3 px-4 py-2 text-xs hover:bg-red-50 text-red-600">
            <Trash2 className="w-3.5 h-3.5" /> 삭제
          </button>
        </div>
      )}
    </div>
  );
}
