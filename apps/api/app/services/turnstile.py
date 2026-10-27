"""Cloudflare Turnstile: proof that a contact message comes from a person.

The widget on the contact page gives the browser a one-time token. We send it
to Cloudflare together with our secret key, and Cloudflare answers whether it
is genuine. Only then is the message saved. (Docs:
https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)

Python's built-in urllib is enough for one small POST, so no extra library.
"""

import json
import logging
import urllib.parse
import urllib.request

from app.config import get_settings

log = logging.getLogger(__name__)


def verify(token: str, remote_ip: str | None) -> bool:
    settings = get_settings()
    if not settings.turnstile_secret_key or not token:
        return False
    data = {"secret": settings.turnstile_secret_key, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip
    request = urllib.request.Request(
        settings.turnstile_verify_url,
        data=urllib.parse.urlencode(data).encode(),
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10) as response:  # noqa: S310 (fixed https URL)
            result = json.load(response)
    except (OSError, ValueError) as error:
        # Cloudflare unreachable: refuse rather than let unchecked messages in.
        log.warning("Turnstile check failed: %s", error)
        return False
    return bool(result.get("success"))
