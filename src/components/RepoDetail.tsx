import React, { useState, useEffect } from 'react';
import { Repository, FileContent, Commit } from '../types';
import { githubApi, aiApi } from '../lib/api';
import { ChevronLeft, Folder, File, ArrowLeft, History, Edit, Save, Terminal, Wand2, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface RepoDetailProps {
  repo: Repository;
  onBack: () => void;
  onRefresh: () => void;
}

export default function RepoDetail({ repo, onBack, onRefresh }: RepoDetailProps) {
  const [currentPath, setCurrentPath] = useState('');
  const [files, setFiles] = useState<FileContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [commits, setCommits] = useState<Commit[]>([]);
  const [activeTab, setActiveTab] = useState<'files' | 'history'>('files');
  const [editingFile, setEditingFile] = useState<FileContent | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [commitMessage, setCommitMessage] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    fetchContents(currentPath);
    fetchCommits();
  }, [currentPath]);

  const fetchContents = async (path: string) => {
    setLoading(true);
    try {
      const data = await githubApi.getContents(repo.owner.login, repo.name, path);
      setFiles(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch contents', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchCommits = async () => {
    try {
      const data = await githubApi.getCommits(repo.owner.login, repo.name);
      setCommits(data);
    } catch (err) {
      console.error('Failed to fetch commits', err);
    }
  };

  const handleFileClick = async (file: FileContent) => {
    if (file.type === 'dir') {
      setCurrentPath(file.path);
    } else {
      try {
        const fullFile = await githubApi.getContents(repo.owner.login, repo.name, file.path) as FileContent;
        if (fullFile.content) {
          const decodedContent = atob(fullFile.content.replace(/\n/g, ''));
          setEditingFile(fullFile);
          setFileContent(decodedContent);
          setActiveTab('files');
          setStatus(null);
        }
      } catch (err) {
        console.error('Failed to load file content', err);
      }
    }
  };

  const goBackPath = () => {
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join('/'));
  };

  const handleGenerateAI = async () => {
    if (!editingFile) return;
    setIsGenerating(true);
    try {
      const changes = {
        added: [],
        modified: [editingFile.path],
        deleted: [],
        diffSummary: `User is editing ${editingFile.path}. Content summary: ${fileContent.substring(0, 200)}...`
      };
      const result = await aiApi.generateCommitMessage(changes);
      setCommitMessage(result.message);
    } catch (err) {
      console.error('AI generation failed', err);
      setCommitMessage('feat: update ' + editingFile.path);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCommit = async () => {
    if (!editingFile || !commitMessage) return;
    setIsCommitting(true);
    setStatus(null);
    try {
      const encodedContent = btoa(fileContent);
      await githubApi.updateFile(repo.owner.login, repo.name, editingFile.path, {
        message: commitMessage,
        content: encodedContent,
        sha: editingFile.sha
      });
      setStatus({ type: 'success', message: 'Committed successfully!' });
      fetchContents(currentPath);
      fetchCommits();
      setCommitMessage('');
      const updatedFile = await githubApi.getContents(repo.owner.login, repo.name, editingFile.path) as FileContent;
      setEditingFile(updatedFile);
    } catch (err: any) {
      console.error('Commit failed', err);
      setStatus({ type: 'error', message: err.response?.data?.message || 'Failed to push changes.' });
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Detail Header */}
      <header className="h-16 border-b border-soft-border flex items-center justify-between px-8 shrink-0 bg-white z-10">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-1 hover:bg-slate-100 rounded text-slate-500 mr-2">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="text-slate-400">{repo.owner.login}</span>
            <span className="text-slate-300">/</span>
            <span className="text-slate-900 font-bold">{repo.name}</span>
          </div>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 uppercase border border-soft-border">
            {repo.private ? 'Private' : 'Public'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-md border border-soft-border">
            <button 
              onClick={() => setActiveTab('files')}
              className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'files' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Files
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1 rounded text-xs font-bold uppercase tracking-wider transition-all ${activeTab === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              History
            </button>
          </div>
          {editingFile && (
             <button 
              onClick={handleCommit}
              disabled={isCommitting || !commitMessage}
              className="text-sm font-medium px-4 py-1.5 bg-indigo-600 text-white rounded-md shadow-sm hover:bg-indigo-700 flex items-center gap-2 disabled:opacity-50"
            >
              {isCommitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Push Changes
            </button>
          )}
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Explorer Sidebar */}
        <div className="w-64 border-r border-soft-border flex flex-col bg-slate-50">
          <div className="p-4 border-b border-soft-border bg-white flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-tight">Explorer</h4>
            {currentPath && (
              <button onClick={goBackPath} className="text-[10px] text-indigo-600 hover:underline">UP</button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5 scrollbar-hide">
            {loading ? (
              <div className="flex justify-center p-4"><Loader2 className="w-4 h-4 animate-spin text-slate-300" /></div>
            ) : activeTab === 'files' ? (
              files.map(file => (
                <div 
                  key={file.sha}
                  onClick={() => handleFileClick(file)}
                  className={`flex items-center gap-2 px-2 py-1.5 text-[13px] rounded cursor-pointer transition-colors ${editingFile?.path === file.path ? 'bg-indigo-50 text-indigo-700 font-medium' : 'hover:bg-slate-200 text-slate-600'}`}
                >
                  {file.type === 'dir' ? (
                    <Folder className="w-4 h-4 text-slate-400" />
                  ) : (
                    <File className="w-4 h-4 text-slate-400" />
                  )}
                  <span className="truncate">{file.name}</span>
                </div>
              ))
            ) : (
              commits.map(commit => (
                <div key={commit.sha} className="px-2 py-3 border-b border-soft-border/50 hover:bg-white transition-colors">
                  <p className="text-xs font-bold text-slate-900 line-clamp-1">{commit.commit.message}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{commit.author.login} • {new Date(commit.commit.author.date).toLocaleDateString()}</p>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          <div className="flex-1 font-mono text-[13px] leading-relaxed p-6 overflow-hidden relative overflow-y-auto">
            {editingFile ? (
              <textarea
                className="w-full h-full bg-transparent text-slate-800 outline-none resize-none spellcheck-false"
                value={fileContent}
                onChange={(e) => setFileContent(e.target.value)}
                spellCheck={false}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-slate-300">
                <div className="text-center">
                  <Terminal className="w-12 h-12 mx-auto mb-2 opacity-10" />
                  <p className="text-sm font-medium">Select a file to edit</p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom Commit Panel */}
          <AnimatePresence>
            {editingFile && (
              <motion.div 
                initial={{ y: 200 }}
                animate={{ y: 0 }}
                exit={{ y: 200 }}
                className="h-48 border-t border-soft-border p-5 bg-slate-50 flex gap-6 shrink-0"
              >
                <div className="flex-1 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Commit Message</label>
                    <button 
                      onClick={handleGenerateAI}
                      disabled={isGenerating}
                      className="text-[11px] font-bold text-indigo-600 flex items-center gap-1 hover:text-indigo-800 disabled:opacity-50"
                    >
                      {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                      ✨ AI GENERATE (QWEN)
                    </button>
                  </div>
                  <textarea 
                    className="flex-1 p-3 text-sm border border-soft-border rounded bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                    placeholder="feat(core): update logic for data sync"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                  />
                </div>
                <div className="w-64 flex flex-col justify-end">
                  <div className={`text-[11px] mb-4 p-3 rounded border ${status ? (status.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700') : 'bg-slate-200/50 text-slate-500 border-slate-200'}`}>
                    <strong>Status:</strong> {status ? status.message : '1 file staged for commit. Ready to push.'}
                  </div>
                  <button 
                    onClick={handleCommit}
                    disabled={isCommitting || !commitMessage}
                    className="w-full py-3 bg-slate-900 text-white rounded font-bold text-sm shadow-md hover:bg-slate-800 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:bg-slate-400"
                  >
                    {isCommitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Commit & Push'}
                    <ChevronLeft className="w-4 h-4 rotate-180" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
