'use client';

import { useEffect, useRef } from 'react';
import type { MonitorEntry } from '../../lib/types';

const TYPE_COLORS: Record<MonitorEntry['type'], string> = {
  meta: 'text-yellow-400',
  context: 'text-cyan-400',
  token: 'text-green-400',
  log: 'text-gray-500',
  error: 'text-red-400',
};

const TYPE_LABELS: Record<MonitorEntry['type'], string> = {
  meta: 'META',
  context: 'CTX',
  token: 'OUT',
  log: 'LOG',
  error: 'ERR',
};

interface StreamTabProps {
  entries: MonitorEntry[];
  filter?: string; // agent name filter, empty = all
}

export function StreamTab({ entries, filter }: StreamTabProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const filtered = filter
    ? entries.filter(e => e.agent === filter)
    : entries;

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filtered.length]);

  // Combine consecutive tokens into a single line for readability
  const merged: MonitorEntry[] = [];
  for (const entry of filtered) {
    const last = merged[merged.length - 1];
    if (entry.type === 'token' && last?.type === 'token' && last.agent === entry.agent) {
      merged[merged.length - 1] = { ...last, content: last.content + entry.content };
    } else {
      merged.push(entry);
    }
  }

  return (
    <div className="h-full overflow-y-auto font-mono text-[11px] leading-relaxed p-3 bg-[#0c0c0c]">
      {merged.length === 0 && (
        <div className="text-gray-700 text-center py-6">스트림 대기 중...</div>
      )}
      {merged.map((entry, i) => (
        <div key={i} className="flex gap-2 hover:bg-gray-900/50 px-1 py-0.5 rounded">
          <span className="text-gray-700 shrink-0 w-16">{entry.timestamp}</span>
          <span className={`shrink-0 w-10 font-bold ${TYPE_COLORS[entry.type]}`}>
            {TYPE_LABELS[entry.type]}
          </span>
          <span className="text-gray-600 shrink-0 w-20 truncate">[{entry.agent}]</span>
          <span className={`flex-1 whitespace-pre-wrap break-all ${TYPE_COLORS[entry.type]}`}>
            {entry.content}
          </span>
        </div>
      ))}
      <div ref={scrollRef} />
    </div>
  );
}
