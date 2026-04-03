import hashlib
import hmac
import httpx
import os
import json
from datetime import datetime, timezone

from fastapi import FastAPI, Request, HTTPException, Header
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import Column, Integer, String, Text, DateTime, select
from dotenv import load_dotenv

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
DB_PATH            = os.getenv("DB_PATH", "/app/data/reviewer.db")
GITHUB_TOKEN       = os.getenv("GITHUB_TOKEN", "")
WEBHOOK_SECRET     = os.getenv("GITHUB_WEBHOOK_SECRET", "")

# ── DB setup ──────────────────────────────────────────────────────────────────
engine  = create_async_engine(f"sqlite+aiosqlite:///{DB_PATH}", echo=False)
Base    = declarative_base()
Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

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
    status       = Column(String(32), default="pending")   # pending | reviewing | done | failed
    created_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))

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

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/webhook")
async def webhook(
    request: Request,
    x_github_event: str         = Header(None),
    x_hub_signature_256: str    = Header(None),
):
    payload = await request.body()

    # Verify signature
    if x_hub_signature_256 and not verify_signature(payload, x_hub_signature_256):
        raise HTTPException(status_code=401, detail="Invalid signature")

    # Only handle PR events
    if x_github_event != "pull_request":
        return {"ignored": True, "event": x_github_event}

    data   = json.loads(payload)
    action = data.get("action")

    # Only trigger on opened or reopened
    if action not in ("opened", "reopened"):
        return {"ignored": True, "action": action}

    pr     = data["pull_request"]
    repo   = data["repository"]["full_name"]

    # Fetch diff
    try:
        diff = await fetch_diff(repo, pr["number"])
    except Exception as e:
        diff = None

    # Store in DB
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

    return {
        "received": True,
        "review_id": review.id,
        "pr": pr["number"],
        "repo": repo,
    }

@app.get("/reviews")
async def get_reviews():
    async with Session() as db:
        result = await db.execute(
            select(Review).order_by(Review.created_at.desc())
        )
        reviews = result.scalars().all()
        return [
            {
                "id":         r.id,
                "pr_number":  r.pr_number,
                "repo":       r.repo,
                "pr_title":   r.pr_title,
                "pr_url":     r.pr_url,
                "author":     r.author,
                "status":     r.status,
                "created_at": r.created_at,
            }
            for r in reviews
        ]

@app.get("/reviews/{review_id}")
async def get_review(review_id: int):
    async with Session() as db:
        result = await db.execute(select(Review).where(Review.id == review_id))
        r = result.scalar_one_or_none()
        if not r:
            raise HTTPException(status_code=404, detail="Review not found")
        return {
            "id":         r.id,
            "pr_number":  r.pr_number,
            "repo":       r.repo,
            "pr_title":   r.pr_title,
            "pr_url":     r.pr_url,
            "author":     r.author,
            "diff":       r.diff,
            "review":     r.review,
            "status":     r.status,
            "created_at": r.created_at,
        }

@app.get("/config")
async def config():
    return {
        "provider": os.getenv("REVIEWER_PROVIDER", "ollama"),
        "model":    os.getenv("OLLAMA_MODEL") if os.getenv("REVIEWER_PROVIDER") == "ollama" else os.getenv("CLAUDE_MODEL"),
    }