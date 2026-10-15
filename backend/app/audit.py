import json

from flask import has_request_context, session


def record_audit(cursor, action, entity_type, entity_id=None, details=None, tenant_id=None, user_id=None):
    """Write a compact, queryable audit record inside the active transaction."""
    user = (session.get("user") if has_request_context() else None) or {}
    cursor.execute(
        """
        INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, details)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        (
            tenant_id if tenant_id is not None else user.get("tenant_id"),
            user_id if user_id is not None else user.get("id"),
            action,
            entity_type,
            entity_id,
            json.dumps(details) if details else None,
        ),
    )
