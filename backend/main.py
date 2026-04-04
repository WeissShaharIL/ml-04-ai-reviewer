import hashlib
import hmac
import httpx
import os
import json
import asyncio
from datetime import datetime, timezone
from typing import AsyncGenerator

from fastapi import FastAPI, Request, HTTPException, Header, BackgroundTasks
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import Column, Integer, String, Text, DateTime, select
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
DB_PATH        = os.getenv("DB_PATH", "/app/data/reviewer.db")
GITHUB_TOKEN   = os.getenv("GITHUB_TOKEN", "")
WEBHOOK_SECRET = os.getenv("GITHUB_WEBHOOK_SECRET", "")
PROVIDER       = os.getenv("REVIEWER_PROVIDER", "ollama")
OLLAMA_URL     = os.getenv("OLLAMA_URL", "http://ollama:11434")
OLLAMA_MODEL   = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:7b")
ANTHROPIC_KEY  = os.getenv("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL   = os.getenv("CLAUDE_MODEL", "claude-sonnet-4-20250514")

# ── DB setup ──────────────────────────────────────────────────────────────────
engine  = create_async_engine(f"sqlite+aiosqlite:///{DB_PATH}", echo=False)
Base    = declarative_base()
Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# ── SSE event bus ─────────────────────────────────────────────────────────────
subscribers: list[asyncio.Queue] = []

async def publish(event: dict):
    for q in subscribers:
        await q.put(event)

# ── Models ────────────────────────────────────────────────────────────────────
class Review(Base):
    __tablename__ = "reviews"
    id           = Column(Integer, primary_key=True, autoincrement=True)
    pr_number    = Column(Integer, nullable=False)
    repo         = Column(String(256), nullable=False)
    pr_title     = Column(String(512), nullable=False)
    pr_url       = Column(String(512), nullable=False)
    author       = Column(String(128), nullable=False)
    diff         = Column(Text, nullable=True)
    review       = Column(Text, nullable=True)
    status       = Column(String(32), default="pending")
    provider     = Column(String(32), nullable=True)
    model        = Column(String(128), nullable=True)
    diff_size    = Column(Integer, nullable=True)
    created_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    completed_at = Column(DateTime, nullable=True)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="AI Reviewer")

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# ── Helpers ───────────────────────────────────────────────────────────────────
def verify_signature(payload: bytes, sig_header: str) -> bool:
    if not WEBHOOK_SECRET:
        return True
    expected = "sha256=" + hmac.new(
        WEBHOOK_SECRET.encode(), payload, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, sig_header)

async def fetch_diff(repo: str, pr_number: int) -> str:
    url     = f"https://api.github.com/repos/{repo}/pulls/{pr_number}"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept":        "application/vnd.github.v3.diff",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.get(url, headers=headers, follow_redirects=True)
        resp.raise_for_status()
        return resp.text

def build_prompt(diff: str, pr_title: str) -> str:
    max_diff = 12000
    if len(diff) > max_diff:
        diff = diff[:max_diff] + "\n\n... [diff truncated]"
    return f"""You are an expert code reviewer. Review the following pull request and provide structured feedback.

PR Title: {pr_title}

Git Diff:
```diff
{diff}
```

Respond ONLY with a JSON object in this exact format, no other text:
{{
  "overall": "approved" | "changes_requested" | "comment",
  "summary": "one sentence summary of the changes",
  "bugs": [
    {{"file": "filename.py", "line": 42, "issue": "description of the bug"}}
  ],
  "security": [
    {{"file": "filename.py", "line": 12, "issue": "description of the security issue"}}
  ],
  "performance": [
    {{"file": "filename.py", "line": 8, "issue": "description of the performance issue"}}
  ],
  "improvements": [
    {{"file": "filename.py", "line": 5, "issue": "suggestion for improvement"}}
  ],
  "positives": [
    "what was done well"
  ]
}}

Rules:
- Only include categories that have actual findings
- Be specific, reference file names and line numbers from the diff
- bugs and security are blockers, improvements are optional
- positives should highlight genuinely good patterns
- If the change is trivial (docs, config), set overall to "approved"
"""

