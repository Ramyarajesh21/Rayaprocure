from flask import has_request_context, session


def create_notification(cursor, title, message, category="General", link_path=None, user_id=None, tenant_id=None):
    """Create a notification for the current tenant (taken from the session by default)."""
    if tenant_id is None:
        tenant_id = ((session.get("user") if has_request_context() else None) or {}).get("tenant_id")
    cursor.execute(
        """INSERT INTO notifications (tenant_id, user_id, title, message, category, link_path)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (tenant_id, user_id, title, message, category, link_path),
    )
