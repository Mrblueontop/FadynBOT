import aiohttp
import random
import string


async def get_user_by_username(username: str) -> dict | None:
    url = "https://users.roblox.com/v1/usernames/users"
    payload = {"usernames": [username.strip()], "excludeBannedUsers": False}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=payload) as res:
                data = await res.json()
                users = data.get("data", [])
                return users[0] if users else None
    except Exception:
        return None


async def is_in_group(roblox_user_id: int, group_id: int) -> bool:
    if not group_id:
        return True
    url = f"https://groups.roblox.com/v2/users/{roblox_user_id}/groups/roles"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as res:
                data = await res.json()
                return any(g["group"]["id"] == group_id for g in data.get("data", []))
    except Exception:
        return False


async def get_user_bio(roblox_user_id: int) -> str:
    url = f"https://users.roblox.com/v1/users/{roblox_user_id}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as res:
                data = await res.json()
                return data.get("description", "")
    except Exception:
        return ""


async def get_user_headshot(roblox_user_id: int, size: str = "420x420") -> str | None:
    url = (
        f"https://thumbnails.roblox.com/v1/users/avatar-headshot"
        f"?userIds={roblox_user_id}&size={size}&format=Png&isCircular=false"
    )
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as res:
                data = await res.json()
                entry = data.get("data", [None])[0]
                if entry and entry.get("imageUrl"):
                    return entry["imageUrl"]
    except Exception:
        pass
    return None


def generate_code() -> str:
    return "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
