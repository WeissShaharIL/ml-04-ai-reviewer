# ml-04-ai-reviewer

A self-hosted AI code reviewer that acts as an active contributor to your GitHub repositories.
When a pull request is opened, the reviewer automatically analyzes the diff and posts a detailed review comment — catching bugs, security issues, and code quality problems.

Runs entirely locally via Docker Compose. Supports local models (Ollama) or Claude API, switchable via a single config line.

---

## How it works

```
Developer opens a PR on GitHub
    → GitHub sends webhook POST to your public ngrok URL
    → Reviewer service receives the event
    → Fetches the full PR diff via GitHub API
    → Sends diff to AI model (Ollama or Claude)
    → AI analyzes for: bugs, security issues, code smells, logic errors
    → Posts structured review comment back to the PR
    → Dashboard logs the review with score and findings
```

The model never pushes code or merges PRs — it only reads diffs and posts review comments, just like a human reviewer would.

---

## Architecture

```
GitHub PR event
      │
      │  POST /webhook
      ▼
FastAPI Backend (:8000)
      │
      ├── Ollama (:11434)          ← local model (qwen2.5-coder:7b)
      │   or
      └── Claude API               ← cloud model (claude-sonnet)
      │
      └── GitHub API               ← fetch diff, post review comment
      │
      └── SQLite                   ← store review history

Dashboard UI (React :3001)
      │
      └── view all reviews, findings, scores
```

| Service | Port | Role |
|---|---|---|
| FastAPI Backend | 8000 | Webhook receiver, AI orchestration, GitHub API |
| Ollama | 11434 | Local code model (optional) |
| Dashboard UI | 3001 | Review history, findings, scores |

---

## Model config

Edit `.env` to switch between local and cloud:

```env
# Provider: "ollama" or "claude"
REVIEWER_PROVIDER=ollama

# Ollama (local)
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=qwen2.5-coder:7b

# Claude API (cloud) — only needed if REVIEWER_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
CLAUDE_MODEL=claude-sonnet-4-20250514

# GitHub
GITHUB_TOKEN=ghp_...           ← Personal Access Token (post comments)
GITHUB_WEBHOOK_SECRET=...      ← Webhook secret (verify requests)
```

Switching from local to Claude: change `REVIEWER_PROVIDER=claude`, add your API key, restart.

---

## What the AI reviews

For each PR the reviewer analyzes:

- **Bugs** — null pointer risks, off-by-one errors, unhandled exceptions, incorrect logic
- **Security** — SQL injection, hardcoded secrets, insecure dependencies, XSS vectors
- **Code quality** — dead code, duplicated logic, overly complex functions
- **Best practices** — missing error handling, no input validation, poor naming

The review is posted as a structured GitHub comment:

```
## 🤖 AI Code Review

**Overall:** ⚠️ Changes requested

### 🐛 Bugs (2)
- `auth.py:47` — Token comparison uses `==` instead of `hmac.compare_digest`, vulnerable to timing attacks
- `api.py:123` — `user_id` not validated before DB query, potential injection

### 🔒 Security (1)
- `config.py:12` — Hardcoded secret key detected: `SECRET_KEY = "dev-secret-123"`

### ✅ Looks good
- Error handling in `routes.py` is thorough
- Input validation present on all public endpoints
```

---

## Getting Started

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- [ngrok](https://ngrok.com/download) — creates a public tunnel to your local machine
- A GitHub account with a repository to review
- A GitHub Personal Access Token (PAT)

### 1. Clone and configure

```powershell
git clone https://github.com/WeissShaharIL/ml-04-ai-reviewer
cd ml-04-ai-reviewer
copy .env.example .env
# Edit .env with your GitHub token and webhook secret
```

### 2. Start the reviewer service

```powershell
.\build.ps1
```

On first run, Ollama will pull `qwen2.5-coder:7b` (~4.5GB). Check progress:

```powershell
docker logs reviewer-ollama -f
```

### 3. Expose your local service with ngrok

```powershell
ngrok http 8000
```

Copy the `https://...ngrok-free.app` URL from the output.

### 4. Configure GitHub webhook

1. Go to your GitHub repo → **Settings** → **Webhooks** → **Add webhook**
2. Payload URL: `https://your-ngrok-url.ngrok-free.app/webhook`
3. Content type: `application/json`
4. Secret: same value as `GITHUB_WEBHOOK_SECRET` in your `.env`
5. Events: select **Pull requests** only
6. Click **Add webhook**

### 5. Open a PR and watch the review appear

Create a branch, make some changes, open a PR — the AI reviewer will post a comment within ~30 seconds (local model) or ~5 seconds (Claude API).

---

## Dashboard

Open http://localhost:3001 to see:

- All reviews with PR title, repo, timestamp
- Per-review findings breakdown (bugs / security / quality)
- Score per review
- Full review text expandable per PR
- Model used (ollama/claude) and response time

---

## Project structure

```
ml-04-ai-reviewer/
├── .env.example               ← copy to .env and fill in tokens
├── .gitignore
├── docker-compose.yml
├── build.ps1
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── main.py                ← webhook, GitHub API, AI orchestration
├── frontend-dash/
│   ├── Dockerfile
│   ├── nginx.conf
│   └── src/
│       ├── main.jsx
│       └── App.jsx            ← review history dashboard
└── ollama/
    ├── Dockerfile
    └── start.sh               ← auto-pulls qwen2.5-coder:7b on startup
```

---

## Backend API

| Method | Path | Description |
|---|---|---|
| POST | `/webhook` | Receives GitHub PR events |
| GET | `/health` | Service status + model info |
| GET | `/reviews` | All past reviews |
| GET | `/reviews/{id}` | Full review detail |
| POST | `/reviews/{id}/retry` | Re-run AI review on a PR |
| GET | `/config` | Current provider and model |

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite |
| Backend | FastAPI (Python) |
| Database | SQLite (review history) |
| Local LLM | Ollama + qwen2.5-coder:7b |
| Cloud LLM | Anthropic Claude API |
| Tunnel | ngrok |
| Containerization | Docker Compose |

---

## Roadmap

- [ ] Phase 1 — Skeleton: all services wired, webhook receiver, health check
- [ ] Phase 2 — GitHub integration: receive PR event, fetch diff, post comment
- [ ] Phase 3 — AI review: prompt engineering, structured output, Ollama + Claude support
- [ ] Phase 4 — Dashboard: review history, findings breakdown, scores
- [ ] Phase 5 — Improvements: inline comments on specific lines, re-review on push

---

## Ideas for next steps

- **Inline comments** — instead of one top-level comment, post review comments directly on the specific lines with issues (GitHub supports this via the Pull Request Review API)
- **Re-review on push** — automatically re-run the review when new commits are pushed to an open PR
- **Custom rules** — define project-specific rules in a `.reviewer.yml` file in the repo being reviewed
- **Multi-file context** — currently reviews only the diff; could fetch related files for better context
- **Auto-approve** — if score is above a threshold and no critical issues found, auto-approve the PR
- **Slack/email notifications** — send review summary to a channel when review is posted