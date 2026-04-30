import React, { useState } from 'react';
import { githubApi } from '../lib/api';
import { Repository } from '../types';
import { X, Loader2, AlertCircle } from 'lucide-react';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    setLoading(true);
    setError(null);
    try {
      const newRepo = await githubApi.createRepo({
        name,
        description,
        private: isPrivate,
        auto_init: autoInit
      });
      onCreated(newRepo);
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
            disabled={loading || !name}
            className="flex-[2] py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold rounded shadow-sm transition-all flex items-center justify-center gap-2 text-sm"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Repository'}
          </button>
        </div>
      </form>
    </div>
  );
}
