import axios from 'axios';
import { Repository, FileContent, User, Commit } from '../types';

const api = axios.create({
  baseURL: '/api',
});

export const authApi = {
  getAuthUrl: () => api.get<{ url: string }>('/auth/url').then(res => res.data),
  getCurrentUser: () => api.get<User>('/auth/me').then(res => res.data),
  logout: () => api.post('/auth/logout').then(res => res.data),
};

export const githubApi = {
  getRepos: () => api.get<Repository[]>('/repos').then(res => res.data),
  createRepo: (data: { name: string; description: string; private: boolean; auto_init: boolean }) => 
    api.post<Repository>('/repos', data).then(res => res.data),
  getContents: (owner: string, repo: string, path: string = '') => 
    api.get<FileContent | FileContent[]>(`/repos/${owner}/${repo}/contents/${path}`).then(res => res.data),
  updateFile: (owner: string, repo: string, path: string, data: { message: string; content: string; sha?: string }) =>
    api.put(`/repos/${owner}/${repo}/contents/${path}`, data).then(res => res.data),
  getCommits: (owner: string, repo: string) =>
    api.get<Commit[]>(`/repos/${owner}/${repo}/commits`).then(res => res.data),
};

export const aiApi = {
  generateCommitMessage: (changes: { added: string[]; modified: string[]; deleted: string[]; diffSummary: string }) =>
    api.post<{ message: string }>('/generate-commit-message', { changes }).then(res => res.data),
};
