"""Small in-memory rate limiter for the public, internet-facing endpoints.

Per-process (each worker keeps its own counters), which is enough to stop
password guessing and bot signups on a single server.  Behind several workers
or servers, put the same limits on your reverse proxy / WAF as well.
Set RATE_LIMIT_DISABLED=1 to turn it off (used by the automated tests).
"""

import os
import threading
import time
from collections import defaultdict, deque
from functools import wraps

from flask import jsonify, request

_lock = threading.Lock()
_hits = defaultdict(deque)


def client_ip():
    # ProxyFix is not configured, so trust the socket address unless told otherwise.
    if os.getenv("TRUST_PROXY_HEADERS") == "1":
        forwarded = request.headers.get("X-Forwarded-For", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.remote_addr or "unknown"


def rate_limit(name, limit, window_seconds, key_func=None):
    """Allow ``limit`` calls per ``window_seconds`` per client (and optional key)."""

    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            if os.getenv("RATE_LIMIT_DISABLED") == "1":
                return view(*args, **kwargs)

            identity = client_ip()
            if key_func:
                identity += "|" + str(key_func() or "")
            bucket_key = (name, identity)
            now = time.monotonic()

            with _lock:
                bucket = _hits[bucket_key]
                while bucket and now - bucket[0] > window_seconds:
                    bucket.popleft()
                if len(bucket) >= limit:
                    retry = int(window_seconds - (now - bucket[0])) + 1
                    response = jsonify({"message": "Too many attempts. Please try again later."})
                    response.status_code = 429
                    response.headers["Retry-After"] = str(retry)
                    return response
                bucket.append(now)

            return view(*args, **kwargs)

        return wrapped

    return decorator
