# Anonymous community rankings for Voices of the Wild (part of the "votw-listener" Modal app).
# Stores only: a random player id, a generated nickname, XP, voices met and streak. No accounts,
# no free text, no photos, nothing personal. Players can remove themselves (DELETE).
import re
import time

import modal

ORIGINS = ["https://voices-of-the-wild.netlify.app", "http://localhost:5173", "http://localhost:4173"]
ONLINE_S = 15 * 60          # "walking now" = synced in the last 15 minutes
ACTIVE_S = 30 * 24 * 3600   # the board shows players seen in the last 30 days
MIN_GAP_S = 10              # ignore updates closer together than this
ID_RE = re.compile(r"^[a-z0-9-]{8,40}$")
NAME_RE = re.compile(r"^[A-Za-z ]{3,24} #\d{4}$")

image = modal.Image.debian_slim(python_version="3.12").pip_install("fastapi[standard]==0.115.6")
players = modal.Dict.from_name("votw-community", create_if_missing=True)


def build_api():
    from fastapi import FastAPI, Request, Response
    from fastapi.middleware.cors import CORSMiddleware

    api = FastAPI(docs_url=None, redoc_url=None)
    api.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET", "POST", "DELETE"], allow_headers=["Content-Type"], max_age=86400)

    @api.middleware("http")
    async def corp(request: Request, call_next):
        res = await call_next(request)
        res.headers["Cross-Origin-Resource-Policy"] = "cross-origin"  # the app is cross-origin isolated
        res.headers["Cache-Control"] = "no-store"
        return res

    cache = {"at": 0.0, "rows": []}

    def rows():
        now = time.time()
        if now - cache["at"] > 20:
            cache["rows"] = sorted(
                (dict(v, id=k) for k, v in players.items() if now - v.get("seen", 0) < ACTIVE_S),
                key=lambda r: (-r["xp"], -r["voices"], r["seen"]),
            )
            cache["at"] = now
        return cache["rows"]

    def public(r, i):
        return {"rank": i + 1, "name": r["name"], "xp": r["xp"], "voices": r["voices"], "streak": r["streak"], "online": time.time() - r["seen"] < ONLINE_S}

    @api.get("/board")
    def board(id: str = ""):
        rs = rows()
        mine = next((i for i, r in enumerate(rs) if r["id"] == id), None) if id else None
        now = time.time()
        return {
            "top": [public(r, i) for i, r in enumerate(rs[:50])],
            "me": public(rs[mine], mine) if mine is not None else None,
            "players": len(rs),
            "online": sum(1 for r in rs if now - r["seen"] < ONLINE_S),
        }

    @api.post("/score")
    async def score(request: Request):
        b = await request.json()
        pid, name = str(b.get("id", "")), str(b.get("name", ""))
        if not ID_RE.match(pid) or not NAME_RE.match(name):
            return Response(status_code=400)
        clamp = lambda v, hi: max(0, min(int(v or 0), hi))
        prev = players.get(pid) or {}
        now = time.time()
        if now - prev.get("seen", 0) < MIN_GAP_S and prev.get("xp") == clamp(b.get("xp"), 500_000):
            return {"ok": True}
        players[pid] = {"name": name, "xp": clamp(b.get("xp"), 500_000), "voices": clamp(b.get("voices"), 200), "streak": clamp(b.get("streak"), 3650), "seen": now}
        cache["at"] = 0
        return {"ok": True}

    @api.delete("/score")
    def remove(id: str = ""):
        if ID_RE.match(id):
            players.pop(id, None)
            cache["at"] = 0
        return {"ok": True}

    return api
