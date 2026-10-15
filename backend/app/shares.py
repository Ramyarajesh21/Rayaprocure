"""Customer-facing share links (the portal)."""

import os
import secrets
from datetime import datetime, timedelta

SHARE_DAYS = int(os.getenv("SHARE_LINK_DAYS", "90"))


def public_base_url():
    configured = os.getenv("PUBLIC_APP_URL", "").strip().rstrip("/")
    if configured:
        return configured
    return os.getenv("FRONTEND_ORIGINS", "http://localhost:5173").split(",")[0].strip().rstrip("/")


def portal_url(token):
    return f"{public_base_url()}/p/{token}"


def get_or_create_share(cursor, tenant_id, entity_type, entity_id):
    """Return a live share token for a document, creating one if needed."""
    cursor.execute(
        """SELECT token FROM document_shares
           WHERE tenant_id = %s AND entity_type = %s AND entity_id = %s
             AND revoked = FALSE AND (expires_at IS NULL OR expires_at > NOW())
           ORDER BY id DESC LIMIT 1""",
        (tenant_id, entity_type, entity_id),
    )
    row = cursor.fetchone()
    if row:
        return row["token"] if isinstance(row, dict) else row[0]

    token = secrets.token_urlsafe(32)
    cursor.execute(
        """INSERT INTO document_shares (tenant_id, entity_type, entity_id, token, expires_at)
           VALUES (%s, %s, %s, %s, %s)""",
        (tenant_id, entity_type, entity_id, token, datetime.now() + timedelta(days=SHARE_DAYS)),
    )
    return token
