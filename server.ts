import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

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
 * SIMPLE SESSION STORE
 * (replace with DB in prod)
 * =========================
 */
const sessions = new Map<string, { token: string }>();

function getSession(req: express.Request) {
  const sessionId = req.headers["x-session-id"] as string || req.cookies?.session;
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
 * AUTH ROUTES
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
    res.status(500).json({
      message: "Failed to fetch user",
      error: err?.message
    });
  }
});

/**
 * =========================
 * REPO ROUTES
 * =========================
 */

// LIST REPOS
app.get("/api/repos", requireAuth, async (req, res) => {
  try {
    const token = (req as any).token;

    const result = await axios.get("https://api.github.com/user/repos", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    res.json(result.data);
  } catch (err: any) {
    res.status(500).json({ message: "Failed to fetch repos" });
  }
});

// CREATE REPO
app.post("/api/repos", requireAuth, async (req, res) => {
  try {
    const token = (req as any).token;

    const { name, description, private: isPrivate, auto_init } = req.body;

    const result = await axios.post(
      "https://api.github.com/user/repos",
      {
        name,
        description,
        private: isPrivate,
        auto_init
      },
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    res.json(result.data);
  } catch (err: any) {
    res.status(500).json({ message: "Repo creation failed" });
  }
});

/**
 * =========================
 * 🔥 FIXED PUSH ROUTE (YOUR 404)
 * =========================
 */
app.post("/api/repos/:owner/:repo/push", requireAuth, async (req, res) => {
  try {
    const token = (req as any).token;
    const { owner, repo } = req.params;
    const { files, message, branch = "main" } = req.body;

    if (!files || !Array.isArray(files)) {
      return res.status(400).json({ message: "Files required" });
    }

    // push files sequentially
    let commitSha = "";

    for (const file of files) {
      const path = file.path;
      const content = Buffer.from(file.content).toString("base64");

      const putRes = await axios.put(
        `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
        {
          message: message || "update",
          content,
          branch
        },
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      commitSha = putRes.data?.commit?.sha || commitSha;
    }

    res.json({
      success: true,
      commitSha
    });

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
 * AUTH CALLBACK (IMPORTANT FIX)
 * =========================
 */
app.get("/auth/callback", async (req, res) => {
  try {
    const code = req.query.code as string;

    const tokenRes = await axios.post(
      `https://github.com/login/oauth/access_token`,
      {
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code
      },
      {
        headers: {
          Accept: "application/json"
        }
      }
    );

    const token = tokenRes.data.access_token;

    const sessionId = Math.random().toString(36).substring(2);

    sessions.set(sessionId, { token });

    res.cookie("session", sessionId, {
      httpOnly: true
    });

    res.redirect("/");
  } catch (err) {
    res.status(500).send("OAuth failed");
  }
});

/**
 * =========================
 * VITE DEV FALLBACK
 * =========================
 */
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.send("Frontend handled by Vite");
});

/**
 * =========================
 * START SERVER
 * =========================
 */
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
