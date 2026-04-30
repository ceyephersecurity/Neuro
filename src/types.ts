export interface User {
  login: string;
  id: number;
  avatar_url: string;
  name: string;
  email: string | null;
}

export interface Repository {
  id: number;
  name: string;
  full_name: string;
  owner: {
    login: string;
    avatar_url: string;
  };
  description: string;
  private: boolean;
  html_url: string;
  updated_at: string;
  default_branch: string;
}

export interface FileContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  git_url: string;
  download_url: string | null;
  type: 'file' | 'dir';
  content?: string;
  encoding?: string;
}

export interface Commit {
  sha: string;
  commit: {
    author: {
      name: string;
      date: string;
    };
    message: string;
  };
  author: {
    login: string;
    avatar_url: string;
  };
}

export interface StagedChange {
  path: string;
  content: string;
  type: 'added' | 'modified' | 'deleted';
  originalContent?: string;
}
