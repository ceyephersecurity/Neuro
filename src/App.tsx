import React, { useState, useEffect } from 'react';
import { authApi, githubApi } from './lib/api';
import { User, Repository } from './types';
import { Github, LogOut, Plus, Folder, Loader2, GitBranch, History } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import RepoCreator from './components/RepoCreator';
import RepoList from './components/RepoList';
import RepoDetail from './components/RepoDetail';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [repos, setRepos] = useState<Repository[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
  const [showCreator, setShowCreator] = useState(false);

  useEffect(() => {
    fetchUser();
    
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        fetchUser();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchUser = async () => {
    try {
      const userData = await authApi.getCurrentUser();
      setUser(userData);
      fetchRepos();
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchRepos = async () => {
    try {
      const repoData = await githubApi.getRepos();
      setRepos(repoData);
    } catch (err) {
      console.error('Failed to fetch repos', err);
    }
  };

  const handleLogin = async () => {
    try {
      const { url } = await authApi.getAuthUrl();
      window.open(url, 'github_oauth', 'width=600,height=700');
    } catch (err) {
      console.error('Login failed', err);
    }
  };

  const handleLogout = async () => {
    await authApi.logout();
    setUser(null);
    setRepos([]);
    setSelectedRepo(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm border border-soft-border text-center"
        >
          <div className="w-16 h-16 bg-indigo-500 rounded-lg flex items-center justify-center mx-auto mb-6 shadow-indigo-200 shadow-lg">
            <Github className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2 tracking-tight">GitStream AI</h1>
          <p className="text-slate-500 mb-8 leading-relaxed">Manage your GitHub repositories with AI assistance. Seamless, simple, and command-line free.</p>
          <button
            onClick={handleLogin}
            className="w-full py-3 px-6 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg flex items-center justify-center gap-3 transition-all shadow-md active:scale-[0.98]"
          >
            <Github className="w-5 h-5" />
            Sign in with GitHub
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-white w-full">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 hidden md:flex flex-col shrink-0 text-slate-300">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3 cursor-pointer" onClick={() => { setSelectedRepo(null); setShowCreator(false); }}>
          <div className="w-8 h-8 bg-indigo-500 rounded flex items-center justify-center">
            <Github className="w-5 h-5 text-white" />
          </div>
          <span className="font-bold text-white tracking-tight">GitStream AI</span>
        </div>
        
        <div className="flex-1 py-4 overflow-y-auto scrollbar-hide">
          <div className="px-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Repositories</h3>
              <button 
                onClick={() => setShowCreator(true)}
                className="p-1 hover:text-white transition-colors"
                title="New Repository"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <nav className="space-y-0.5">
              {repos.slice(0, 10).map(repo => (
                <button
                  key={repo.id}
                  onClick={() => setSelectedRepo(repo)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${selectedRepo?.id === repo.id ? 'bg-slate-800 text-white font-medium' : 'hover:bg-slate-800'}`}
                >
                  <span className={`w-2 h-2 rounded-full ${repo.private ? 'bg-slate-600' : 'bg-green-400'}`}></span>
                  <span className="truncate">{repo.name}</span>
                </button>
              ))}
              {repos.length > 10 && (
                <button 
                  onClick={() => { setSelectedRepo(null); setShowCreator(false); }}
                  className="w-full text-left px-3 py-2 text-xs text-slate-500 hover:text-slate-300 italic"
                >
                  View all repositories...
                </button>
              )}
            </nav>
          </div>
        </div>

        <div className="p-4 mt-auto border-t border-slate-800 flex items-center gap-3">
          <img src={user.avatar_url} alt={user.login} className="w-8 h-8 rounded-full flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-white truncate">{user.login}</div>
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">GitHub User</div>
          </div>
          <button 
            onClick={handleLogout}
            className="p-1.5 text-slate-500 hover:text-red-400 transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header (Dynamic) */}
        {!selectedRepo && !showCreator && (
          <header className="h-16 border-b border-soft-border flex items-center justify-between px-8 shrink-0 bg-white z-10">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="text-slate-400">Home</span>
                <span className="text-slate-300">/</span>
                <span className="text-slate-900">Dashboard</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setShowCreator(true)}
                className="text-sm font-medium px-4 py-1.5 bg-indigo-600 text-white rounded-md shadow-sm hover:bg-indigo-700 transition-colors"
              >
                New Repo
              </button>
            </div>
          </header>
        )}

        <main className="flex-1 overflow-auto bg-slate-50">
          <div className={selectedRepo ? "h-full" : "p-8 max-w-5xl mx-auto"}>
            <AnimatePresence mode="wait">
              {selectedRepo ? (
                <motion.div
                  key="repo-detail"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full"
                >
                  <RepoDetail 
                    repo={selectedRepo} 
                    onBack={() => setSelectedRepo(null)} 
                    onRefresh={fetchRepos}
                  />
                </motion.div>
              ) : showCreator ? (
                <motion.div
                  key="repo-creator"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <RepoCreator 
                    onCancel={() => setShowCreator(false)} 
                    onCreated={(newRepo) => {
                      setRepos([newRepo, ...repos]);
                      setShowCreator(false);
                      setSelectedRepo(newRepo);
                    }}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="dashboard"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="mb-8">
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Your Projects</h1>
                    <p className="text-slate-500 font-medium italic">Active development from {user.login}</p>
                  </div>

                  <RepoList 
                    repos={repos} 
                    onSelectRepo={setSelectedRepo} 
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}