def format_review_comment(parsed: dict) -> str:
    overall_map = {
        "approved":          "✅ Approved",
        "changes_requested": "⚠️ Changes requested",
        "comment":           "💬 Comment",
    }
    overall = overall_map.get(parsed.get("overall", "comment"), "💬 Comment")
    lines   = [
        "## 🤖 AI Code Review",
        "",
        f"**Overall:** {overall}",
        f"> {parsed.get('summary', '')}",
        "",
    ]

    def section(emoji, title, items):
        if not items:
            return
        lines.append(f"### {emoji} {title} ({len(items)})")
        for item in items:
            if isinstance(item, dict):
                loc = f"`{item.get('file', '')}:{item.get('line', '')}`" if item.get('file') else ""
                lines.append(f"- {loc} — {item.get('issue', '')}" if loc else f"- {item.get('issue', '')}")
            else:
                lines.append(f"- {item}")
        lines.append("")

    section("🐛", "Bugs",         parsed.get("bugs", []))
    section("🔒", "Security",     parsed.get("security", []))
    section("⚡", "Performance",  parsed.get("performance", []))
    section("💡", "Improvements", parsed.get("improvements", []))

    positives = parsed.get("positives", [])
    if positives:
        lines.append("### ✅ Looks good")
        for p in positives:
            lines.append(f"- {p}")
        lines.append("")

    lines.append("---")
    lines.append("*Review generated by [ml-04-ai-reviewer](https://github.com/WeissShaharIL/ml-04-ai-reviewer)*")
    return "\n".join(lines)

async def call_ollama(prompt: str) -> str:
    payload = {"model": OLLAMA_MODEL, "prompt": prompt, "stream": False}
    async with httpx.AsyncClient(timeout=300) as client:
        resp = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
        resp.raise_for_status()
        return resp.json()["response"].strip()

async def call_claude(prompt: str) -> str:
    headers = {
        "x-api-key":         ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
    }
    payload = {
        "model":      CLAUDE_MODEL,
        "max_tokens": 1024,
        "messages":   [{"role": "user", "content": prompt}],
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post("https://api.anthropic.com/v1/messages", headers=headers, json=payload)
        resp.raise_for_status()
        return resp.json()["content"][0]["text"].strip()

async def post_github_comment(repo: str, pr_number: int, body: str):
    url     = f"https://api.github.com/repos/{repo}/issues/{pr_number}/comments"
    headers = {
        "Authorization": f"Bearer {GITHUB_TOKEN}",
        "Accept":        "application/vnd.github.v3+json",
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json={"body": body})
        resp.raise_for_status()

async def run_review(review_id: int):
    async with Session() as db:
        result = await db.execute(select(Review).where(Review.id == review_id))
        r      = result.scalar_one_or_none()
        if not r or not r.diff:
            await publish({"type": "error", "review_id": review_id, "message": "No diff found"})
            return

        r.status   = "reviewing"
        r.provider = PROVIDER
        r.model    = OLLAMA_MODEL if PROVIDER == "ollama" else CLAUDE_MODEL
        r.diff_size = len(r.diff)
        await db.commit()
        await publish({"type": "status", "review_id": review_id, "status": "reviewing",
                       "message": f"Sending diff to {PROVIDER}..."})

        try:
            prompt = build_prompt(r.diff, r.pr_title)
            await publish({"type": "log", "review_id": review_id,
                           "message": f"Prompt built ({len(prompt)} chars), waiting for AI response..."})

            raw = await call_claude(prompt) if PROVIDER == "claude" else await call_ollama(prompt)
            await publish({"type": "log", "review_id": review_id, "message": "AI response received, parsing..."})

            clean  = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            parsed = json.loads(clean)

            comment = format_review_comment(parsed)
            await publish({"type": "log", "review_id": review_id, "message": "Posting comment to GitHub..."})

            await post_github_comment(r.repo, r.pr_number, comment)

            r.review       = comment
            r.status       = "done"
            r.completed_at = datetime.now(timezone.utc)
            await db.commit()
            await publish({"type": "status", "review_id": review_id, "status": "done",
                           "message": "Review posted to GitHub successfully"})

        except Exception as e:
            r.status = "failed"
            r.review = f"Error: {str(e)}"
            await db.commit()
            await publish({"type": "status", "review_id": review_id, "status": "failed",
                           "message": f"Error: {str(e)}"})
# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "provider": PROVIDER}

@app.get("/stream")
async def stream(request: Request):
    queue: asyncio.Queue = asyncio.Queue()
    subscribers.append(queue)

    async def event_generator() -> AsyncGenerator[str, None]:
        yield f"data: {json.dumps({'type': 'connected', 'message': 'Stream connected'})}\n\n"
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    # Keep-alive ping
                    yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        finally:
            subscribers.remove(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        }
    )

