"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Database, 
  Code, 
  ShieldAlert, 
  Cpu, 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  X,
  ArrowLeft,
  Bot,
  Terminal,
  Layers,
  Check,
  PlusCircle,
  Settings2
} from 'lucide-react';

interface Model {
  id: string;
  name: string;
  model: string;
  command: string;
  contextStrategy: string;
  systemPrompt: string;
  customEnv?: Record<string, string>;
}

interface RoleAssignments {
  Architect: string;
  Coder: string;
  Debugger: string;
  Bulk: string;
}

const ROLES = ['Architect', 'Coder', 'Debugger', 'Bulk'] as const;
const STRATEGIES = ['Architect', 'Coder', 'Debugger', 'Bulk', 'General'] as const;

export default function AgentModelManagement() {
  const [models, setModels] = useState<Model[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<RoleAssignments>({
    Architect: '', Coder: '', Debugger: '', Bulk: ''
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingModel, setEditingModel] = useState<Model | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // 환경 변수 편집용 임시 상태
  const [envPairs, setEnvPairs] = useState<{key: string, value: string}[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [modelsRes, rolesRes] = await Promise.all([
        fetch('http://localhost:4000/api/models'),
        fetch('http://localhost:4000/api/roles')
      ]);
      const mData = await modelsRes.json();
      const rData = await rolesRes.json();
      setModels(mData);
      setRoleAssignments(rData);
    } catch (err: any) {
      setError(`데이터 연동 실패: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditStart = (model: Model) => {
    setEditingModel(model);
    setIsAdding(false);
    // Record를 Array로 변환하여 편집 용이하게 함
    const pairs = Object.entries(model.customEnv || {}).map(([key, value]) => ({ key, value }));
    setEnvPairs(pairs.length > 0 ? pairs : [{ key: '', value: '' }]);
  };

  const handleAddEnv = () => setEnvPairs([...envPairs, { key: '', value: '' }]);
  const handleRemoveEnv = (index: number) => setEnvPairs(envPairs.filter((_, i) => i !== index));
  const handleUpdateEnv = (index: number, field: 'key' | 'value', val: string) => {
    const next = [...envPairs];
    next[index][field] = val;
    setEnvPairs(next);
  };

  const handleSaveModel = async () => {
    if (!editingModel) return;

    // Array를 다시 Record로 변환
    const customEnv: Record<string, string> = {};
    envPairs.forEach(p => {
      if (p.key.trim()) customEnv[p.key.trim()] = p.value;
    });

    const finalModel = { ...editingModel, customEnv };
    const method = isAdding ? 'POST' : 'PUT';
    const url = isAdding 
      ? 'http://localhost:4000/api/models' 
      : `http://localhost:4000/api/models/${finalModel.id}`;

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalModel)
      });
      
      if (res.ok) {
        await fetchData();
        setEditingModel(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignRole = async (role: string, modelId: string) => {
    try {
      const res = await fetch('http://localhost:4000/api/roles/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, modelId })
      });
      if (res.ok) {
        setRoleAssignments(prev => ({ ...prev, [role]: modelId }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 font-sans p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-4">
            <Link href="/workspace" className="p-2 hover:bg-gray-900 rounded-full transition-colors">
              <ArrowLeft className="w-6 h-6 text-gray-400" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-3">
                <Bot className="w-8 h-8 text-blue-500" />
                AI 모델 및 역할 관리
              </h1>
              <p className="text-gray-400 text-sm mt-1">실행 명령어와 환경 변수(Env)를 포함한 모델 설정을 관리합니다.</p>
            </div>
          </div>
          <button 
            onClick={() => {
              setEditingModel({ id: `m-${Date.now()}`, name: '', model: '', command: '', contextStrategy: 'General', systemPrompt: '' });
              setIsAdding(true);
              setEnvPairs([{ key: '', value: '' }]);
            }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium transition-all"
          >
            <Plus className="w-5 h-5" /> 새 모델 등록
          </button>
        </header>

        {error && <div className="bg-red-900/20 border border-red-800 text-red-400 p-4 rounded-xl mb-6">{error}</div>}

        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-950/50 border-b border-gray-800">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">AI Model & Command</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Environment Vars</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">Assign Roles</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {models.map((model) => (
                <tr key={model.id} className="hover:bg-gray-800/30 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="font-bold text-white">{model.name}</div>
                    <div className="flex items-center gap-2 text-[11px] text-green-500 font-mono mt-1">
                      <Terminal className="w-3 h-3" />
                      <span className="truncate max-w-[200px]">{model.command}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1 max-w-[300px]">
                      {model.customEnv && Object.entries(model.customEnv).length > 0 ? (
                        Object.entries(model.customEnv).map(([k, v]) => (
                          <div key={k} className="flex items-center gap-1 bg-gray-950 border border-gray-800 px-2 py-0.5 rounded shadow-sm group/env" title={`${k}=${v}`}>
                            <span className="text-[9px] text-blue-500 font-bold">{k}</span>
                            <span className="text-[9px] text-gray-600">=</span>
                            <span className="text-[9px] text-gray-400 font-mono truncate max-w-[80px]">{v}</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-[10px] text-gray-600 italic">No variables</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center justify-center gap-1.5">
                      {ROLES.map(role => {
                        const isAssigned = roleAssignments[role] === model.id;
                        return (
                          <button
                            key={role}
                            onClick={() => handleAssignRole(role, model.id)}
                            className={`px-2.5 py-1 rounded-full text-[9px] font-bold border transition-all ${
                              isAssigned ? 'bg-blue-600 border-blue-400 text-white' : 'bg-gray-950 border-gray-800 text-gray-500 hover:text-gray-300'
                            }`}
                          >
                            {role}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleEditStart(model)} className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white"><Edit2 className="w-4 h-4" /></button>
                      <button className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editingModel && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-6 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-blue-500" />
                  {isAdding ? '새 AI 모델 등록' : 'AI 모델 및 환경 변수 수정'}
                </h2>
                <button onClick={() => setEditingModel(null)} className="text-gray-500 hover:text-white"><X className="w-6 h-6" /></button>
              </div>
              
              <div className="p-8 grid grid-cols-12 gap-8 overflow-y-auto">
                {/* Left: Basic Info */}
                <div className="col-span-5 space-y-5">
                  <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border-b border-gray-800 pb-2 mb-4">Basic Configuration</h3>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1.5 ml-1">모델 이름</label>
                    <input type="text" value={editingModel.name} onChange={e => setEditingModel({...editingModel, name: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white focus:border-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1.5 ml-1 text-green-500 flex items-center gap-2"><Terminal className="w-3 h-3" /> 실행 명령어 (CLI)</label>
                    <input type="text" value={editingModel.command} onChange={e => setEditingModel({...editingModel, command: e.target.value})} className="w-full bg-gray-950 border border-green-900/30 rounded-lg px-4 py-2.5 text-sm text-green-400 font-mono focus:border-green-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1.5 ml-1">컨텍스트 주입기 (Strategy)</label>
                    <select value={editingModel.contextStrategy} onChange={e => setEditingModel({...editingModel, contextStrategy: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-sm text-white outline-none">
                      {STRATEGIES.map(s => <option key={s} value={s}>{s} Strategy</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-400 mb-1.5 ml-1">기본 시스템 프롬프트</label>
                    <textarea value={editingModel.systemPrompt} onChange={e => setEditingModel({...editingModel, systemPrompt: e.target.value})} className="w-full bg-gray-950 border border-gray-800 rounded-lg px-4 py-2.5 text-xs text-gray-300 font-mono h-40 resize-none outline-none focus:border-blue-500" />
                  </div>
                </div>

                {/* Right: Custom Env Vars */}
                <div className="col-span-7 flex flex-col h-full">
                  <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-4">
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Environment Variables (Custom Env)</h3>
                    <button onClick={handleAddEnv} className="text-blue-500 hover:text-blue-400 flex items-center gap-1 text-[10px] font-bold">
                      <PlusCircle className="w-3.5 h-3.5" /> ADD VAR
                    </button>
                  </div>
                  
                  <div className="space-y-3 flex-1">
                    {envPairs.map((pair, idx) => (
                      <div key={idx} className="flex items-center gap-3 animate-in fade-in duration-200">
                        <div className="flex-1">
                          <input 
                            placeholder="VARIABLE_NAME" 
                            value={pair.key} 
                            onChange={e => handleUpdateEnv(idx, 'key', e.target.value)}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-[11px] font-mono text-white outline-none focus:border-blue-500"
                          />
                        </div>
                        <div className="text-gray-600">=</div>
                        <div className="flex-[1.5]">
                          <input 
                            placeholder="value" 
                            value={pair.value} 
                            onChange={e => handleUpdateEnv(idx, 'value', e.target.value)}
                            className="w-full bg-gray-950 border border-gray-800 rounded-lg px-3 py-2 text-[11px] font-mono text-gray-300 outline-none focus:border-blue-500"
                          />
                        </div>
                        <button onClick={() => handleRemoveEnv(idx)} className="p-2 text-gray-600 hover:text-red-500 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    {envPairs.length === 0 && <div className="text-center py-10 text-gray-600 text-xs italic">등록된 환경 변수가 없습니다.</div>}
                  </div>
                  
                  <div className="mt-auto pt-6 bg-gray-900 border-t border-gray-800 flex justify-end gap-3">
                    <button onClick={() => setEditingModel(null)} className="px-6 py-2 text-gray-400 hover:text-white font-medium">취소</button>
                    <button onClick={handleSaveModel} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-10 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/30">
                      <Save className="w-4 h-4" /> 설정 저장하기
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
