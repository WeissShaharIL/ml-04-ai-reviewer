from fastapi import FastAPI

app = FastAPI(title="AI Reviewer")

@app.get("/health")
async def health():
    return {"status": "ok"}