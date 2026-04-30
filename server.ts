import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import axios from 'axios';
import dotenv from 'dotenv';
import qs from 'qs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3001;

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));
  app.use(cookieParser());
  app.use(session({
    secret: 'github-repo-manager-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true, 
      sameSite: 'none',
      httpOnly: true,
    }
  }));

  // --- GitHub OAuth Routes ---
  
  app.get('/api/auth/url', (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const appUrl = process.env.APP_URL || 'http://localhost:3001';
    const redirectUri = `${appUrl}/auth/callback`;
    const scope = 'repo delete_repo read:user';
    
    if (!clientId) {
      return res.status(500).json({ error: 'GITHUB_CLIENT_ID not configured' });
    }

    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}&state=random_state`;
    res.json({ url: authUrl });
  });

  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code } = req.query;
    
    try {
      const data = qs.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      });

      const response = await axios.post('https://github.com/login/oauth/access_token', data, {
        headers: { 
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (response.data.access_token) {
        // @ts-ignore
        req.session.accessToken = response.data.access_token;
        
        res.send(`
          <html>
            <body>
              <script>
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                  window.close();
                } else {
                  window.location.href = '/';
                }
              </script>
              <p>Authentication successful. This window should close automatically.</p>
            </body>
          </html>
        `);
      } else {
        res.status(400).send('OAuth failed: No access token received. ' + JSON.stringify(response.data));
      }
    } catch (error) {
      console.error('OAuth token exchange error:', error);
      res.status(500).send('OAuth failed during token exchange');
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    // @ts-ignore
    const token = req.session.accessToken;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const response = await axios.get('https://api.github.com/user', {
        headers: { Authorization: `token ${token}` }
      });
      res.json(response.data);
    } catch (error) {
       // @ts-ignore
      console.error('Fetch user error:', error.response?.data || error.message);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // --- GitHub API Proxy Routes ---

  app.get('/api/repos', async (req, res) => {
    // @ts-ignore
    const token = req.session.accessToken;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const response = await axios.get('https://api.github.com/user/repos?sort=updated&per_page=100', {
        headers: { Authorization: `token ${token}` }
      });
      res.json(response.data);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch repos' });
    }
  });

  app.post('/api/repos', async (req, res) => {
    // @ts-ignore
    const token = req.session.accessToken;
    const { name, description, private: isPrivate, auto_init } = req.body;
    
    console.log("CREATE REPO ATTEMPT - BODY:", req.body);
    
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const response = await axios.post('https://api.github.com/user/repos', {
        name,
        description,
        private: isPrivate,
        auto_init
      }, {
        headers: { Authorization: `token ${token}` }
      });
      res.json(response.data);
    } catch (error) {
      // @ts-ignore
      console.error('Create repo error:', error.response?.data || error.message);
      // @ts-ignore
      res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to create repo' });
    }
  });

  app.delete('/api/repos/:owner/:repo', async (req, res) => {
    // @ts-ignore
    const token = req.session.accessToken;
    const { owner, repo } = req.params;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      await axios.delete(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { Authorization: `token ${token}` }
      });
      res.json({ success: true });
    } catch (error) {
      // @ts-ignore
      console.error('Delete repo error:', error.response?.data || error.message);
      // @ts-ignore
      res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to delete repo' });
    }
  });

  app.get('/api/repos/:owner/:repo/contents/:path(*)?', async (req, res) => {
    // @ts-ignore
    const token = req.session.accessToken;
    const { owner, repo, path: filePath } = req.params;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath || ''}`;
      const response = await axios.get(url, {
        headers: { Authorization: `token ${token}` }
      });
      res.json(response.data);
    } catch (error) {
      // @ts-ignore
      res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to fetch contents' });
    }
  });

  app.put('/api/repos/:owner/:repo/contents/:path(*)', async (req, res) => {
    // @ts-ignore
    const token = req.session.accessToken;
    const { owner, repo, path: filePath } = req.params;
    const { message, content, sha, branch } = req.body;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const response = await axios.put(`https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`, {
        message,
        content,
        sha,
        branch
      }, {
        headers: { Authorization: `token ${token}` }
      });
      res.json(response.data);
    } catch (error) {
      // @ts-ignore
      res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to update content' });
    }
  });

  app.get('/api/repos/:owner/:repo/commits', async (req, res) => {
    // @ts-ignore
    const token = req.session.accessToken;
    const { owner, repo } = req.params;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const response = await axios.get(`https://api.github.com/repos/${owner}/${repo}/commits`, {
        headers: { Authorization: `token ${token}` }
      });
      res.json(response.data);
    } catch (error) {
      // @ts-ignore
      res.status(error.response?.status || 500).json(error.response?.data || { error: 'Failed to fetch commits' });
    }
  });

  app.post('/api/repos/:owner/:repo/push', async (req, res) => {
    // @ts-ignore
    const token = req.session.accessToken;
    const { owner, repo } = req.params;
    const { message, files, branch } = req.body;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const headers = { Authorization: `token ${token}` };
      const defaultBranch = branch || 'main';

      // 1. Get the current commit SHA of the branch
      let latestCommitSha;
      try {
        const refRes = await axios.get(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`, { headers });
        latestCommitSha = refRes.data.object.sha;
      } catch (e) {
        // If the branch specifically is missing but the repo exists, try getting the default branch first
        const repoInfo = await axios.get(`https://api.github.com/repos/${owner}/${repo}`, { headers });
        const actualDefaultBranch = repoInfo.data.default_branch || 'main';
        const refRes = await axios.get(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/${actualDefaultBranch}`, { headers });
        latestCommitSha = refRes.data.object.sha;
      }

      // 2. Get the tree SHA of the latest commit
      const commitRes = await axios.get(`https://api.github.com/repos/${owner}/${repo}/git/commits/${latestCommitSha}`, { headers });
      const baseTreeSha = commitRes.data.tree.sha;

      // 3. Create blobs for each file
      const treeEntries = await Promise.all(files.map(async (file: any) => {
        const blobRes = await axios.post(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
          content: file.content,
          encoding: 'utf-8'
        }, { headers });
        return {
          path: file.path,
          mode: '100644',
          type: 'blob',
          sha: blobRes.data.sha
        };
      }));

      // 4. Create a new tree
      const newTreeRes = await axios.post(`https://api.github.com/repos/${owner}/${repo}/git/trees`, {
        base_tree: baseTreeSha,
        tree: treeEntries
      }, { headers });
      const newTreeSha = newTreeRes.data.sha;

      // 5. Create a new commit
      const newCommitRes = await axios.post(`https://api.github.com/repos/${owner}/${repo}/git/commits`, {
        message,
        tree: newTreeSha,
        parents: [latestCommitSha]
      }, { headers });
      const newCommitSha = newCommitRes.data.sha;

      // 6. Update the reference
      await axios.patch(`https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${defaultBranch}`, {
        sha: newCommitSha
      }, { headers });

      res.json({ success: true, commitSha: newCommitSha });
    } catch (error) {
      // @ts-ignore
      console.error('Push error:', error.response?.data || error.message);
      // @ts-ignore
      res.status(500).json({ error: 'Failed to push files', details: error.response?.data });
    }
  });

  // --- Ollama Commit Message Generation ---

  app.post('/api/generate-commit-message', async (req, res) => {
    const { changes } = req.body;
    const models = ['qwen2.5:3b', 'qwen2.5:1.5b', 'tinyllama:latest'];
    const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';

    // Safe handling of missing changes fields
    const added = changes?.added || [];
    const modified = changes?.modified || [];
    const deleted = changes?.deleted || [];
    const diffSummary = changes?.diffSummary || 'No specific diff summary provided.';

    const prompt = `Generate a concise Git commit message using conventional commits format.

Changes:
- Added: ${added.join(', ') || 'none'}
- Modified: ${modified.join(', ') || 'none'}
- Deleted: ${deleted.join(', ') || 'none'}

Diff Summary:
${diffSummary}

Rules:
- Use format: type(scope): short description
- Types: feat, fix, refactor, docs, chore, style, test
- Max 72 characters
- Be specific and descriptive
- No generic messages like 'update files'`;

    let lastError: any = null;

    for (const model of models) {
      try {
        const response = await axios.post(`${ollamaHost}/api/generate`, {
          model,
          prompt,
          stream: false
        }, {
          timeout: 5000
        });

        if (response.data && response.data.response) {
          return res.json({ message: response.data.response.trim() });
        }
      } catch (error) {
        console.warn(`Ollama model ${model} failed:`, error instanceof Error ? error.message : 'timeout');
        lastError = error;
      }
    }

    // Default fallback
    res.json({ message: 'chore: update project files', error: lastError?.message });
  });

  // --- Vite / Static Handling ---

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve production build
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
