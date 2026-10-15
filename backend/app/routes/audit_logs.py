from flask import Blueprint, jsonify
from app.db import get_db_connection
from app.security import tenant_id

audit_logs_bp = Blueprint("audit_logs", __name__)

@audit_logs_bp.route("/api/audit-logs", methods=["GET"])
def list_audit_logs():
    connection=get_db_connection(); cursor=connection.cursor(dictionary=True)
    try:
        cursor.execute("""SELECT audit_logs.id,audit_logs.action,audit_logs.entity_type,audit_logs.entity_id,audit_logs.details,audit_logs.created_at,users.name AS user_name
        FROM audit_logs LEFT JOIN users ON users.id=audit_logs.user_id WHERE audit_logs.tenant_id=%s ORDER BY audit_logs.id DESC LIMIT 200""",(tenant_id(),))
        return jsonify(cursor.fetchall()),200
    finally: cursor.close(); connection.close()
