'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, Terminal, Trash2 } from 'lucide-react';
import { StreamTab } from './StreamTab';
import { AGENT_ROLES } from '../../lib/types';
import type { MonitorEntry } from '../../lib/types';

interface StreamMonitorProps {
  entries: MonitorEntry[];
  collapsed: boolean;
  onToggle: () => void;
  onClear: () => void;
}

type TabFilter = 'All' | typeof AGENT_ROLES[number];

export function StreamMonitor({ entries, collapsed, onToggle, onClear }: StreamMonitorProps) {
  const [activeTab, setActiveTab] = useState<TabFilter>('All');
  const tabs: TabFilter[] = ['All', ...AGENT_ROLES];

  const hasActivity = entries.length > 0;

  return (
    <div className={`bg-gray-950 border-t border-gray-800 flex flex-col shrink-0 transition-all ${collapsed ? 'h-9' : 'h-[280px]'}`}>
      {/* Toggle Bar */}
      <button
        onClick={onToggle}
        className="h-9 shrink-0 flex items-center justify-between px-4 hover:bg-gray-900 transition-colors border-b border-gray-800"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-green-500" />
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Stream Monitor</span>
          {hasActivity && (
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          )}
          <span className="text-[10px] text-gray-700">({entries.length})</span>
        </div>
        <div className="flex items-center gap-2">
          {!collapsed && (
            <span
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="p-1 hover:bg-gray-800 rounded text-gray-600 hover:text-gray-400 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
            </span>
          )}
          {collapsed ? <ChevronUp className="w-3.5 h-3.5 text-gray-600" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-600" />}
        </div>
      </button>

      {/* Tabs + Content */}
      {!collapsed && (
        <>
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-900 shrink-0">
            {tabs.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded-lg text-[10px] font-bold transition-all ${
                  activeTab === tab
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-600 hover:text-gray-400'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0">
            <StreamTab
              entries={entries}
              filter={activeTab === 'All' ? undefined : activeTab}
            />
          </div>
        </>
      )}
    </div>
  );
}
