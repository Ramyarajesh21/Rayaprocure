from flask import Blueprint, request, jsonify
from app.db import get_db_connection
from app.payment_reconciliation import reconcile_invoice_payment_status
from app.notifications import create_notification
from app.security import tenant_id

payments_bp = Blueprint("payments", __name__)

ALLOWED_STATUSES = ["Pending", "Received"]


def validate_payment_payload(data, default_status=None):
    """Return (values, error_response). Values are validated but not yet saved."""
    invoice_id = data.get("invoice_id")
    payment_date = data.get("payment_date")
    amount = data.get("amount")
    status = data.get("status", default_status)

    if not invoice_id:
        return None, (jsonify({"message": "Invoice is required."}), 400)
    if not payment_date:
        return None, (jsonify({"message": "Payment date is required."}), 400)
    if amount is None:
        return None, (jsonify({"message": "Payment amount is required."}), 400)

    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return None, (jsonify({"message": "Payment amount must be a valid number."}), 400)

    if amount <= 0:
        return None, (jsonify({"message": "Payment amount must be greater than 0."}), 400)
    if status not in ALLOWED_STATUSES:
        return None, (jsonify({"message": "Invalid payment status."}), 400)

    return {
        "invoice_id": invoice_id,
        "payment_date": payment_date,
        "amount": amount,
        "status": status,
    }, None


def remaining_check(cursor, invoice_id, amount, exclude_payment_id=None):
    """Return an error response if the payment would exceed the invoice total."""
    cursor.execute(
        "SELECT id, amount FROM invoices WHERE id = %s AND tenant_id = %s",
        (invoice_id, tenant_id()),
    )
    invoice = cursor.fetchone()
    if not invoice:
        return None, (jsonify({"message": "Invoice not found."}), 404)

    if exclude_payment_id is None:
        cursor.execute(
            "SELECT COALESCE(SUM(amount), 0) AS paid_amount FROM payments WHERE invoice_id = %s AND tenant_id = %s",
            (invoice_id, tenant_id()),
        )
    else:
        cursor.execute(
            """SELECT COALESCE(SUM(amount), 0) AS paid_amount
               FROM payments WHERE invoice_id = %s AND tenant_id = %s AND id != %s""",
            (invoice_id, tenant_id(), exclude_payment_id),
        )
    already_paid = float(cursor.fetchone()["paid_amount"] or 0)
    invoice_amount = float(invoice["amount"])

    if already_paid + amount > invoice_amount + 0.005:
        remaining = invoice_amount - already_paid
        return None, (
            jsonify({
                "message": f"Payment amount exceeds the remaining invoice amount of ₹{remaining:,.2f}."
            }),
            400,
        )
    return invoice, None


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
            WHERE payments.tenant_id = %s
            ORDER BY payments.id DESC
        """, (tenant_id(),))

        return jsonify(cursor.fetchall()), 200

    finally:
        cursor.close()
        connection.close()


@payments_bp.route("/payments", methods=["POST"])
def create_payment():
    values, error = validate_payment_payload(request.get_json() or {}, default_status="Pending")
    if error:
        return error

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        _, error = remaining_check(cursor, values["invoice_id"], values["amount"])
        if error:
            return error

        cursor.execute("""
            INSERT INTO payments (tenant_id, invoice_id, payment_date, amount, status)
            VALUES (%s, %s, %s, %s, %s)
        """, (
            tenant_id(),
            values["invoice_id"],
            values["payment_date"],
            values["amount"],
            values["status"],
        ))
        new_id = cursor.lastrowid

        reconcile_invoice_payment_status(cursor, values["invoice_id"])

        if values["status"] == "Received":
            create_notification(
                cursor,
                "Payment received",
                f"A payment of ₹{values['amount']:,.2f} was received.",
                "Payment",
                "/payments",
            )

        connection.commit()
        return jsonify({"message": "Payment created successfully.", "id": new_id}), 201

    except Exception as error:
        connection.rollback()
        print("Error creating payment:", error)
        return jsonify({"message": "Unable to create payment."}), 500

    finally:
        cursor.close()
        connection.close()


@payments_bp.route("/payments/<int:payment_id>", methods=["PUT"])
def update_payment(payment_id):
    values, error = validate_payment_payload(request.get_json() or {})
    if error:
        return error

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT id, invoice_id, amount FROM payments WHERE id = %s AND tenant_id = %s",
            (payment_id, tenant_id()),
        )
        existing_payment = cursor.fetchone()
        if not existing_payment:
            return jsonify({"message": "Payment not found."}), 404

        _, error = remaining_check(
            cursor, values["invoice_id"], values["amount"], exclude_payment_id=payment_id
        )
        if error:
            return error

        cursor.execute("""
            UPDATE payments
            SET invoice_id = %s, payment_date = %s, amount = %s, status = %s
            WHERE id = %s AND tenant_id = %s
        """, (
            values["invoice_id"],
            values["payment_date"],
            values["amount"],
            values["status"],
            payment_id,
            tenant_id(),
        ))

        # A payment can be moved to another invoice, so recalculate both.
        reconcile_invoice_payment_status(cursor, existing_payment["invoice_id"])
        reconcile_invoice_payment_status(cursor, values["invoice_id"])

        connection.commit()
        return jsonify({"message": "Payment updated successfully."}), 200

    except Exception as error:
        connection.rollback()
        print("Error updating payment:", error)
        return jsonify({"message": "Unable to update payment."}), 500

    finally:
        cursor.close()
        connection.close()


@payments_bp.route("/payments/<int:payment_id>", methods=["DELETE"])
def delete_payment(payment_id):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT invoice_id FROM payments WHERE id = %s AND tenant_id = %s",
            (payment_id, tenant_id()),
        )
        payment = cursor.fetchone()
        if not payment:
            return jsonify({"message": "Payment not found."}), 404

        cursor.execute(
            "DELETE FROM payments WHERE id = %s AND tenant_id = %s",
            (payment_id, tenant_id()),
        )
        reconcile_invoice_payment_status(cursor, payment["invoice_id"])

        connection.commit()
        return jsonify({"message": "Payment deleted successfully."}), 200

    except Exception as error:
        connection.rollback()
        print("Error deleting payment:", error)
        return jsonify({"message": "Unable to delete payment."}), 500

    finally:
        cursor.close()
        connection.close()
