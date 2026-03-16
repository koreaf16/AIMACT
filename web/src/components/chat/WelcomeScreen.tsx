'use client';

import { Database, Code, ShieldAlert, Cpu } from 'lucide-react';
import type { AgentRole } from '../../lib/types';

interface WelcomeScreenProps {
  onQuickAction: (role: AgentRole) => void;
}

const actions: { role: AgentRole; icon: React.ElementType; title: string; description: string; gradient: string; iconColor: string }[] = [
  { role: 'Architect', icon: Database, title: '설계 요청', description: '시스템 아키텍처 설계, DB 스키마, API 설계', gradient: 'bg-blue-50 border-blue-100 hover:bg-blue-100/80', iconColor: 'text-blue-600' },
  { role: 'Coder', icon: Code, title: '코드 작성', description: '기능 구현, 리팩토링, 코드 생성', gradient: 'bg-green-50 border-green-100 hover:bg-green-100/80', iconColor: 'text-green-600' },
  { role: 'Debugger', icon: ShieldAlert, title: '버그 분석', description: '에러 추적, 디버깅, 성능 분석', gradient: 'bg-orange-50 border-orange-100 hover:bg-orange-100/80', iconColor: 'text-orange-600' },
  { role: 'Bulk', icon: Cpu, title: '대량 처리', description: '배치 작업, 대량 변환, 자동화', gradient: 'bg-purple-50 border-purple-100 hover:bg-purple-100/80', iconColor: 'text-purple-600' },
];

export function WelcomeScreen({ onQuickAction }: WelcomeScreenProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-8 bg-white">
      <div className="max-w-3xl w-full text-center space-y-12">
        <div className="space-y-4">
          <h1 className="text-6xl font-black bg-clip-text text-transparent bg-gradient-to-r from-[#1a73e8] via-[#8e24aa] to-[#d81b60] tracking-tight pb-1">
            AI-MACT
          </h1>
          <p className="text-gray-500 text-xl font-medium">AI Multi-Agent Control Tower</p>
        </div>

        <div className="grid grid-cols-2 gap-5">
          {actions.map(({ role, icon: Icon, title, description, gradient, iconColor }) => (
            <button
              key={role}
              onClick={() => onQuickAction(role)}
              className={`group text-left p-6 rounded-[24px] border transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-sm hover:shadow-md ${gradient}`}
            >
              <div className={`w-12 h-12 rounded-2xl bg-white shadow-sm flex items-center justify-center mb-4 transition-transform group-hover:scale-110 duration-300`}>
                <Icon className={`w-6 h-6 ${iconColor}`} />
              </div>
              <h3 className="text-base font-bold text-gray-800 mb-1.5">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{description}</p>
            </button>
          ))}
        </div>

        <div className="pt-4 flex flex-col items-center gap-3">
           <p className="text-sm text-gray-400 font-medium">
             시작하려면 원하는 작업 카드를 선택하거나 아래 입력창에 메시지를 입력하세요.
           </p>
           <div className="flex items-center gap-4 text-xs text-gray-500 bg-gray-50 px-4 py-2 rounded-full border border-gray-100">
             <span><kbd className="bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-sm text-gray-600">Ctrl</kbd> + <kbd className="bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-sm text-gray-600">N</kbd> 새 대화</span>
             <span className="w-px h-3 bg-gray-200" />
             <span><kbd className="bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-sm text-gray-600">Ctrl</kbd> + <kbd className="bg-white border border-gray-200 px-1.5 py-0.5 rounded shadow-sm text-gray-600">B</kbd> 사이드바</span>
           </div>
        </div>
      </div>
    </div>
  );
}
