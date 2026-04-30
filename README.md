# GitStream AI

Manage your GitHub repositories with AI-powered commit messages and a clean web interface.

## Features
- **GitHub OAuth Login**: Securely authenticate with your GitHub account.
- **Repository Management**: Create new repos (public/private) and browse your existing ones.
- **File Editor**: Edit files directly in the browser with a clean code-style editor.
- **AI Commit Messages**: Automatically generate high-quality commit messages using a local Ollama instance (models: `qwen2.5:3b`, `qwen2.5:1.5b`, `tinyllama`).
- **Commit & Push**: Stage changes and push them back to GitHub without touching the terminal.

## Setup Instructions

### 1. GitHub OAuth App
1. Go to [GitHub Developer Settings](https://github.com/settings/developers).
2. Create a "New OAuth App".
3. Set **Homepage URL** to your App URL.
4. Set **Authorization callback URL** to `https://<YOUR_APP_URL>/auth/callback`.
5. Copy the **Client ID** and generate a **Client Secret**.

### 2. Environment Variables
Set the following secrets in your AI Studio project:
- `GITHUB_CLIENT_ID`: Your GitHub Client ID.
- `GITHUB_CLIENT_SECRET`: Your GitHub Client Secret.
- `OLLAMA_HOST`: (Optional) Defaults to `http://localhost:11434`.

### 3. Ollama (Optional for AI features)
Ensure Ollama is running locally on your machine with the following models pulled:
```bash
ollama pull qwen2.5:3b
ollama pull qwen2.5:1.5b
ollama pull tinyllama
```

## Local Development Setup

If you are running this app on your own machine:

### 1. GitHub OAuth App
1. Create a "New OAuth App" in [GitHub Settings](https://github.com/settings/developers).
2. **Homepage URL**: `http://localhost:3000` (or `http://localhost:3001` if that's your port)
3. **Authorization callback URL**: `http://localhost:3000/auth/callback` (or `http://localhost:3001/auth/callback`)

### 2. Local Environment
Create a `.env` file in the root directory:
```env
GITHUB_CLIENT_ID="your_id"
GITHUB_CLIENT_SECRET="your_secret"
APP_URL="http://localhost:3001"
PORT=3001
OLLAMA_HOST="http://localhost:11434"
```

### 3. Run the App
```bash
npm install
npm run dev
```
