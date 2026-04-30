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

const isProd = process.env.NODE_ENV === 'production';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3001;

  // IMPORTANT: required behind proxies (fixes cookie issues in dev/prod parity)
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // =========================
  // SESSION CONFIG (FIXED)
  // =========================
  app.use(
    session({
      name: 'neuro.sid',
      secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: false, // localhost MUST be false
        sameSite: 'lax', // OAuth-safe for GitHub redirect
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    })
  );

  // =========================
  // DEBUG MIDDLEWARE
  // =========================
  app.use((req, res, next) => {
    const token = (req.session as any)?.accessToken;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.url} | session=${
        req.sessionID
      } | token=${!!token}`
    );
    next();
  });

  // =========================
  // AUTH URL
  // =========================
  app.get('/api/auth/url', (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const appUrl = process.env.APP_URL || 'http://localhost:3001';

    const redirectUri = `${appUrl}/auth/callback`;

    if (!clientId) {
      return res.status(500).json({ error: 'Missing GITHUB_CLIENT_ID' });
    }

    const url =
      `https://github.com/login/oauth/authorize` +
      `?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=repo read:user delete_repo` +
      `&state=random_state`;

    res.json({ url });
  });

  // =========================
  // OAUTH CALLBACK (FIXED)
  // =========================
  app.get('/auth/callback', async (req, res) => {
    const code = req.query.code as string;

    if (!code) return res.status(400).send('Missing OAuth code');

    try {
      const tokenResponse = await axios.post(
        'https://github.com/login/oauth/access_token',
        {
          client_id: process.env.GITHUB_CLIENT_ID,
          client_secret: process.env.GITHUB_CLIENT_SECRET,
          code,
        },
        {
          headers: {
            Accept: 'application/json',
          },
        }
      );

      const accessToken = tokenResponse.data.access_token;

      if (!accessToken) {
        return res.status(400).send('No access token returned');
      }

      // CRITICAL FIX: ensure session persists BEFORE redirect
      req.session.regenerate((err) => {
        if (err) return res.status(500).send('Session regen failed');

        (req.session as any).accessToken = accessToken;

        req.session.save((err2) => {
          if (err2) return res.status(500).send('Session save failed');

          res.redirect('/');
        });
      });
    } catch (err: any) {
      console.error('OAuth error:', err?.response?.data || err.message);
      res.status(500).send('OAuth failed');
    }
  });

  // =========================
  // AUTH ME (FIXED SAFETY)
  // =========================
  app.get('/api/auth/me', async (req, res) => {
    const token = (req.session as any)?.accessToken;

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const user = await axios.get('https://api.github.com/user', {
        headers: { Authorization: `token ${token}` },
      });

      res.json(user.data);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
  });

  // =========================
  // LOGOUT
  // =========================
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // =========================
  // REPOS (FIXED ROUTE EXISTS ALWAYS)
  // =========================
  app.get('/api/repos', async (req, res) => {
    const token = (req.session as any)?.accessToken;

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    try {
      const repos = await axios.get(
        'https://api.github.com/user/repos?sort=updated&per_page=100',
        {
          headers: { Authorization: `token ${token}` },
        }
      );

      res.json(repos.data);
    } catch (err: any) {
      res.status(500).json(err?.response?.data || { error: 'Repo fetch failed' });
    }
  });

  // =========================
  // CREATE REPO (FIXED PARAMS)
  // =========================
  app.post('/api/repos', async (req, res) => {
    const token = (req.session as any)?.accessToken;
    if (!token) return res.status(401).json({ error: 'Not authenticated' });

    try {
      const result = await axios.post(
        'https://api.github.com/user/repos',
        req.body,
        {
          headers: { Authorization: `token ${token}` },
        }
      );

      res.json(result.data);
    } catch (err: any) {
      console.error(err?.response?.data || err.message);
      res.status(err?.response?.status || 500).json(err?.response?.data);
    }
  });

  // =========================
  // VITE / STATIC
  // =========================
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });

    app.use(vite.middlewares);
  } else {
    const dist = path.join(__dirname, 'dist');
    app.use(express.static(dist));
    app.get('*', (_, res) => {
      res.sendFile(path.join(dist, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
