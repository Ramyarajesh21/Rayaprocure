from flask import Blueprint, request
from app.db import get_db_connection

auth_bp = Blueprint("auth", __name__)


# ---------------------------------------------------------
# LOGIN
# ---------------------------------------------------------
@auth_bp.route("/login", methods=["POST"])
def login():

    data = request.get_json() or {}

    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return {
            "message": "Username and password are required."
        }, 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:

        cursor.execute(
            """
            SELECT id, name, username, role
            FROM users
            WHERE username = %s
              AND password = %s
            """,
            (username, password)
        )

        user = cursor.fetchone()

        if user:

            # Keep role names consistent.
            if user.get("role") == "Purchase":
                user["role"] = "Operations"

            return {
                "message": "Login successful",
                "user": user
            }, 200

        return {
            "message": "Invalid username or password"
        }, 401

    finally:

        cursor.close()
        connection.close()


# ---------------------------------------------------------
# CHANGE PASSWORD
# ---------------------------------------------------------
@auth_bp.route("/change-password", methods=["POST"])
def change_password():

    data = request.get_json() or {}

    username = data.get("username")
    role = data.get("role")
    current_password = data.get("currentPassword")
    new_password = data.get("newPassword")

    # -----------------------------------------------------
    # BASIC VALIDATION
    # -----------------------------------------------------
    if (
        not username
        or not role
        or not current_password
        or not new_password
    ):
        return {
            "message": "All password fields are required."
        }, 400

    if len(new_password) < 6:
        return {
            "message": "New password must contain at least 6 characters."
        }, 400

    if current_password == new_password:
        return {
            "message": "New password must be different from the current password."
        }, 400

    # -----------------------------------------------------
    # ROLE VALIDATION
    # -----------------------------------------------------
    allowed_roles = {
        "Owner",
        "Accounts",
        "Operations"
    }

    # Convert old role name if it exists in old data.
    if role == "Purchase":
        role = "Operations"

    if role not in allowed_roles:
        return {
            "message": "Invalid user role."
        }, 403

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:

        # -------------------------------------------------
        # FIND USER
        # -------------------------------------------------
        cursor.execute(
            """
            SELECT id, username, role, password
            FROM users
            WHERE username = %s
            LIMIT 1
            """,
            (username,)
        )

        user = cursor.fetchone()

        if not user:
            return {
                "message": "User account not found."
            }, 404

        database_role = user.get("role")

        # -------------------------------------------------
        # OLD DATABASE ROLE COMPATIBILITY
        # -------------------------------------------------
        if database_role == "Purchase":
            database_role = "Operations"

        # -------------------------------------------------
        # ROLE OWNERSHIP CHECK
        # -------------------------------------------------
        if database_role != role:
            return {
                "message": "You can only change your own account password."
            }, 403

        # -------------------------------------------------
        # CURRENT PASSWORD CHECK
        # -------------------------------------------------
        if user.get("password") != current_password:
            return {
                "message": "Current password is incorrect."
            }, 401

        # -------------------------------------------------
        # UPDATE PASSWORD
        # -------------------------------------------------
        cursor.execute(
            """
            UPDATE users
            SET password = %s
            WHERE id = %s
            """,
            (
                new_password,
                user["id"]
            )
        )

        # Make sure the database actually updated one user.
        if cursor.rowcount != 1:
            connection.rollback()

            return {
                "message": "Password was not updated."
            }, 500

        connection.commit()

        return {
            "message": "Password changed successfully."
        }, 200

    except Exception:

        connection.rollback()

        return {
            "message": "Unable to change password."
        }, 500

    finally:

        cursor.close()
        connection.close()
