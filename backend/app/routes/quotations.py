from flask import Blueprint, request, jsonify
from app.db import get_db_connection


quotations_bp = Blueprint("quotations", __name__)


# =========================================================
# GET ALL QUOTATIONS
# =========================================================
@quotations_bp.route("/quotations", methods=["GET"])
def get_quotations():

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            q.id,
            q.rfq_id,
            r.rfq_number,
            r.customer_id,
            c.company_name,
            r.purpose,
            r.request_date,
            r.required_date,
            q.description,
            q.amount,
            q.status
        FROM quotations q
        JOIN rfqs r
            ON q.rfq_id = r.id
        JOIN customers c
            ON r.customer_id = c.id
        ORDER BY q.id DESC
    """)

    quotations = cursor.fetchall()

    cursor.close()
    connection.close()

    return jsonify(quotations), 200


# =========================================================
# CREATE QUOTATION
# =========================================================
@quotations_bp.route("/quotations", methods=["POST"])
def create_quotation():

    data = request.get_json()

    rfq_id = data.get("rfq_id")
    description = data.get("description")
    amount = data.get("amount")
    status = data.get("status", "Draft")

    # Only allowed quotation statuses
    allowed_statuses = ["Draft", "Sent", "Approved"]

    if status not in allowed_statuses:
        return jsonify({
            "message": "Invalid quotation status."
        }), 400

    if not rfq_id or not description or amount is None:
        return jsonify({
            "message": "RFQ, description and amount are required."
        }), 400

    connection = get_db_connection()
    cursor = connection.cursor()

    try:

        # Check whether RFQ exists
        cursor.execute("""
            SELECT id
            FROM rfqs
            WHERE id = %s
        """, (rfq_id,))

        rfq = cursor.fetchone()

        if not rfq:
            return jsonify({
                "message": "RFQ not found."
            }), 404

        # Insert quotation
        cursor.execute("""
            INSERT INTO quotations (
                rfq_id,
                description,
                amount,
                status
            )
            VALUES (%s, %s, %s, %s)
        """, (
            rfq_id,
            description,
            amount,
            status
        ))

        new_id = cursor.lastrowid

        # Automatically mark RFQ as Quoted
        cursor.execute("""
            UPDATE rfqs
            SET status = 'Quoted'
            WHERE id = %s
        """, (rfq_id,))

        connection.commit()

        return jsonify({
            "message": "Quotation created successfully.",
            "id": new_id
        }), 201

    except Exception as error:

        connection.rollback()

        print("Quotation create error:", error)

        return jsonify({
            "message": "Failed to create quotation."
        }), 500

    finally:

        cursor.close()
        connection.close()


# =========================================================
# UPDATE QUOTATION
# =========================================================
@quotations_bp.route("/quotations/<int:quotation_id>", methods=["PUT"])
def update_quotation(quotation_id):

    data = request.get_json()

    rfq_id = data.get("rfq_id")
    description = data.get("description")
    amount = data.get("amount")
    status = data.get("status", "Draft")

    # Only allowed quotation statuses
    allowed_statuses = ["Draft", "Sent", "Approved"]

    if status not in allowed_statuses:
        return jsonify({
            "message": "Invalid quotation status."
        }), 400

    if not rfq_id or not description or amount is None:
        return jsonify({
            "message": "RFQ, description and amount are required."
        }), 400

    connection = get_db_connection()
    cursor = connection.cursor()

    try:

        # Check whether quotation exists
        cursor.execute("""
            SELECT id
            FROM quotations
            WHERE id = %s
        """, (quotation_id,))

        quotation = cursor.fetchone()

        if not quotation:
            return jsonify({
                "message": "Quotation not found."
            }), 404

        # Check whether RFQ exists
        cursor.execute("""
            SELECT id
            FROM rfqs
            WHERE id = %s
        """, (rfq_id,))

        rfq = cursor.fetchone()

        if not rfq:
            return jsonify({
                "message": "RFQ not found."
            }), 404

        # Update quotation
        cursor.execute("""
            UPDATE quotations
            SET
                rfq_id = %s,
                description = %s,
                amount = %s,
                status = %s
            WHERE id = %s
        """, (
            rfq_id,
            description,
            amount,
            status,
            quotation_id
        ))

        # Keep the linked RFQ status as Quoted
        cursor.execute("""
            UPDATE rfqs
            SET status = 'Quoted'
            WHERE id = %s
        """, (rfq_id,))

        connection.commit()

        return jsonify({
            "message": "Quotation updated successfully."
        }), 200

    except Exception as error:

        connection.rollback()

        print("Quotation update error:", error)

        return jsonify({
            "message": "Failed to update quotation."
        }), 500

    finally:

        cursor.close()
        connection.close()


# =========================================================
# DELETE QUOTATION
# =========================================================
@quotations_bp.route("/quotations/<int:quotation_id>", methods=["DELETE"])
def delete_quotation(quotation_id):

    connection = get_db_connection()
    cursor = connection.cursor()

    try:

        cursor.execute("""
            DELETE FROM quotations
            WHERE id = %s
        """, (quotation_id,))

        if cursor.rowcount == 0:
            return jsonify({
                "message": "Quotation not found."
            }), 404

        connection.commit()

        return jsonify({
            "message": "Quotation deleted successfully."
        }), 200

    except Exception as error:

        connection.rollback()

        print("Quotation delete error:", error)

        return jsonify({
            "message": "Failed to delete quotation."
        }), 500

    finally:

        cursor.close()
        connection.close()