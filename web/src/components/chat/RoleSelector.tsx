'use client';

import { useState, useRef, useEffect } from 'react';
import { Database, Code, ShieldAlert, Cpu, ChevronDown } from 'lucide-react';
import type { AgentRole } from '../../lib/types';
import { AGENT_ROLES } from '../../lib/types';
import { ROLE_CONFIG } from '../../lib/constants';

const ROLE_ICONS: Record<AgentRole, React.ElementType> = {
  Architect: Database,
  Coder: Code,
  Debugger: ShieldAlert,
  Bulk: Cpu,
};

const ROLE_COLORS: Record<AgentRole, string> = {
  Architect: 'text-blue-400 bg-blue-400/10 border-blue-400/30',
  Coder: 'text-green-400 bg-green-400/10 border-green-400/30',
  Debugger: 'text-orange-400 bg-orange-400/10 border-orange-400/30',
  Bulk: 'text-purple-400 bg-purple-400/10 border-purple-400/30',
};

interface RoleSelectorProps {
  value: AgentRole;
  onChange: (role: AgentRole) => void;
  disabled?: boolean;
  models?: Record<string, string>;
}

export function RoleSelector({ value, onChange, disabled, models }: RoleSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const Icon = ROLE_ICONS[value];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-all ${ROLE_COLORS[value]} ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:brightness-125 cursor-pointer'}`}
      >
        <Icon className="w-3.5 h-3.5" />
        {value}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-64 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-150 py-1">
          {AGENT_ROLES.map(role => {
            const RIcon = ROLE_ICONS[role];
            const config = ROLE_CONFIG[role];
            const isActive = role === value;
            return (
              <button
                key={role}
                onClick={() => { onChange(role); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
              >
                <div className={`p-2 rounded-lg ${isActive ? 'bg-white shadow-sm' : 'bg-gray-100'}`}>
                  <RIcon className={`w-4 h-4 ${isActive ? ROLE_COLORS[role].split(' ')[0] : 'text-gray-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className={`text-sm font-semibold ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>{role}</div>
                  <div className="text-[10px] text-gray-500 leading-tight">{config.description}</div>
                </div>
                {isActive && <div className="w-2 h-2 rounded-full bg-blue-500" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export { ROLE_ICONS, ROLE_COLORS };
