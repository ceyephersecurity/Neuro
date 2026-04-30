import express from "express";
import cors from "cors";
import axios from "axios";
import cookieSession from "cookie-session";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

const app = express();

/**
 * =========================
 * CONFIG
 * =========================
 */

const PORT = process.env.PORT || 3001;

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID!;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET!;
const GITHUB_CALLBACK_URL =
  process.env.GITHUB_CALLBACK_URL || "http://localhost:3001/auth/callback";

/**
 * =========================
 * MIDDLEWARE
 * =========================
 */

app.use(express.json({ limit: "10mb" }));

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.use(
  cookieSession({
    name: "session",
    keys: [process.env.SESSION_SECRET || "dev_secret"],
    httpOnly: true,
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
);

/**
 * =========================
 * HELPERS
 * =========================
 */

function getToken(req: any): string | null {
  return req.session?.githubToken || null;
}

function requireAuth(req: any, res: any, next: any) {
  const token = getToken(req);
  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

/**
 * =========================
 * AUTH ROUTES
 * =========================
 */

app.get("/api/auth/url", (req, res) => {
  const state = "random_state";
  const url =
    `https://github.com/login/oauth/authorize` +
    `?client_id=${GITHUB_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(GITHUB_CALLBACK_URL)}` +
    `&scope=repo,user` +
    `&state=${state}`;

  res.json({ url });
});

app.get("/auth/callback", async (req, res) => {
  try {
    const code = req.query.code as string;

    const tokenRes = await axios.post(
      `https://github.com/login/oauth/access_token`,
      {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
      },
      {
        headers: { Accept: "application/json" },
      }
    );

    const token = tokenRes.data.access_token;

    req.session!.githubToken = token;

    return res.redirect("/");
  } catch (err) {
    console.error("OAuth error:", err);
    return res.redirect("/");
  }
});

app.get("/api/auth/me", requireAuth, async (req: any, res) => {
  try {
    const token = getToken(req);

    const userRes = await axios.get("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    res.json(userRes.data);
  } catch (err) {
    res.status(401).json({ message: "Invalid session" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.session = null;
  res.json({ success: true });
});

/**
 * =========================
 * REPOS
 * =========================
 */

app.get("/api/repos", requireAuth, async (req: any, res) => {
  try {
    const token = getToken(req);

    const repos = await axios.get("https://api.github.com/user/repos", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    res.json(repos.data);
  } catch (err) {
    res.status(500).json({ message: "Failed to fetch repos" });
  }
});

app.post("/api/repos", requireAuth, async (req: any, res) => {
  try {
    const token = getToken(req);

    const { name, description, private: isPrivate, auto_init } = req.body;

    const repo = await axios.post(
      "https://api.github.com/user/repos",
      {
        name,
        description,
        private: isPrivate,
        auto_init,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    res.json(repo.data);
  } catch (err: any) {
    res.status(500).json({
      message: err?.response?.data?.message || "Repo creation failed",
    });
  }
});

/**
 * PUSH FILES (FIXED)
 */

app.post(
  "/api/repos/:owner/:repo/push",
  requireAuth,
  async (req: any, res) => {
    try {
      const token = getToken(req);
      const { owner, repo } = req.params;
      const { files, message } = req.body;

      const results = [];

      for (const file of files) {
        const contentBase64 = Buffer.from(file.content).toString("base64");

        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`;

        let sha: string | undefined;

        try {
          const existing = await axios.get(url, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          sha = existing.data.sha;
        } catch {}

        const result = await axios.put(
          url,
          {
            message,
            content: contentBase64,
            sha,
          },
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: "application/vnd.github+json",
            },
          }
        );

        results.push(result.data);
      }

      res.json({ success: true, results });
    } catch (err: any) {
      console.error(err?.response?.data || err);
      res.status(500).json({ message: "Push failed" });
    }
  }
);

/**
 * DELETE REPO (FIXED)
 */

app.delete("/api/repos/:owner/:repo", requireAuth, async (req: any, res) => {
  try {
    const token = getToken(req);
    const { owner, repo } = req.params;

    await axios.delete(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({
      message: err?.response?.data?.message || "Delete failed",
    });
  }
});

/**
 * =========================
 * STATIC (VITE)
 * =========================
 */

const clientDist = path.join(__dirname, "dist");

app.use(express.static(clientDist));

app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

/**
 * =========================
 * START
 * =========================
 */

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
