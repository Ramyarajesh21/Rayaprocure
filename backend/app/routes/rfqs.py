from flask import Blueprint, request, jsonify
from app.db import get_db_connection


rfqs_bp = Blueprint("rfqs", __name__)


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
        ORDER BY r.id DESC
    """)

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
    purpose = data.get("purpose")
    description = data.get("description")
    status = data.get("status", "New")

    if not customer_id or not request_date:
        return jsonify({
            "message": "Customer and request date are required."
        }), 400

    connection = get_db_connection()
    cursor = connection.cursor()

    cursor.execute("""
        SELECT COUNT(*) + 1
        FROM rfqs
    """)

    next_number = cursor.fetchone()[0]

    rfq_number = f"RFQ-{next_number:03d}"

    cursor.execute("""
        INSERT INTO rfqs (
            customer_id,
            rfq_number,
            request_date,
            required_date,
            purpose,
            description,
            status
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """, (
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
    purpose = data.get("purpose")
    description = data.get("description")
    status = data.get("status", "New")

    if not customer_id or not request_date:
        return jsonify({
            "message": "Customer and request date are required."
        }), 400

    connection = get_db_connection()
    cursor = connection.cursor()

    cursor.execute("""
        UPDATE rfqs
        SET
            customer_id = %s,
            request_date = %s,
            required_date = %s,
            purpose = %s,
            description = %s,
            status = %s
        WHERE id = %s
    """, (
        customer_id,
        request_date,
        required_date,
        purpose,
        description,
        status,
        rfq_id
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
        WHERE id = %s
    """, (rfq_id,))

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