import os
import json
import aiohttp
from pathlib import Path

WORKER_URL    = os.getenv("WORKER_URL", "").rstrip("/")
WORKER_SECRET = os.getenv("WORKER_SECRET", "")
USE_WORKER    = bool(WORKER_URL and WORKER_SECRET)

DATA_DIR  = Path(os.getenv("DATA_PATH", "data"))
DB_FILE   = DATA_DIR / "verified.json"

_verified_cache: dict[str, dict] = {}
_loaded = False


def _auth_headers() -> dict:
    return {"Authorization": f"Bearer {WORKER_SECRET}"}


async def _kv_get(ns: str, key: str) -> str | None:
    url = f"{WORKER_URL}/api/kv?ns={ns}&key={key}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=_auth_headers()) as res:
                if res.status == 404:
                    return None
                if not res.ok:
                    return None
                return await res.text()
    except Exception:
        return None


async def _kv_put(ns: str, key: str, value: str) -> None:
    url = f"{WORKER_URL}/api/kv?ns={ns}&key={key}"
    try:
        async with aiohttp.ClientSession() as session:
            await session.put(
                url,
                headers={**_auth_headers(), "Content-Type": "text/plain"},
                data=value,
            )
    except Exception:
        pass


async def _kv_list(ns: str) -> list[str]:
    url = f"{WORKER_URL}/api/kv?ns={ns}&list=1"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, headers=_auth_headers()) as res:
                if not res.ok:
                    return []
                return await res.json()
    except Exception:
        return []


def _load_file() -> None:
    global _loaded
    if _loaded:
        return
    _loaded = True
    if not DB_FILE.exists():
        return
    try:
        data = json.loads(DB_FILE.read_text())
        for entry in data.values():
            _verified_cache[str(entry["discordId"])] = entry
    except Exception:
        pass


def _save_file() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DB_FILE.write_text(json.dumps(_verified_cache, indent=2))


async def init_storage() -> None:
    global _loaded
    if USE_WORKER:
        print(f"[storage] Using Worker KV at {WORKER_URL}")
        keys = await _kv_list("verified")
        for key in keys:
            raw = await _kv_get("verified", key)
            if raw:
                try:
                    entry = json.loads(raw)
                    _verified_cache[str(entry["discordId"])] = entry
                except Exception:
                    pass
        print(f"[storage] Loaded {len(_verified_cache)} verified users from Worker KV.")
    else:
        print("[storage] No WORKER_URL/WORKER_SECRET — using local file storage.")
        _load_file()
        print(f"[storage] Loaded {len(_verified_cache)} verified users from file.")
    _loaded = True


def get_verified(discord_id: str | int) -> dict | None:
    if not _loaded:
        _load_file()
    return _verified_cache.get(str(discord_id))


async def set_verified(entry: dict) -> None:
    discord_id = str(entry["discordId"])
    _verified_cache[discord_id] = entry
    if USE_WORKER:
        await _kv_put("verified", discord_id, json.dumps(entry))
    else:
        _save_file()
