from flask import Blueprint, request, jsonify
from app.db import get_db_connection

payments_bp = Blueprint("payments", __name__)

ALLOWED_STATUSES = ["Pending", "Received"]


@payments_bp.route("/payments", methods=["GET"])
def get_payments():

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                payments.id,
                payments.invoice_id,
                invoices.invoice_number,
                invoices.job_id,
                jobs.job_name,
                payments.payment_date,
                payments.amount,
                payments.status
            FROM payments
            JOIN invoices
                ON payments.invoice_id = invoices.id
            JOIN jobs
                ON invoices.job_id = jobs.id
            ORDER BY payments.id DESC
        """)

        payments = cursor.fetchall()

        return jsonify(payments), 200

    finally:
        cursor.close()
        connection.close()


@payments_bp.route("/payments", methods=["POST"])
def create_payment():

    data = request.get_json() or {}

    invoice_id = data.get("invoice_id")
    payment_date = data.get("payment_date")
    amount = data.get("amount")
    status = data.get("status", "Pending")

    if not invoice_id:
        return jsonify({
            "message": "Invoice is required."
        }), 400

    if not payment_date:
        return jsonify({
            "message": "Payment date is required."
        }), 400

    if amount is None:
        return jsonify({
            "message": "Payment amount is required."
        }), 400

    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return jsonify({
            "message": "Payment amount must be a valid number."
        }), 400

    if amount <= 0:
        return jsonify({
            "message": "Payment amount must be greater than 0."
        }), 400

    if status not in ALLOWED_STATUSES:
        return jsonify({
            "message": "Invalid payment status."
        }), 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:

        cursor.execute("""
            SELECT
                id,
                amount
            FROM invoices
            WHERE id = %s
        """, (invoice_id,))

        invoice = cursor.fetchone()

        if not invoice:
            return jsonify({
                "message": "Invoice not found."
            }), 404

        # Calculate already recorded payments for this invoice.
        cursor.execute("""
            SELECT COALESCE(SUM(amount), 0) AS paid_amount
            FROM payments
            WHERE invoice_id = %s
        """, (invoice_id,))

        payment_summary = cursor.fetchone()

        already_paid = float(
            payment_summary["paid_amount"] or 0
        )

        invoice_amount = float(invoice["amount"])

        if already_paid + amount > invoice_amount:
            remaining_amount = invoice_amount - already_paid

            return jsonify({
                "message": (
                    f"Payment amount exceeds the remaining invoice amount "
                    f"of ₹{remaining_amount:,.2f}."
                )
            }), 400

        cursor.execute("""
            INSERT INTO payments (
                invoice_id,
                payment_date,
                amount,
                status
            )
            VALUES (%s, %s, %s, %s)
        """, (
            invoice_id,
            payment_date,
            amount,
            status
        ))

        connection.commit()

        new_id = cursor.lastrowid

        return jsonify({
            "message": "Payment created successfully.",
            "id": new_id
        }), 201

    except Exception as error:

        connection.rollback()

        print("Error creating payment:", error)

        return jsonify({
            "message": "Unable to create payment."
        }), 500

    finally:
        cursor.close()
        connection.close()


@payments_bp.route("/payments/<int:payment_id>", methods=["PUT"])
def update_payment(payment_id):

    data = request.get_json() or {}

    invoice_id = data.get("invoice_id")
    payment_date = data.get("payment_date")
    amount = data.get("amount")
    status = data.get("status")

    if not invoice_id:
        return jsonify({
            "message": "Invoice is required."
        }), 400

    if not payment_date:
        return jsonify({
            "message": "Payment date is required."
        }), 400

    if amount is None:
        return jsonify({
            "message": "Payment amount is required."
        }), 400

    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return jsonify({
            "message": "Payment amount must be a valid number."
        }), 400

    if amount <= 0:
        return jsonify({
            "message": "Payment amount must be greater than 0."
        }), 400

    if status not in ALLOWED_STATUSES:
        return jsonify({
            "message": "Invalid payment status."
        }), 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:

        # Check current payment.
        cursor.execute("""
            SELECT
                id,
                invoice_id,
                amount
            FROM payments
            WHERE id = %s
        """, (payment_id,))

        existing_payment = cursor.fetchone()

        if not existing_payment:
            return jsonify({
                "message": "Payment not found."
            }), 404

        # Check invoice.
        cursor.execute("""
            SELECT
                id,
                amount
            FROM invoices
            WHERE id = %s
        """, (invoice_id,))

        invoice = cursor.fetchone()

        if not invoice:
            return jsonify({
                "message": "Invoice not found."
            }), 404

        # Calculate other payments excluding current payment.
        cursor.execute("""
            SELECT COALESCE(SUM(amount), 0) AS paid_amount
            FROM payments
            WHERE invoice_id = %s
              AND id != %s
        """, (invoice_id, payment_id))

        payment_summary = cursor.fetchone()

        already_paid = float(
            payment_summary["paid_amount"] or 0
        )

        invoice_amount = float(invoice["amount"])

        if already_paid + amount > invoice_amount:
            remaining_amount = invoice_amount - already_paid

            return jsonify({
                "message": (
                    f"Payment amount exceeds the remaining invoice amount "
                    f"of ₹{remaining_amount:,.2f}."
                )
            }), 400

        cursor.execute("""
            UPDATE payments
            SET
                invoice_id = %s,
                payment_date = %s,
                amount = %s,
                status = %s
            WHERE id = %s
        """, (
            invoice_id,
            payment_date,
            amount,
            status,
            payment_id
        ))

        connection.commit()

        return jsonify({
            "message": "Payment updated successfully."
        }), 200

    except Exception as error:

        connection.rollback()

        print("Error updating payment:", error)

        return jsonify({
            "message": "Unable to update payment."
        }), 500

    finally:
        cursor.close()
        connection.close()


@payments_bp.route("/payments/<int:payment_id>", methods=["DELETE"])
def delete_payment(payment_id):

    connection = get_db_connection()
    cursor = connection.cursor()

    try:

        cursor.execute("""
            DELETE FROM payments
            WHERE id = %s
        """, (payment_id,))

        if cursor.rowcount == 0:
            return jsonify({
                "message": "Payment not found."
            }), 404

        connection.commit()

        return jsonify({
            "message": "Payment deleted successfully."
        }), 200

    except Exception as error:

        connection.rollback()

        print("Error deleting payment:", error)

        return jsonify({
            "message": "Unable to delete payment."
        }), 500

    finally:
        cursor.close()
        connection.close()