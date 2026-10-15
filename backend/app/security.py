"""Session-based API access control for RayaProcure."""

from functools import wraps

from flask import jsonify, session


ROLE_ACCESS = {
    "customers": {"Owner", "Accounts", "Operations"},
    "rfqs": {"Owner", "Operations"},
    "quotations": {"Owner", "Operations"},
    "jobs": {"Owner"},
    "invoices": {"Owner", "Accounts"},
    "payments": {"Owner", "Accounts"},
    "dashboard": {"Owner", "Accounts", "Operations"},
    "reports": {"Owner", "Accounts"},
    "company": {"Owner"},
    "users": {"Owner"},
    "attachments": {"Owner", "Accounts", "Operations"},
    "notifications": {"Owner", "Accounts", "Operations"},
    "audit_logs": {"Owner"},
    "catalog": {"Owner", "Accounts", "Operations"},
    "email": {"Owner", "Accounts", "Operations"},
    "templates": {"Owner", "Accounts", "Operations"},
    "reminders": {"Owner", "Accounts"},
}


def current_user():
    """Return the authenticated user stored in the signed Flask session."""
    return session.get("user")


def tenant_id():
    """Return the tenant (company) id of the signed-in user.

    Every business query must filter on this value; the API gate in
    ``create_app`` guarantees a session exists before route code runs.
    """
    user = session.get("user") or {}
    return user.get("tenant_id")


def require_roles(*roles):
    """Protect a route with the supplied application roles."""
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user = current_user()

            if not user:
                return jsonify({"message": "Authentication required."}), 401

            if roles and user.get("role") not in roles:
                return jsonify({"message": "You do not have permission for this action."}), 403

            return view(*args, **kwargs)

        return wrapped

    return decorator
