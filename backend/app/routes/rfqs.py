from flask import Blueprint, request, jsonify
from app.db import get_db_connection
from app.numbering import next_document_number
from app.security import tenant_id


rfqs_bp = Blueprint("rfqs", __name__)


def customer_in_tenant(cursor, customer_id):
    cursor.execute(
        "SELECT 1 FROM customers WHERE id = %s AND tenant_id = %s",
        (customer_id, tenant_id()),
    )
    return cursor.fetchone() is not None


# =========================================================
# GET ALL RFQs
# =========================================================
@rfqs_bp.route("/rfqs", methods=["GET"])
def get_rfqs():

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            r.id,
            r.rfq_number,
            r.customer_id,
            c.company_name,
            r.request_date,
            r.required_date,
            r.purpose,
            r.description,
            r.status
        FROM rfqs r
        JOIN customers c
            ON r.customer_id = c.id
        WHERE r.tenant_id = %s
        ORDER BY r.id DESC
    """, (tenant_id(),))

    rfqs = cursor.fetchall()

    cursor.close()
    connection.close()

    return jsonify(rfqs), 200


# =========================================================
# CREATE RFQ
# =========================================================
@rfqs_bp.route("/rfqs", methods=["POST"])
def create_rfq():

    data = request.get_json()

    customer_id = data.get("customer_id")
    request_date = data.get("request_date")
    required_date = data.get("required_date")
    purpose = data.get("purpose") or ""
    description = data.get("description")
    status = data.get("status", "New")

    if not customer_id or not request_date:
        return jsonify({
            "message": "Customer and request date are required."
        }), 400

    connection = get_db_connection()
    cursor = connection.cursor()

    if not customer_in_tenant(cursor, customer_id):
        cursor.close()
        connection.close()
        return jsonify({"message": "Customer not found."}), 404

    cursor.execute("SELECT rfq_prefix FROM company_settings WHERE tenant_id = %s", (tenant_id(),))
    settings = cursor.fetchone()
    prefix = (settings[0] if settings and settings[0] else "RFQ-")
    rfq_number = next_document_number(cursor, tenant_id(), "rfqs", "rfq_number", prefix, 3)

    cursor.execute("""
        INSERT INTO rfqs (
            tenant_id,
            customer_id,
            rfq_number,
            request_date,
            required_date,
            purpose,
            description,
            status
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        tenant_id(),
        customer_id,
        rfq_number,
        request_date,
        required_date,
        purpose,
        description,
        status
    ))

    connection.commit()

    new_id = cursor.lastrowid

    cursor.close()
    connection.close()

    return jsonify({
        "message": "RFQ created successfully.",
        "id": new_id,
        "rfq_number": rfq_number
    }), 201


# =========================================================
# UPDATE RFQ
# =========================================================
@rfqs_bp.route("/rfqs/<int:rfq_id>", methods=["PUT"])
def update_rfq(rfq_id):

    data = request.get_json()

    customer_id = data.get("customer_id")
    request_date = data.get("request_date")
    required_date = data.get("required_date")
    purpose = data.get("purpose") or ""
    description = data.get("description")
    status = data.get("status", "New")

    if not customer_id or not request_date:
        return jsonify({
            "message": "Customer and request date are required."
        }), 400

    connection = get_db_connection()
    cursor = connection.cursor()

    if not customer_in_tenant(cursor, customer_id):
        cursor.close()
        connection.close()
        return jsonify({"message": "Customer not found."}), 404

    cursor.execute("""
        UPDATE rfqs
        SET
            customer_id = %s,
            request_date = %s,
            required_date = %s,
            purpose = %s,
            description = %s,
            status = %s
        WHERE id = %s AND tenant_id = %s
    """, (
        customer_id,
        request_date,
        required_date,
        purpose,
        description,
        status,
        rfq_id,
        tenant_id()
    ))

    if cursor.rowcount == 0:
        cursor.close()
        connection.close()

        return jsonify({
            "message": "RFQ not found."
        }), 404

    connection.commit()

    cursor.close()
    connection.close()

    return jsonify({
        "message": "RFQ updated successfully."
    }), 200


# =========================================================
# DELETE RFQ
# =========================================================
@rfqs_bp.route("/rfqs/<int:rfq_id>", methods=["DELETE"])
def delete_rfq(rfq_id):

    connection = get_db_connection()
    cursor = connection.cursor()

    cursor.execute("""
        DELETE FROM rfqs
        WHERE id = %s AND tenant_id = %s
    """, (rfq_id, tenant_id()))

    if cursor.rowcount == 0:
        cursor.close()
        connection.close()

        return jsonify({
            "message": "RFQ not found."
        }), 404

    connection.commit()

    cursor.close()
    connection.close()

    return jsonify({
        "message": "RFQ deleted successfully."
    }), 200