"""Reusable products / services with HSN/SAC, unit, rate and GST rate."""

import re
from decimal import Decimal

from flask import Blueprint, jsonify, request

from app.db import get_db_connection
from app.gst import parse_decimal
from app.security import tenant_id

catalog_bp = Blueprint("catalog", __name__)

COLUMNS = "id, name, description, hsn_sac, unit, rate, gst_rate, is_active"


def parse_item(data):
    name = str(data.get("name") or "").strip()
    if not name:
        raise ValueError("Item name is required.")
    hsn_sac = re.sub(r"\s+", "", str(data.get("hsn_sac") or ""))
    if hsn_sac and not re.fullmatch(r"\d{4,8}", hsn_sac):
        raise ValueError("HSN/SAC must be 4 to 8 digits.")
    return {
        "name": name[:200],
        "description": str(data.get("description") or "").strip()[:500],
        "hsn_sac": hsn_sac,
        "unit": str(data.get("unit") or "Nos").strip()[:50] or "Nos",
        "rate": parse_decimal(data.get("rate"), "Rate", minimum=Decimal("0")),
        "gst_rate": parse_decimal(data.get("gst_rate"), "GST rate", minimum=Decimal("0"), maximum=Decimal("100"), default="18"),
        "is_active": bool(data.get("is_active", True)),
    }


@catalog_bp.route("/api/catalog", methods=["GET"])
def list_items():
    search = (request.args.get("q") or "").strip()
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        query = f"SELECT {COLUMNS} FROM catalog_items WHERE tenant_id = %s"
        params = [tenant_id()]
        if search:
            query += " AND (name LIKE %s OR hsn_sac LIKE %s)"
            params += [f"%{search}%", f"%{search}%"]
        cursor.execute(query + " ORDER BY name ASC LIMIT 500", params)
        return jsonify(cursor.fetchall()), 200
    finally:
        cursor.close()
        connection.close()


@catalog_bp.route("/api/catalog", methods=["POST"])
def create_item():
    try:
        item = parse_item(request.get_json() or {})
    except ValueError as error:
        return jsonify({"message": str(error)}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """INSERT INTO catalog_items
               (tenant_id, name, description, hsn_sac, unit, rate, gst_rate, is_active)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (tenant_id(), *item.values()),
        )
        connection.commit()
        return jsonify({"message": "Item saved.", "id": cursor.lastrowid}), 201
    except Exception as error:
        connection.rollback()
        print("Create catalog item error:", error)
        return jsonify({"message": "Unable to save the item."}), 500
    finally:
        cursor.close()
        connection.close()


@catalog_bp.route("/api/catalog/<int:item_id>", methods=["PUT"])
def update_item(item_id):
    try:
        item = parse_item(request.get_json() or {})
    except ValueError as error:
        return jsonify({"message": str(error)}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """UPDATE catalog_items
               SET name = %s, description = %s, hsn_sac = %s, unit = %s, rate = %s,
                   gst_rate = %s, is_active = %s
               WHERE id = %s AND tenant_id = %s""",
            (*item.values(), item_id, tenant_id()),
        )
        connection.commit()
        cursor.execute("SELECT 1 FROM catalog_items WHERE id = %s AND tenant_id = %s", (item_id, tenant_id()))
        if not cursor.fetchone():
            return jsonify({"message": "Item not found."}), 404
        return jsonify({"message": "Item updated."}), 200
    except Exception as error:
        connection.rollback()
        print("Update catalog item error:", error)
        return jsonify({"message": "Unable to update the item."}), 500
    finally:
        cursor.close()
        connection.close()


@catalog_bp.route("/api/catalog/<int:item_id>", methods=["DELETE"])
def delete_item(item_id):
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute("DELETE FROM catalog_items WHERE id = %s AND tenant_id = %s", (item_id, tenant_id()))
        connection.commit()
        if cursor.rowcount == 0:
            return jsonify({"message": "Item not found."}), 404
        return jsonify({"message": "Item deleted."}), 200
    finally:
        cursor.close()
        connection.close()
