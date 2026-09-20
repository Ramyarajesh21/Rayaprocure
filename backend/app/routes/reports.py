from flask import Blueprint, jsonify
from app.db import get_db_connection

reports_bp = Blueprint("reports", __name__)


@reports_bp.route("/reports/summary", methods=["GET"])
def get_reports_summary():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    # Customers
    cursor.execute("SELECT COUNT(*) AS total_customers FROM customers")
    customers = cursor.fetchone()

    # RFQs
    cursor.execute("SELECT COUNT(*) AS total_rfqs FROM rfqs")
    rfqs = cursor.fetchone()

    # Quotations
    cursor.execute("SELECT COUNT(*) AS total_quotations FROM quotations")
    quotations = cursor.fetchone()

    # Jobs
    cursor.execute("""
        SELECT
            COUNT(*) AS total_jobs,
            SUM(CASE WHEN status = 'Ongoing' THEN 1 ELSE 0 END) AS ongoing_jobs,
            SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed_jobs
        FROM jobs
    """)
    jobs = cursor.fetchone()

    # Invoice value
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) AS total_invoice_value
        FROM invoices
    """)
    invoices = cursor.fetchone()

    # Payments received
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) AS total_payments_received
        FROM payments
        WHERE status = 'Received'
    """)
    payments = cursor.fetchone()

    # Outstanding
    total_invoice_value = float(invoices["total_invoice_value"] or 0)
    total_payments_received = float(payments["total_payments_received"] or 0)

    outstanding_amount = total_invoice_value - total_payments_received

    cursor.close()
    connection.close()

    return jsonify({
        "total_customers": customers["total_customers"],
        "total_rfqs": rfqs["total_rfqs"],
        "total_quotations": quotations["total_quotations"],
        "total_jobs": jobs["total_jobs"] or 0,
        "ongoing_jobs": jobs["ongoing_jobs"] or 0,
        "completed_jobs": jobs["completed_jobs"] or 0,
        "total_invoice_value": total_invoice_value,
        "total_payments_received": total_payments_received,
        "outstanding_amount": outstanding_amount
    }), 200