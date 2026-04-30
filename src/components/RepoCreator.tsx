import React, { useState, useRef } from 'react';
import { githubApi } from '../lib/api';
import { Repository } from '../types';
import { X, Loader2, AlertCircle, FolderPlus, FileText } from 'lucide-react';

interface RepoCreatorProps {
  onCancel: () => void;
  onCreated: (repo: Repository) => void;
}

export default function RepoCreator({ onCancel, onCreated }: RepoCreatorProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [autoInit, setAutoInit] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'empty' | 'folder'>('empty');
  const [selectedFiles, setSelectedFiles] = useState<{ path: string, content: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const data: { path: string, content: string }[] = [];
    setLoading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const path = file.webkitRelativePath.split('/').slice(1).join('/');
        
        // Basic filter: skip common binary/ignored dirs
        if (
          path.includes('node_modules/') || 
          path.includes('.git/') || 
          path.includes('dist/') ||
          path.includes('.DS_Store')
        ) continue;

        // Skip binary-like extensions roughly for this demo
        const isBinary = /\.(jpg|jpeg|png|gif|pdf|zip|exe|dll|so|o)$/i.test(file.name);
        if (isBinary) continue;

        try {
          const content = await readFileAsText(file);
          data.push({ path, content });
        } catch (err) {
          console.warn(`Skipped ${path}: could not read as text`);
        }
      }
      setSelectedFiles(data);
      if (data.length > 0 && !name) {
        // Auto-name from folder if empty
        const folderName = files[0].webkitRelativePath.split('/')[0];
        setName(folderName.toLowerCase().replace(/ /g, '-'));
      }
    } catch (err) {
      setError('Failed to read folder contents');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    setLoading(true);
    setError(null);
    try {
      // Force auto_init: true if we're uploading a folder, so we have a 'main' branch to push to
      const repo = await githubApi.createRepo({
        name,
        description,
        private: isPrivate,
        auto_init: uploadMode === 'folder' ? true : autoInit
      });

      if (uploadMode === 'folder' && selectedFiles.length > 0) {
        // Wait for GitHub to stabilize the fresh repo
        await new Promise(r => setTimeout(r, 2000));
        
        await githubApi.pushFiles(repo.owner.login, repo.name, {
            message: 'initial: import from local directory',
            files: selectedFiles
        });
      }

      onCreated(repo);
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to create repository');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto bg-white p-8 rounded-lg shadow-sm border border-soft-border">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight">Create Repository</h2>
        <button onClick={onCancel} className="p-1 hover:bg-slate-100 rounded text-slate-400 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-100 text-red-600 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-xs font-semibold">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex gap-4 p-1 bg-slate-100 rounded-lg mb-6">
          <button 
            type="button"
            onClick={() => setUploadMode('empty')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${uploadMode === 'empty' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <FileText className="w-3 h-3" />
            Empty Repo
          </button>
          <button 
            type="button"
            onClick={() => setUploadMode('folder')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${uploadMode === 'folder' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <FolderPlus className="w-3 h-3" />
            From Folder
          </button>
        </div>

        {uploadMode === 'folder' && (
          <div className="p-4 border-2 border-dashed border-indigo-100 rounded-xl bg-indigo-50/30 text-center mb-6">
            <input 
              type="file" 
              ref={fileInputRef}
              // @ts-ignore
              webkitdirectory="" 
              directory="" 
              multiple 
              onChange={handleFolderSelect}
              className="hidden" 
            />
            {selectedFiles.length > 0 ? (
              <div>
                <p className="text-sm font-bold text-indigo-600 mb-1">{selectedFiles.length} files selected</p>
                <button 
                  type="button" 
                  onClick={() => fileInputRef.current?.click()}
                  className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 underline"
                >
                  Change Folder
                </button>
              </div>
            ) : (
              <button 
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center gap-2 mx-auto"
              >
                <FolderPlus className="w-8 h-8 text-indigo-300" />
                <span className="text-sm font-bold text-slate-600">Select local directory to import</span>
                <span className="text-[10px] text-slate-400 max-w-[200px]">We'll automatically read and prepare the files for GitHub.</span>
              </button>
            )}
          </div>
        )}

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Name</label>
          <input
            type="text"
            required
            className="w-full px-4 py-2.5 rounded-md border border-soft-border bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm"
            placeholder="my-project"
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().replace(/ /g, '-'))}
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Description</label>
          <textarea
            className="w-full px-4 py-2.5 rounded-md border border-soft-border bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all text-sm resize-none"
            rows={2}
            placeholder="Project description..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer p-3 border border-soft-border rounded-md hover:bg-slate-50 transition-colors">
            <input
              type="checkbox"
              className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800">Private</p>
              <p className="text-[11px] text-slate-500">Only you can see this repository.</p>
            </div>
          </label>

          {uploadMode === 'empty' && (
            <label className="flex items-center gap-3 cursor-pointer p-3 border border-soft-border rounded-md hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                checked={autoInit}
                onChange={(e) => setAutoInit(e.target.checked)}
              />
              <div className="flex-1">
                <p className="text-sm font-bold text-slate-800">Initialize README</p>
                <p className="text-[11px] text-slate-500">Add a README.md to start immediately.</p>
              </div>
            </label>
          )}
        </div>

        <div className="pt-4 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 text-slate-600 font-bold text-sm hover:text-slate-900 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !name || (uploadMode === 'folder' && selectedFiles.length === 0)}
            className="flex-[2] py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded shadow-sm transition-all flex items-center justify-center gap-2 text-sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Repository'}
          </button>
        </div>
      </form>
    </div>
  );
}
