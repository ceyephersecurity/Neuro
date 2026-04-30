import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import axios from 'axios';
import dotenv from 'dotenv';
import qs from 'qs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3001;

  // -----------------------------
  // Core middleware
  // -----------------------------
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // -----------------------------
  // Session (FIXED)
  // -----------------------------
  app.use(
    session({
      name: 'neuro.sid',
      secret: 'github-repo-manager-secret-v6',
      resave: false,
      saveUninitialized: false,

      cookie: {
        secure: false, // localhost only (HTTP)
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },

      store: new session.MemoryStore(),
    })
  );

  // -----------------------------
  // Debug middleware
  // -----------------------------
  app.use((req, res, next) => {
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.url} | ` +
        `session=${req.sessionID} | token=${!!(req.session as any).accessToken}`
    );
    next();
  });

  // -----------------------------
  // OAuth URL
  // -----------------------------
  app.get('/api/auth/url', (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const appUrl = process.env.APP_URL || 'http://localhost:3001';

    if (!clientId) {
      return res.status(500).json({ error: 'Missing GITHUB_CLIENT_ID' });
    }

    const redirectUri = `${appUrl}/auth/callback`;

    const url =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=repo read:user delete_repo` +
      `&state=random_state`;

    res.json({ url });
  });

  // -----------------------------
  // OAuth callback (FIXED SESSION PERSISTENCE)
  // -----------------------------
  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code } = req.query;

    if (!code) {
      return res.status(400).send('Missing OAuth code');
    }

    try {
      const data = qs.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      });

      const response = await axios.post(
        'https://github.com/login/oauth/access_token',
        data,
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      if (!response.data?.access_token) {
        return res
          .status(400)
          .send('OAuth failed: no access token returned');
      }

      // STORE TOKEN IN SESSION (CRITICAL FIX)
      (req.session as any).accessToken = response.data.access_token;

      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).send('Session save failed');
        }

        res.send(`
          <html>
            <body>
              <script>
                window.opener?.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                setTimeout(() => window.close(), 500);
              </script>
              Login successful. You may close this window.
            </body>
          </html>
        `);
      });
    } catch (err: any) {
      console.error('OAuth error:', err?.response?.data || err.message);
      res.status(500).send('OAuth exchange failed');
    }
  });

  // -----------------------------
  // Auth check
  // -----------------------------
  app.get('/api/auth/me', async (req, res) => {
    const token = (req.session as any).accessToken;

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const response = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `token ${token}`,
        },
      });

      res.json(response.data);
    } catch (err: any) {
      console.error('GitHub user fetch error:', err?.response?.data);
      res.status(500).json({ error: 'GitHub API error' });
    }
  });

  // -----------------------------
  // Logout
  // -----------------------------
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // -----------------------------
  // GitHub repos
  // -----------------------------
  app.get('/api/repos', async (req, res) => {
    const token = (req.session as any).accessToken;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const response = await axios.get(
        'https://api.github.com/user/repos?sort=updated&per_page=100',
        {
          headers: { Authorization: `token ${token}` },
        }
      );

      res.json(response.data);
    } catch {
      res.status(500).json({ error: 'Failed to fetch repos' });
    }
  });

  // -----------------------------
  // Create repo
  // -----------------------------
  app.post('/api/repos', async (req, res) => {
    const token = (req.session as any).accessToken;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const response = await axios.post(
        'https://api.github.com/user/repos',
        req.body,
        {
          headers: { Authorization: `token ${token}` },
        }
      );

      res.json(response.data);
    } catch (err: any) {
      res.status(err?.response?.status || 500).json(
        err?.response?.data || { error: 'Create repo failed' }
      );
    }
  });

  // -----------------------------
  // Vite dev server
  // -----------------------------
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));

    app.get('*', (_, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // -----------------------------
  // Safe listen (FIXED CRASH HANDLING)
  // -----------------------------
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} already in use.`);
      process.exit(1);
    }
  });
}

startServer();
