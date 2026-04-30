import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import axios from "axios";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

/**
 * =========================
 * BASE MIDDLEWARE
 * =========================
 */
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

/**
 * =========================
 * SESSION
 * =========================
 */
const sessions = new Map<string, { token: string }>();

function getSession(req: express.Request) {
  const id = req.cookies?.session;
  return id ? sessions.get(id) : null;
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const session = getSession(req);
  if (!session?.token) return res.status(401).json({ message: "Unauthorized" });

  (req as any).token = session.token;
  next();
}

/**
 * =========================
 * API ROUTES FIRST (IMPORTANT)
 * =========================
 */

app.get("/api/auth/url", (req, res) => {
  res.json({
    url: `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=repo`
  });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const token = (req as any).token;

    const r = await axios.get("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${token}` }
    });

    res.json(r.data);
  } catch {
    res.status(500).json({ message: "auth failed" });
  }
});

app.get("/api/repos", requireAuth, async (req, res) => {
  try {
    const token = (req as any).token;

    const r = await axios.get("https://api.github.com/user/repos", {
      headers: { Authorization: `Bearer ${token}` }
    });

    res.json(r.data);
  } catch {
    res.status(500).json({ message: "repos failed" });
  }
});

app.post("/api/repos", requireAuth, async (req, res) => {
  try {
    const token = (req as any).token;

    const r = await axios.post(
      "https://api.github.com/user/repos",
      req.body,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    res.json(r.data);
  } catch {
    res.status(500).json({ message: "create failed" });
  }
});

app.post("/api/repos/:owner/:repo/push", requireAuth, async (req, res) => {
  try {
    const token = (req as any).token;
    const { owner, repo } = req.params;
    const { files, message, branch = "main" } = req.body;

    let commitSha = "";

    for (const file of files) {
      const content = Buffer.from(file.content).toString("base64");

      const r = await axios.put(
        `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`,
        {
          message: message || "update",
          content,
          branch
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      commitSha = r.data?.commit?.sha || commitSha;
    }

    res.json({ success: true, commitSha });
  } catch (err: any) {
    console.error(err?.response?.data || err.message);
    res.status(500).json({ message: "push failed" });
  }
});

app.get("/auth/callback", async (req, res) => {
  try {
    const code = req.query.code as string;

    const tokenRes = await axios.post(
      "https://github.com/login/oauth/access_token",
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code
      },
      { headers: { Accept: "application/json" } }
    );

    const token = tokenRes.data.access_token;

    const id = Math.random().toString(36).slice(2);
    sessions.set(id, { token });

    res.cookie("session", id, {
      httpOnly: true,
      sameSite: "lax"
    });

    res.redirect("/");
  } catch {
    res.status(500).send("OAuth failed");
  }
});

/**
 * =========================
 * VITE MUST BE LAST (CRITICAL)
 * =========================
 */

async function start() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa"
  });

  // Vite MUST be after API routes
  app.use(vite.middlewares);

  // SPA fallback MUST be LAST
  app.use("*", async (req, res, next) => {
    try {
      const url = req.originalUrl;

      const html = await vite.transformIndexHtml(
        url,
        `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`
      );

      res.status(200).setHeader("Content-Type", "text/html").end(html);
    } catch (e) {
      next(e);
    }
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
