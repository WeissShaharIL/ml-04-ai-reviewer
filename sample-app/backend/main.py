from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy import Column, Integer, String, Float, DateTime, select
from datetime import datetime, timezone
import os

# ── DB setup ──────────────────────────────────────────────────────────────────
DB_PATH = os.getenv("DB_PATH", "/app/data/puzzle.db")
engine  = create_async_engine(f"sqlite+aiosqlite:///{DB_PATH}", echo=False)
Base    = declarative_base()
Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# ── Models ────────────────────────────────────────────────────────────────────
class Score(Base):
    __tablename__ = "scores"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    name       = Column(String(64), nullable=False)
    time_secs  = Column(Float, nullable=False)
    difficulty = Column(String(16), nullable=False, default="medium")
    completed_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

# ── Schemas ───────────────────────────────────────────────────────────────────
class ScoreIn(BaseModel):
    name:       str
    time_secs:  float
    difficulty: str = "medium"

class ScoreOut(BaseModel):
    id:          int
    name:        str
    time_secs:   float
    difficulty:  str
    completed_at: datetime

    class Config:
        from_attributes = True

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(title="Puzzle Highscores")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

# ── Routes ────────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/scores", response_model=ScoreOut)
async def submit_score(payload: ScoreIn):
    async with Session() as db:
        score = Score(
            name=payload.name.strip()[:64],
            time_secs=payload.time_secs,
            difficulty=payload.difficulty,
        )
        db.add(score)
        await db.commit()
        await db.refresh(score)
        return score

@app.get("/scores", response_model=list[ScoreOut])
async def get_scores(difficulty: str = None, limit: int = 20):
    async with Session() as db:
        query = select(Score).order_by(Score.time_secs.asc()).limit(limit)
        if difficulty:
            query = query.where(Score.difficulty == difficulty)
        result = await db.execute(query)
        return result.scalars().all()

@app.delete("/scores/{score_id}")
async def delete_score(score_id: int):
    async with Session() as db:
        result = await db.execute(select(Score).where(Score.id == score_id))
        score  = result.scalar_one_or_none()
        if not score:
            raise HTTPException(status_code=404, detail="Score not found")
        await db.delete(score)
        await db.commit()
        return {"deleted": score_id}