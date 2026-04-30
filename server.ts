import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import axios from 'axios';
import dotenv from 'dotenv';
import qs from 'qs';
import cors from 'cors';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3001;

  app.set('trust proxy', 1);

  // -----------------------------
  // CORS (CRITICAL for cookies)
  // -----------------------------
  app.use(cors({
    origin: 'http://localhost:5173', // Vite dev server
    credentials: true
  }));

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));
  app.use(cookieParser());

  // -----------------------------
  // SESSION CONFIG (FIXED)
  // -----------------------------
  app.use(session({
    secret: process.env.SESSION_SECRET || 'github-repo-manager-dev-secret',
    resave: false,
    saveUninitialized: false,
    name: 'neuro.sid',
    cookie: {
      secure: false,        // MUST be false for localhost HTTP
      sameSite: 'lax',      // required for OAuth redirect flows
      httpOnly: true,
      path: '/',
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  }));

  // -----------------------------
  // DEBUG MIDDLEWARE
  // -----------------------------
  app.use((req, res, next) => {
    // @ts-ignore
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.url} - Session ID: ${req.sessionID} - HasToken: ${!!req.session.accessToken}`
    );
    next();
  });

  // -----------------------------
  // GITHUB OAUTH
  // -----------------------------

  app.get('/api/auth/url', (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const appUrl = process.env.APP_URL || 'http://localhost:3001';
    const redirectUri = `${appUrl}/auth/callback`;
    const scope = 'repo delete_repo read:user';

    if (!clientId) {
      return res.status(500).json({ error: 'Missing GitHub client ID' });
    }

    const url =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${scope}` +
      `&state=random_state`;

    res.json({ url });
  });

  app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
    const { code } = req.query;

    if (!code) return res.status(400).send('Missing OAuth code');

    try {
      const data = qs.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code
      });

      const response = await axios.post(
        'https://github.com/login/oauth/access_token',
        data,
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      if (!response.data.access_token) {
        return res.status(400).send('No access token returned');
      }

      // @ts-ignore
      req.session.accessToken = response.data.access_token;

      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).send('Session save failed');
        }

        // safer redirect-based flow (fixes popup + cookie issues)
        return res.redirect('http://localhost:5173');
      });
    } catch (err) {
      console.error('OAuth error:', err);
      res.status(500).send('OAuth failed');
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    // @ts-ignore
    const token = req.session.accessToken;

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const response = await axios.get('https://api.github.com/user', {
        headers: {
          Authorization: `token ${token}`
        }
      });

      res.json(response.data);
    } catch (err) {
      console.error('GitHub user fetch error:', err);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // -----------------------------
  // GITHUB REPO API
  // -----------------------------

  app.get('/api/repos', async (req, res) => {
    // @ts-ignore
    const token = req.session.accessToken;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const response = await axios.get(
        'https://api.github.com/user/repos?per_page=100&sort=updated',
        {
          headers: { Authorization: `token ${token}` }
        }
      );

      res.json(response.data);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch repos' });
    }
  });

  app.post('/api/repos', async (req, res) => {
    // @ts-ignore
    const token = req.session.accessToken;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const response = await axios.post(
        'https://api.github.com/user/repos',
        req.body,
        {
          headers: { Authorization: `token ${token}` }
        }
      );

      res.json(response.data);
    } catch (err: any) {
      res.status(err.response?.status || 500).json(err.response?.data || {});
    }
  });

  app.delete('/api/repos/:owner/:repo', async (req, res) => {
    // @ts-ignore
    const token = req.session.accessToken;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    const { owner, repo } = req.params;

    try {
      await axios.delete(`https://api.github.com/repos/${owner}/${repo}`, {
        headers: { Authorization: `token ${token}` }
      });

      res.json({ success: true });
    } catch (err: any) {
      res.status(err.response?.status || 500).json(err.response?.data || {});
    }
  });

  // -----------------------------
  // VITE / STATIC
  // -----------------------------

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });

    app.use(vite.middlewares);
  } else {
    const dist = path.join(__dirname, 'dist');
    app.use(express.static(dist));

    app.get('*', (_req, res) => {
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
