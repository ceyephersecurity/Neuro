import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import axios from "axios";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * =========================
 * MIDDLEWARE
 * =========================
 */
app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

/**
 * =========================
 * SESSION STORAGE (TEMP)
 * =========================
 */
const sessions = new Map<string, { token: string }>();

function getSession(req: express.Request) {
  const sessionId = req.cookies?.session;
  if (!sessionId) return null;
  return sessions.get(sessionId) || null;
}

function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const session = getSession(req);

  if (!session?.token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  (req as any).token = session.token;
  next();
}

/**
 * =========================
 * AUTH
 * =========================
 */

app.get("/api/auth/url", (req, res) => {
  const url =
    `https://github.com/login/oauth/authorize?client_id=${process.env.GITHUB_CLIENT_ID}&scope=repo`;

  res.json({ url });
});

app.get("/api/auth/me", requireAuth, async (req, res) => {
  try {
    const token = (req as any).token;

    const githubRes = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json"
      }
    });

    res.json(githubRes.data);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to fetch user" });
  }
});

/**
 * =========================
 * REPOS
 * =========================
 */

app.get("/api/repos", requireAuth, async (req, res) => {
  try {
    const token = (req as any).token;

    const result = await axios.get("https://api.github.com/user/repos", {
      headers: { Authorization: `Bearer ${token}` }
    });

    res.json(result.data);
  } catch {
    res.status(500).json({ message: "Failed to fetch repos" });
  }
});

app.post("/api/repos", requireAuth, async (req, res) => {
  try {
    const token = (req as any).token;
    const { name, description, private: isPrivate, auto_init } = req.body;

    const result = await axios.post(
      "https://api.github.com/user/repos",
      { name, description, private: isPrivate, auto_init },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    res.json(result.data);
  } catch (err: any) {
    res.status(500).json({ message: "Repo creation failed" });
  }
});

/**
 * =========================
 * 🔥 FIXED PUSH ROUTE
 * =========================
 */

app.post("/api/repos/:owner/:repo/push", requireAuth, async (req, res) => {
  try {
    const token = (req as any).token;
    const { owner, repo } = req.params;
    const { files, message, branch = "main" } = req.body;

    if (!Array.isArray(files)) {
      return res.status(400).json({ message: "Files array required" });
    }

    let commitSha = "";

    for (const file of files) {
      const content = Buffer.from(file.content).toString("base64");

      const result = await axios.put(
        `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`,
        {
          message: message || "update files",
          content,
          branch
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json"
          }
        }
      );

      commitSha = result.data?.commit?.sha || commitSha;
    }

    res.json({ success: true, commitSha });

  } catch (err: any) {
    console.error("PUSH ERROR:", err?.response?.data || err.message);

    res.status(500).json({
      message: "Push failed",
      error: err?.response?.data || err.message
    });
  }
});

/**
 * =========================
 * AUTH CALLBACK
 * =========================
 */

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
      {
        headers: { Accept: "application/json" }
      }
    );

    const token = tokenRes.data.access_token;

    const sessionId = Math.random().toString(36).substring(2);

    sessions.set(sessionId, { token });

    res.cookie("session", sessionId, {
      httpOnly: true,
      sameSite: "lax"
    });

    res.redirect("/");
  } catch (err) {
    res.status(500).send("OAuth failed");
  }
});

/**
 * =========================
 * 🔥 PROPER VITE INTEGRATION (FIX)
 * =========================
 */

async function startServer() {
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa"
  });

  app.use(vite.ssrFixStacktrace);
  app.use(vite.middlewares);

  app.use("*", async (req, res, next) => {
    try {
      const url = req.originalUrl;

      const template = await vite.transformIndexHtml(
        url,
        await vite.fs.readFile(path.resolve(__dirname, "index.html"), "utf-8")
      );

      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
