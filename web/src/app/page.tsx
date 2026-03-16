"use client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Folder, ExternalLink, Info } from 'lucide-react';

interface Workspace {
  path: string;
  name: string;
  description?: string;
}

export default function Home() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState({
    path: '',
    name: '',
    description: ''
  });
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const fetchWorkspaces = () => {
    fetch('http://localhost:4000/api/workspaces')
      .then(res => res.json())
      .then(data => setWorkspaces(data))
      .catch(console.error);
  };

  const handleSelect = (path: string) => {
    router.push(`/workspace?path=${encodeURIComponent(path)}`);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWorkspace)
      });
      if (res.ok) {
        setShowModal(false);
        setNewWorkspace({ path: '', name: '', description: '' });
        fetchWorkspaces();
      } else {
        const errData = await res.json();
        alert(`생성 실패: ${errData.error || '알 수 없는 오류'}`);
      }
    } catch (err) {
      console.error(err);
      alert('서버와 통신 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    if (!confirm('정말 이 워크스페이스 설정을 삭제하시겠습니까? (실제 파일은 삭제되지 않습니다)')) return;
    
    try {
      const res = await fetch(`http://localhost:4000/api/workspaces/${encodeURIComponent(path)}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchWorkspaces();
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8 font-sans">
      <header className="max-w-6xl mx-auto mb-12 flex justify-between items-end border-b border-gray-800 pb-8">
        <div>
          <h1 className="text-5xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 tracking-tight">
            AI-MACT
          </h1>
          <p className="text-gray-500 mt-3 text-lg font-medium">AI Multi-Agent Control Tower Dashboard</p>
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-900/20 active:scale-95"
        >
          <Plus className="w-5 h-5" /> New Workspace
        </button>
      </header>

      <main className="max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-8 text-gray-400">
          <Folder className="w-5 h-5 text-blue-500" />
          <h2 className="text-xl font-bold uppercase tracking-widest text-sm">Registered Workspaces</h2>
        </div>
        
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {workspaces.map(ws => (
            <div 
              key={ws.path} 
              className="group relative bg-gray-900 border border-gray-800 p-6 rounded-2xl cursor-pointer hover:border-blue-500/50 hover:bg-gray-800/50 transition-all duration-300 shadow-sm hover:shadow-xl hover:shadow-blue-900/10"
              onClick={() => handleSelect(ws.path)}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-blue-900/20 rounded-xl text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Folder className="w-6 h-6" />
                </div>
                <button 
                  onClick={(e) => handleDelete(e, ws.path)}
                  className="p-2 text-gray-600 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                  title="Delete Workspace Config"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              
              <h3 className="text-xl font-bold text-gray-100 mb-2 group-hover:text-blue-400 transition-colors">{ws.name}</h3>
              <p className="text-gray-500 text-sm line-clamp-2 mb-4 h-10">
                {ws.description || 'No description provided.'}
              </p>
              
              <div className="pt-4 border-t border-gray-800 flex items-center justify-between">
                <code className="text-[10px] font-mono text-gray-600 truncate max-w-[180px]">
                  {ws.path}
                </code>
                <ExternalLink className="w-4 h-4 text-gray-700 group-hover:text-blue-500 transition-colors" />
              </div>
            </div>
          ))}
          
          {workspaces.length === 0 && (
            <div className="col-span-full py-20 flex flex-col items-center justify-center border-2 border-dashed border-gray-800 rounded-3xl">
              <Folder className="w-16 h-16 text-gray-800 mb-4" />
              <p className="text-gray-500 font-medium">No workspaces found.</p>
              <p className="text-gray-700 text-sm mt-1">Click 'New Workspace' to get started.</p>
            </div>
          )}
        </div>
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-gray-800 bg-gray-950/50">
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Plus className="w-5 h-5 text-blue-500" /> Create Workspace
              </h3>
            </div>
            
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Project Name</label>
                <input
                  type="text"
                  required
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500 transition-all"
                  placeholder="e.g. My Awesome Project"
                  value={newWorkspace.name}
                  onChange={e => setNewWorkspace({...newWorkspace, name: e.target.value})}
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Local Path</label>
                <input
                  type="text"
                  required
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:border-blue-500 transition-all"
                  placeholder="C:\Projects\my-app"
                  value={newWorkspace.path}
                  onChange={e => setNewWorkspace({...newWorkspace, path: e.target.value})}
                />
                <p className="text-[10px] text-gray-600 mt-1.5 flex items-center gap-1">
                  <Info className="w-3 h-3" /> Full system path to the project directory.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 ml-1">Description</label>
                <textarea
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm min-h-[100px] focus:outline-none focus:border-blue-500 transition-all resize-none"
                  placeholder="Briefly describe this workspace..."
                  value={newWorkspace.description}
                  onChange={e => setNewWorkspace({...newWorkspace, description: e.target.value})}
                />
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-800 text-sm font-bold hover:bg-gray-800 transition-all"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-blue-900/20"
                >
                  {loading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
