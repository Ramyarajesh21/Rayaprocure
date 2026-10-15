import os
import uuid
from pathlib import Path

from flask import Blueprint, jsonify, request, send_from_directory, session
from werkzeug.utils import secure_filename

from app.db import get_db_connection
from app.security import tenant_id

attachments_bp = Blueprint("attachments", __name__)
ALLOWED_ENTITIES = {"rfq", "quotation", "job", "invoice", "payment"}
ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "doc", "docx", "xls", "xlsx", "csv", "txt"}


def upload_directory():
    directory = Path(__file__).resolve().parents[2] / "uploads"
    directory.mkdir(exist_ok=True)
    return directory


@attachments_bp.route("/api/attachments/<entity_type>/<int:entity_id>", methods=["GET"])
def list_attachments(entity_type, entity_id):
    if entity_type not in ALLOWED_ENTITIES: return jsonify({"message":"Invalid attachment type."}),400
    connection=get_db_connection(); cursor=connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT id, original_name, mime_type, size_bytes, created_at FROM attachments WHERE tenant_id=%s AND entity_type=%s AND entity_id=%s ORDER BY id DESC",(tenant_id(),entity_type,entity_id))
        return jsonify(cursor.fetchall()),200
    finally: cursor.close(); connection.close()


@attachments_bp.route("/api/attachments/<entity_type>/<int:entity_id>", methods=["POST"])
def upload_attachment(entity_type, entity_id):
    if entity_type not in ALLOWED_ENTITIES: return jsonify({"message":"Invalid attachment type."}),400
    file=request.files.get("file")
    if not file or not file.filename: return jsonify({"message":"Choose a file to upload."}),400
    original=secure_filename(file.filename)
    if not original: return jsonify({"message":"Invalid file name."}),400
    extension = original.rsplit(".", 1)[-1].lower() if "." in original else ""
    if extension not in ALLOWED_EXTENSIONS:
        return jsonify({"message":"Allowed files: PDF, Office documents, images, CSV, and text."}),400
    stored=f"{uuid.uuid4().hex}_{original}"; directory=upload_directory(); file.save(directory/stored)
    connection=get_db_connection(); cursor=connection.cursor()
    try:
        cursor.execute("INSERT INTO attachments (tenant_id,entity_type,entity_id,original_name,stored_name,mime_type,size_bytes,uploaded_by) VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",(tenant_id(),entity_type,entity_id,original,stored,file.mimetype or "application/octet-stream",os.path.getsize(directory/stored),session["user"]["id"]))
        connection.commit(); return jsonify({"message":"Attachment uploaded.","id":cursor.lastrowid}),201
    finally: cursor.close(); connection.close()


@attachments_bp.route("/api/attachments/<int:attachment_id>/download", methods=["GET"])
def download_attachment(attachment_id):
    connection=get_db_connection(); cursor=connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT original_name,stored_name FROM attachments WHERE id=%s AND tenant_id=%s",(attachment_id,tenant_id())); item=cursor.fetchone()
        if not item:return jsonify({"message":"Attachment not found."}),404
        return send_from_directory(upload_directory(),item["stored_name"],as_attachment=True,download_name=item["original_name"])
    finally: cursor.close(); connection.close()
