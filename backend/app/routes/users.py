from flask import Blueprint, jsonify, request
from werkzeug.security import generate_password_hash

from app.audit import record_audit
from app.db import get_db_connection
from app.security import tenant_id


users_bp = Blueprint("users", __name__)
ALLOWED_ROLES = {"Owner", "Accounts", "Operations"}


@users_bp.route("/api/users", methods=["GET"])
def list_users():
    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Database connection failed."}), 503
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("""
            SELECT id, name, username, email, role, is_active, created_at, updated_at
            FROM users WHERE tenant_id = %s ORDER BY name ASC, id ASC
        """, (tenant_id(),))
        return jsonify(cursor.fetchall()), 200
    finally:
        cursor.close()
        connection.close()


@users_bp.route("/api/users", methods=["POST"])
def create_user():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip()
    password = data.get("password") or ""
    role = data.get("role")
    if not name or not username or not password:
        return jsonify({"message": "Name, username, and password are required."}), 400
    if len(password) < 8:
        return jsonify({"message": "Password must contain at least 8 characters."}), 400
    if role not in ALLOWED_ROLES:
        return jsonify({"message": "Choose a valid role."}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Database connection failed."}), 503
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM users WHERE username = %s", (username,))
        if cursor.fetchone():
            return jsonify({"message": "Username is already in use."}), 409
        cursor.execute("""
            INSERT INTO users (tenant_id, name, username, email, password, role, is_active)
            VALUES (%s, %s, %s, %s, %s, %s, TRUE)
        """, (tenant_id(), name, username, email or None, generate_password_hash(password), role))
        user_id = cursor.lastrowid
        record_audit(cursor, "Created", "User", user_id, {"username": username, "role": role})
        connection.commit()
        return jsonify({"message": "User created successfully.", "id": user_id}), 201
    except Exception as error:
        connection.rollback()
        print("Create user error:", error)
        return jsonify({"message": "Unable to create user."}), 500
    finally:
        cursor.close()
        connection.close()


@users_bp.route("/api/users/<int:user_id>", methods=["PUT"])
def update_user(user_id):
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip()
    role = data.get("role")
    is_active = bool(data.get("is_active", True))
    if not name or role not in ALLOWED_ROLES:
        return jsonify({"message": "Name and a valid role are required."}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Database connection failed."}), 503
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM users WHERE id = %s AND tenant_id = %s", (user_id, tenant_id()))
        if not cursor.fetchone():
            return jsonify({"message": "User not found."}), 404
        cursor.execute("""
            UPDATE users SET name = %s, email = %s, role = %s, is_active = %s
            WHERE id = %s AND tenant_id = %s
        """, (name, email or None, role, is_active, user_id, tenant_id()))
        record_audit(cursor, "Updated", "User", user_id, {"role": role, "is_active": is_active})
        connection.commit()
        return jsonify({"message": "User updated successfully."}), 200
    except Exception as error:
        connection.rollback()
        print("Update user error:", error)
        return jsonify({"message": "Unable to update user."}), 500
    finally:
        cursor.close()
        connection.close()


@users_bp.route("/api/users/<int:user_id>/reset-password", methods=["POST"])
def reset_user_password(user_id):
    data = request.get_json() or {}
    password = data.get("password") or ""
    if len(password) < 8:
        return jsonify({"message": "Password must contain at least 8 characters."}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Database connection failed."}), 503
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id FROM users WHERE id = %s AND tenant_id = %s", (user_id, tenant_id()))
        if not cursor.fetchone():
            return jsonify({"message": "User not found."}), 404
        cursor.execute(
            "UPDATE users SET password = %s WHERE id = %s AND tenant_id = %s",
            (generate_password_hash(password), user_id, tenant_id()),
        )
        record_audit(cursor, "Reset password", "User", user_id)
        connection.commit()
        return jsonify({"message": "Password reset successfully."}), 200
    except Exception as error:
        connection.rollback()
        print("Reset password error:", error)
        return jsonify({"message": "Unable to reset password."}), 500
    finally:
        cursor.close()
        connection.close()