@app.post("/webhook")
async def webhook(
    request:             Request,
    background_tasks:    BackgroundTasks,
    x_github_event:      str = Header(None),
    x_hub_signature_256: str = Header(None),
):
    payload = await request.body()

    if x_hub_signature_256 and not verify_signature(payload, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="Invalid signature")

    if x_github_event != "pull_request":
        return {"ignored": True, "event": x_github_event}

    data   = json.loads(payload)
    action = data.get("action")

    if action not in ("opened", "reopened"):
        return {"ignored": True, "action": action}

    pr   = data["pull_request"]
    repo = data["repository"]["full_name"]

    await publish({"type": "pr_received", "message": f"PR #{pr['number']} received: {pr['title']}"})

    try:
        diff = await fetch_diff(repo, pr["number"])
        await publish({"type": "log", "message": f"Diff fetched ({len(diff)} chars)"})
    except Exception as e:
        diff = None
        await publish({"type": "log", "message": f"Failed to fetch diff: {str(e)}"})

    async with Session() as db:
        review = Review(
            pr_number = pr["number"],
            repo      = repo,
            pr_title  = pr["title"],
            pr_url    = pr["html_url"],
            author    = pr["user"]["login"],
            diff      = diff,
            status    = "pending",
        )
        db.add(review)
        await db.commit()
        await db.refresh(review)
        review_id = review.id

    await publish({"type": "status", "review_id": review_id, "status": "pending",
                   "message": f"Review #{review_id} queued"})

    background_tasks.add_task(run_review, review_id)
    return {"received": True, "review_id": review_id, "pr": pr["number"]}

@app.get("/reviews")
async def get_reviews():
    async with Session() as db:
        result  = await db.execute(select(Review).order_by(Review.created_at.desc()))
        reviews = result.scalars().all()
        return [
            {
                "id":           r.id,
                "pr_number":    r.pr_number,
                "repo":         r.repo,
                "pr_title":     r.pr_title,
                "pr_url":       r.pr_url,
                "author":       r.author,
                "status":       r.status,
                "provider":     r.provider,
                "model":        r.model,
                "diff_size":    r.diff_size,
                "created_at":   r.created_at,
                "completed_at": r.completed_at,
            }
            for r in reviews
        ]

@app.get("/reviews/{review_id}")
async def get_review(review_id: int):
    async with Session() as db:
        result = await db.execute(select(Review).where(Review.id == review_id))
        r      = result.scalar_one_or_none()
        if not r:
            raise HTTPException(status_code=404, detail="Review not found")
        return {
            "id":           r.id,
            "pr_number":    r.pr_number,
            "repo":         r.repo,
            "pr_title":     r.pr_title,
            "pr_url":       r.pr_url,
            "author":       r.author,
            "diff":         r.diff,
            "review":       r.review,
            "status":       r.status,
            "provider":     r.provider,
            "model":        r.model,
            "diff_size":    r.diff_size,
            "created_at":   r.created_at,
            "completed_at": r.completed_at,
        }

@app.post("/reviews/{review_id}/retry")
async def retry_review(review_id: int, background_tasks: BackgroundTasks):
    async with Session() as db:
        result = await db.execute(select(Review).where(Review.id == review_id))
        r      = result.scalar_one_or_none()
        if not r:
            raise HTTPException(status_code=404, detail="Review not found")
        r.status = "pending"
        r.review = None
        await db.commit()
    background_tasks.add_task(run_review, review_id)
    return {"retrying": review_id}

@app.get("/config")
async def config():
    return {
        "provider": PROVIDER,
        "model":    OLLAMA_MODEL if PROVIDER == "ollama" else CLAUDE_MODEL,
    }