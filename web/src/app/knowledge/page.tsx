"use client";

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  ArrowLeft,
  FileText,
  Share2,
  Zap,
  ChevronRight,
  Info
} from 'lucide-react';

interface SearchResult {
  path: string;
  title: string;
  content: string;
  type: string;
  similarity: number;
}

function KnowledgeSearchContent() {
  const searchParams = useSearchParams();
  const workspacePath = searchParams.get('workspace') || 'C:\\AIMACT';
  
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setHasSearched(true);
    try {
      const res = await fetch(`http://localhost:4000/api/knowledge/search?q=${encodeURIComponent(searchTerm)}&workspace=${encodeURIComponent(workspacePath)}`);
      const data = await res.json();
      setResults(data);
    } catch (err) {
      console.error('Vector search failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-200 font-sans p-8">
      <div className="max-w-4xl mx-auto">
        {/* Navigation */}
        <nav className="mb-12">
          <Link href={`/workspace?path=${encodeURIComponent(workspacePath)}`} className="flex items-center gap-2 text-gray-500 hover:text-white transition-colors text-sm font-medium">
            <ArrowLeft className="w-4 h-4" />
            워크스페이스로 돌아가기
          </Link>
        </nav>

        {/* Hero Section */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center p-3 bg-purple-500/10 rounded-2xl mb-6">
            <Share2 className="w-10 h-10 text-purple-500" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-4 tracking-tight">AI 시맨틱 지식 검색</h1>
          <p className="text-gray-400 max-w-xl mx-auto leading-relaxed">
            Oracle 23ai 벡터 엔진이 질문의 의도를 분석하여<br/>
            프로젝트 코드와 설계 문서에서 가장 관련 있는 정보를 찾아냅니다.
          </p>
          <div className="mt-4 inline-block px-4 py-1.5 bg-gray-900 border border-gray-800 rounded-full text-[10px] font-mono text-gray-500">
            Workspace: {workspacePath}
          </div>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="relative mb-16">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
            <Search className="w-6 h-6 text-gray-500" />
          </div>
          <input 
            type="text"
            placeholder="예: '보안 취약점이 있는 코드가 있어?', '로그인 처리 방식 알려줘'..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-gray-900 border-2 border-gray-800 hover:border-gray-700 focus:border-purple-500 rounded-2xl pl-14 pr-32 py-5 text-lg text-white placeholder-gray-600 outline-none transition-all shadow-2xl shadow-purple-500/5"
          />
          <button 
            type="submit"
            disabled={loading}
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 text-white px-6 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2"
          >
            {loading ? '검색 중...' : <><Zap className="w-4 h-4" /> 검색</>}
          </button>
        </form>

        {/* Results Area */}
        <div className="space-y-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 animate-pulse">
              <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-gray-500 font-medium italic text-lg">벡터 공간을 탐색하고 있습니다...</p>
            </div>
          )}

          {!loading && results.length > 0 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between px-2">
                <h2 className="text-sm font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                  <Info className="w-4 h-4" /> 검색 결과 {results.length}개 (유사도 기준)
                </h2>
              </div>
              {results.map((result, idx) => (
                <div key={idx} className="group bg-gray-900/50 border border-gray-800 hover:border-purple-500/30 rounded-2xl p-6 transition-all">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-gray-950 rounded-lg border border-gray-800 group-hover:border-purple-500/50 transition-colors">
                        <FileText className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-white group-hover:text-purple-300 transition-colors">{result.title}</h3>
                        <p className="text-xs text-gray-500 mt-0.5 font-mono">{result.path}</p>
                      </div>
                    </div>
                    <div className="px-3 py-1 bg-purple-900/20 border border-purple-500/20 rounded-full">
                      <span className="text-[10px] font-bold text-purple-400 uppercase tracking-tighter">
                        Similarity: {(result.similarity).toFixed(4)}
                      </span>
                    </div>
                  </div>
                  <div className="bg-gray-950/50 rounded-xl p-4 border border-gray-800/50 text-sm text-gray-400 leading-relaxed overflow-hidden">
                    <pre className="whitespace-pre-wrap font-sans line-clamp-6 group-hover:line-clamp-none transition-all duration-500">
                      {result.content}
                    </pre>
                  </div>
                  <div className="mt-4 flex justify-end">
                    <button className="text-xs font-bold text-purple-500 hover:text-purple-400 flex items-center gap-1 transition-colors">
                      전체 컨텍스트 보기 <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && hasSearched && results.length === 0 && (
            <div className="text-center py-20 bg-gray-900/20 border-2 border-dashed border-gray-800 rounded-3xl">
              <p className="text-gray-500 text-lg">일치하는 지식이 없습니다.<br/><span className="text-sm opacity-50">다른 검색어로 시도해 보세요.</span></p>
            </div>
          )}

          {!loading && !hasSearched && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 opacity-50">
              <div className="p-6 bg-gray-900/30 border border-gray-800 rounded-2xl">
                <h4 className="text-sm font-bold text-gray-400 mb-2">💡 검색 팁</h4>
                <p className="text-xs text-gray-500 leading-relaxed">자연어(일상어)로 질문해 보세요. AI가 문맥을 이해하여 코드와 문서를 모두 찾아줍니다.</p>
              </div>
              <div className="p-6 bg-gray-900/30 border border-gray-800 rounded-2xl">
                <h4 className="text-sm font-bold text-gray-400 mb-2">⚡ 실시간 동기화</h4>
                <p className="text-xs text-gray-500 leading-relaxed">로컬 파일이 변경되면 벡터 데이터도 실시간으로 업데이트되어 항상 최신 정보를 검색합니다.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function KnowledgeSearch() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-gray-500">Loading...</div>}>
      <KnowledgeSearchContent />
    </Suspense>
  );
}
