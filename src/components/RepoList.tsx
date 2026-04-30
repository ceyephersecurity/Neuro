import React from 'react';
import { Repository } from '../types';
import { Star, GitBranch, Lock, Globe, ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';

interface RepoListProps {
  repos: Repository[];
  onSelectRepo: (repo: Repository) => void;
}

export default function RepoList({ repos, onSelectRepo }: RepoListProps) {
  if (repos.length === 0) {
    return (
      <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-300">
        <p className="text-gray-500 mb-4">No repositories found.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {repos.map((repo, index) => (
        <motion.div
          key={repo.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05 }}
          onClick={() => onSelectRepo(repo)}
          className="group bg-white p-5 rounded-lg border border-soft-border shadow-sm hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer relative flex flex-col"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-slate-800 truncate pr-2 tracking-tight">{repo.name}</h3>
            {repo.private ? (
              <div className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold uppercase border border-soft-border">
                Private
              </div>
            ) : (
              <div className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold uppercase border border-indigo-100">
                Public
              </div>
            )}
          </div>
          
          <p className="text-sm text-slate-500 mb-6 line-clamp-2 min-h-[40px] leading-relaxed">
            {repo.description || "No description provided."}
          </p>
          
          <div className="flex items-center justify-between text-xs text-slate-400 mt-auto pt-4 border-t border-slate-50 group-hover:border-indigo-50 transition-colors">
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1 font-medium">
                <GitBranch className="w-3.5 h-3.5" />
                {repo.default_branch}
              </span>
            </div>
            <span className="font-mono">{new Date(repo.updated_at).toLocaleDateString()}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
