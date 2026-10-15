"""Per-company quotation / invoice layouts.

A template is either a *layout* (JSON options: labels, columns, sections,
colours) or *custom HTML* with ``{{placeholders}}`` so a company can reproduce
the exact format they already use.  Rendering happens in the browser, so the
same template drives the preview, the PDF and the customer portal.
"""

import json
import re

from flask import Blueprint, jsonify, request

from app.db import get_db_connection
from app.security import require_roles, tenant_id

templates_bp = Blueprint("templates", __name__)

DOC_TYPES = {"quotation", "invoice"}
MAX_HTML = 120_000
MAX_LAYOUT = 20_000

# Refuse markup that can run code; the browser also sanitises before rendering.
DANGEROUS = re.compile(r"<\s*(script|iframe|object|embed|form|link|meta|base)\b|\son\w+\s*=|javascript:", re.I)


def clean_payload(data):
    """Validate a template payload and return normalised values."""
    name = str(data.get("name") or "").strip()
    doc_type = data.get("doc_type")
    if not name:
        raise ValueError("Give the template a name.")
    if len(name) > 120:
        raise ValueError("Template name is too long.")
    if doc_type not in DOC_TYPES:
        raise ValueError("Template type must be quotation or invoice.")

    layout = data.get("layout")
    if layout is not None:
        if not isinstance(layout, dict):
            raise ValueError("Layout must be an object.")
        if len(json.dumps(layout)) > MAX_LAYOUT:
            raise ValueError("Layout is too large.")

    custom_html = data.get("custom_html") or None
    custom_css = data.get("custom_css") or None
    for label, value in (("HTML", custom_html), ("CSS", custom_css)):
        if value is None:
            continue
        if len(value) > MAX_HTML:
            raise ValueError(f"Custom {label} is too large.")
        if DANGEROUS.search(value):
            raise ValueError(f"Custom {label} cannot contain scripts, forms, frames or event handlers.")

    return {
        "name": name,
        "doc_type": doc_type,
        "layout": json.dumps(layout) if layout is not None else None,
        "custom_html": custom_html,
        "custom_css": custom_css,
        "is_default": bool(data.get("is_default")),
    }


def row_to_json(row):
    layout = row.get("layout")
    if isinstance(layout, str):
        layout = json.loads(layout)
    return {
        "id": row["id"],
        "doc_type": row["doc_type"],
        "name": row["name"],
        "is_default": bool(row["is_default"]),
        "layout": layout,
        "custom_html": row.get("custom_html"),
        "custom_css": row.get("custom_css"),
        "updated_at": row.get("updated_at"),
    }


def clear_other_defaults(cursor, doc_type, keep_id):
    cursor.execute(
        "UPDATE document_templates SET is_default = FALSE WHERE tenant_id = %s AND doc_type = %s AND id != %s",
        (tenant_id(), doc_type, keep_id),
    )


@templates_bp.route("/api/templates", methods=["GET"])
def list_templates():
    doc_type = request.args.get("doc_type")
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        query = "SELECT * FROM document_templates WHERE tenant_id = %s"
        params = [tenant_id()]
        if doc_type in DOC_TYPES:
            query += " AND doc_type = %s"
            params.append(doc_type)
        cursor.execute(query + " ORDER BY is_default DESC, name ASC", params)
        return jsonify([row_to_json(row) for row in cursor.fetchall()]), 200
    finally:
        cursor.close()
        connection.close()


@templates_bp.route("/api/templates/default/<doc_type>", methods=["GET"])
def default_template(doc_type):
    """The template a document should use; ``null`` means use the built-in look."""
    if doc_type not in DOC_TYPES:
        return jsonify({"message": "Unknown document type."}), 404
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT * FROM document_templates
               WHERE tenant_id = %s AND doc_type = %s AND is_default = TRUE LIMIT 1""",
            (tenant_id(), doc_type),
        )
        row = cursor.fetchone()
        return jsonify(row_to_json(row) if row else None), 200
    finally:
        cursor.close()
        connection.close()


@templates_bp.route("/api/templates", methods=["POST"])
@require_roles("Owner")
def create_template():
    try:
        values = clean_payload(request.get_json() or {})
    except ValueError as error:
        return jsonify({"message": str(error)}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """INSERT INTO document_templates
               (tenant_id, doc_type, name, is_default, layout, custom_html, custom_css)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (tenant_id(), values["doc_type"], values["name"], values["is_default"],
             values["layout"], values["custom_html"], values["custom_css"]),
        )
        new_id = cursor.lastrowid
        if values["is_default"]:
            clear_other_defaults(cursor, values["doc_type"], new_id)
        connection.commit()
        return jsonify({"message": "Template saved.", "id": new_id}), 201
    except Exception as error:
        connection.rollback()
        print("Create template error:", error)
        return jsonify({"message": "Unable to save the template."}), 500
    finally:
        cursor.close()
        connection.close()


@templates_bp.route("/api/templates/<int:template_id>", methods=["PUT"])
@require_roles("Owner")
def update_template(template_id):
    try:
        values = clean_payload(request.get_json() or {})
    except ValueError as error:
        return jsonify({"message": str(error)}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """UPDATE document_templates
               SET doc_type = %s, name = %s, is_default = %s, layout = %s,
                   custom_html = %s, custom_css = %s
               WHERE id = %s AND tenant_id = %s""",
            (values["doc_type"], values["name"], values["is_default"], values["layout"],
             values["custom_html"], values["custom_css"], template_id, tenant_id()),
        )
        cursor.execute(
            "SELECT 1 FROM document_templates WHERE id = %s AND tenant_id = %s",
            (template_id, tenant_id()),
        )
        if not cursor.fetchone():
            connection.rollback()
            return jsonify({"message": "Template not found."}), 404
        if values["is_default"]:
            clear_other_defaults(cursor, values["doc_type"], template_id)
        connection.commit()
        return jsonify({"message": "Template updated."}), 200
    except Exception as error:
        connection.rollback()
        print("Update template error:", error)
        return jsonify({"message": "Unable to update the template."}), 500
    finally:
        cursor.close()
        connection.close()


@templates_bp.route("/api/templates/<int:template_id>/default", methods=["POST"])
@require_roles("Owner")
def make_default(template_id):
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            "SELECT doc_type FROM document_templates WHERE id = %s AND tenant_id = %s",
            (template_id, tenant_id()),
        )
        row = cursor.fetchone()
        if not row:
            return jsonify({"message": "Template not found."}), 404
        cursor.execute(
            "UPDATE document_templates SET is_default = (id = %s) WHERE tenant_id = %s AND doc_type = %s",
            (template_id, tenant_id(), row[0]),
        )
        connection.commit()
        return jsonify({"message": "Default template updated."}), 200
    finally:
        cursor.close()
        connection.close()


@templates_bp.route("/api/templates/<int:template_id>", methods=["DELETE"])
@require_roles("Owner")
def delete_template(template_id):
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            "DELETE FROM document_templates WHERE id = %s AND tenant_id = %s",
            (template_id, tenant_id()),
        )
        connection.commit()
        if cursor.rowcount == 0:
            return jsonify({"message": "Template not found."}), 404
        return jsonify({"message": "Template deleted."}), 200
    finally:
        cursor.close()
        connection.close()
