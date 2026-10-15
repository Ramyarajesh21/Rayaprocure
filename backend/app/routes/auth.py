import hmac
import re

from flask import Blueprint, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

from app.db import get_db_connection
from app.ratelimit import rate_limit


auth_bp = Blueprint("auth", __name__)


def normalized_role(role):
    """Keep historical Purchase records compatible with the current UI role."""
    return "Operations" if role == "Purchase" else role


def password_matches(stored_password, supplied_password):
    """Accept legacy plaintext passwords once, alongside modern hashed passwords."""
    stored_password = stored_password or ""
    if not stored_password.startswith(("pbkdf2:", "scrypt:")):
        # Legacy plaintext record. (Newer Werkzeug returns False instead of raising
        # for these, so detect them explicitly.) It is re-hashed after login.
        return hmac.compare_digest(stored_password, supplied_password)
    return check_password_hash(stored_password, supplied_password)


@auth_bp.route("/login", methods=["POST"])
@rate_limit("login-ip", 30, 600)
@rate_limit("login-user", 8, 600, key_func=lambda: (request.get_json(silent=True) or {}).get("username", "").strip().lower())
def login():
    data = request.get_json() or {}
    username = (data.get("username") or data.get("email") or "").strip()
    password = data.get("password") or ""

    if not username or not password:
        return jsonify({"message": "Username and password are required."}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Unable to connect to the database."}), 503

    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """
            SELECT users.id, users.name, users.username, users.role, users.password,
                   users.is_active, users.tenant_id, tenants.is_active AS tenant_active,
                   tenants.name AS tenant_name
            FROM users
            JOIN tenants ON tenants.id = users.tenant_id
            WHERE LOWER(TRIM(users.username)) = LOWER(%s)
            LIMIT 1
            """,
            (username,),
        )
        user = cursor.fetchone()

        if not user or not password_matches(user.get("password"), password):
            return jsonify({"message": "Invalid username or password."}), 401

        if not user.get("is_active", True):
            return jsonify({"message": "This account has been deactivated."}), 403

        if not user.get("tenant_active", True):
            return jsonify({"message": "This company workspace is suspended."}), 403

        # Migrate a legacy plaintext password after its first successful login.
        if not str(user["password"]).startswith(("pbkdf2:", "scrypt:")):
            cursor.execute(
                "UPDATE users SET password = %s WHERE id = %s",
                (generate_password_hash(password), user["id"]),
            )
            connection.commit()

        safe_user = {
            "id": user["id"],
            "name": user.get("name"),
            "username": user["username"],
            "role": normalized_role(user.get("role")),
            "tenant_id": user["tenant_id"],
            "tenant_name": user.get("tenant_name"),
        }
        session.clear()
        session["user"] = safe_user

        return jsonify({"message": "Login successful.", "user": safe_user}), 200
    except Exception as error:
        connection.rollback()
        print("Login error:", error)
        return jsonify({"message": "Unable to sign in."}), 500
    finally:
        cursor.close()
        connection.close()


@auth_bp.route("/register", methods=["POST"])
@rate_limit("register", 5, 3600)
def register_company():
    """Self-service signup: create a new tenant, its settings row, and its Owner."""
    data = request.get_json() or {}
    company_name = (data.get("company_name") or "").strip()
    name = (data.get("name") or "").strip()
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""

    if not company_name or not name or not username or not email:
        return jsonify({"message": "Company name, your name, username, and email are required."}), 400
    if "@" not in email:
        return jsonify({"message": "Enter a valid email address."}), 400
    if len(password) < 8:
        return jsonify({"message": "Password must contain at least 8 characters."}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Unable to connect to the database."}), 503

    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM users WHERE username = %s LIMIT 1", (username,))
        if cursor.fetchone():
            return jsonify({"message": "Username is already in use."}), 409

        slug_base = re.sub(r"[^a-z0-9]+", "-", company_name.lower()).strip("-")[:60] or "company"
        slug = slug_base
        suffix = 1
        while True:
            cursor.execute("SELECT id FROM tenants WHERE slug = %s", (slug,))
            if not cursor.fetchone():
                break
            suffix += 1
            slug = f"{slug_base}-{suffix}"

        cursor.execute(
            "INSERT INTO tenants (name, slug, plan) VALUES (%s, %s, 'trial')",
            (company_name, slug),
        )
        new_tenant_id = cursor.lastrowid
        cursor.execute(
            """INSERT INTO company_settings (tenant_id, company_name, email, currency, date_format)
               VALUES (%s, %s, %s, 'INR', 'DD/MM/YYYY')""",
            (new_tenant_id, company_name, email),
        )
        cursor.execute(
            """INSERT INTO users (tenant_id, name, username, email, password, role, is_active)
               VALUES (%s, %s, %s, %s, %s, 'Owner', TRUE)""",
            (new_tenant_id, name, username, email, generate_password_hash(password)),
        )
        user_id = cursor.lastrowid
        connection.commit()

        safe_user = {
            "id": user_id,
            "name": name,
            "username": username,
            "role": "Owner",
            "tenant_id": new_tenant_id,
            "tenant_name": company_name,
        }
        session.clear()
        session["user"] = safe_user
        return jsonify({"message": "Workspace created.", "user": safe_user}), 201
    except Exception as error:
        connection.rollback()
        print("Register error:", error)
        return jsonify({"message": "Unable to create the workspace."}), 500
    finally:
        cursor.close()
        connection.close()


@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out successfully."}), 200


@auth_bp.route("/me", methods=["GET"])
def get_current_user():
    user = session.get("user")
    if not user:
        return jsonify({"message": "Authentication required."}), 401
    return jsonify({"user": user}), 200


@auth_bp.route("/change-password", methods=["POST"])
def change_password():
    user_session = session.get("user")
    if not user_session:
        return jsonify({"message": "Authentication required."}), 401

    data = request.get_json() or {}
    current_password = data.get("currentPassword") or ""
    new_password = data.get("newPassword") or ""

    if not current_password or not new_password:
        return jsonify({"message": "All password fields are required."}), 400
    if len(new_password) < 8:
        return jsonify({"message": "New password must contain at least 8 characters."}), 400
    if hmac.compare_digest(current_password, new_password):
        return jsonify({"message": "New password must differ from the current password."}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Unable to connect to the database."}), 503

    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, password FROM users WHERE id = %s LIMIT 1",
            (user_session["id"],),
        )
        user = cursor.fetchone()
        if not user:
            session.clear()
            return jsonify({"message": "User account not found."}), 404
        if not password_matches(user.get("password"), current_password):
            return jsonify({"message": "Current password is incorrect."}), 401

        cursor.execute(
            "UPDATE users SET password = %s WHERE id = %s",
            (generate_password_hash(new_password), user["id"]),
        )
        connection.commit()
        return jsonify({"message": "Password changed successfully."}), 200
    except Exception as error:
        connection.rollback()
        print("Password change error:", error)
        return jsonify({"message": "Unable to change password."}), 500
    finally:
        cursor.close()
        connection.close()
