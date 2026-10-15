from flask import Blueprint, jsonify, request, session
from app.db import get_db_connection
from app.security import tenant_id

notifications_bp = Blueprint("notifications", __name__)

@notifications_bp.route("/api/notifications", methods=["GET"])
def list_notifications():
    connection=get_db_connection(); cursor=connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id,title,message,category,link_path,is_read,created_at FROM notifications WHERE tenant_id=%s AND (user_id IS NULL OR user_id=%s) ORDER BY is_read ASC, created_at DESC LIMIT 50",(tenant_id(),session["user"]["id"]))
        return jsonify(cursor.fetchall()),200
    finally: cursor.close(); connection.close()

@notifications_bp.route("/api/notifications/<int:notification_id>/read", methods=["PUT"])
def mark_read(notification_id):
    connection=get_db_connection(); cursor=connection.cursor()
    try:
        cursor.execute("UPDATE notifications SET is_read=TRUE WHERE id=%s AND tenant_id=%s AND (user_id IS NULL OR user_id=%s)",(notification_id,tenant_id(),session["user"]["id"]))
        connection.commit(); return jsonify({"message":"Notification updated."}),200
    finally: cursor.close(); connection.close()
