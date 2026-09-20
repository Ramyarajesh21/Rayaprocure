from flask import Blueprint, jsonify
from app.db import get_db_connection

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/dashboard", methods=["GET"])
def get_dashboard():

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:

        # Total Jobs
        cursor.execute("""
            SELECT COUNT(*) AS total_jobs
            FROM jobs
        """)
        total_jobs = cursor.fetchone()["total_jobs"]

        # Ongoing Jobs
        cursor.execute("""
            SELECT COUNT(*) AS ongoing_jobs
            FROM jobs
            WHERE status = 'Ongoing'
        """)
        ongoing_jobs = cursor.fetchone()["ongoing_jobs"]

        # Completed Jobs
        cursor.execute("""
            SELECT COUNT(*) AS completed_jobs
            FROM jobs
            WHERE status = 'Completed'
        """)
        completed_jobs = cursor.fetchone()["completed_jobs"]

        # Total RFQs / Work Orders
        cursor.execute("""
            SELECT COUNT(*) AS total_rfqs
            FROM rfqs
        """)
        total_rfqs = cursor.fetchone()["total_rfqs"]

        # Approved Quotation Value
        cursor.execute("""
            SELECT COALESCE(SUM(amount), 0) AS quotation_value
            FROM quotations
            WHERE status = 'Approved'
        """)
        quotation_value = cursor.fetchone()["quotation_value"]

        # Total Invoice Value
        cursor.execute("""
            SELECT COALESCE(SUM(amount), 0) AS invoice_value
            FROM invoices
        """)
        invoice_value = cursor.fetchone()["invoice_value"]

        # Total Received Payments
        cursor.execute("""
            SELECT COALESCE(SUM(amount), 0) AS payments_received
            FROM payments
            WHERE status = 'Received'
        """)
        payments_received = cursor.fetchone()["payments_received"]

        # Outstanding Amount
        outstanding_amount = (
            float(invoice_value) -
            float(payments_received)
        )

        # Recent Jobs
        cursor.execute("""
            SELECT
                jobs.id,
                jobs.job_name,
                jobs.status,
                jobs.start_date,
                quotations.amount AS quotation_amount,
                rfqs.id AS rfq_id,
                customers.company_name
            FROM jobs
            JOIN quotations
                ON jobs.quotation_id = quotations.id
            JOIN rfqs
                ON quotations.rfq_id = rfqs.id
            JOIN customers
                ON rfqs.customer_id = customers.id
            ORDER BY jobs.id DESC
            LIMIT 5
        """)

        recent_jobs = cursor.fetchall()

        # Convert date values to strings for JSON
        for job in recent_jobs:
            if job.get("start_date"):
                job["start_date"] = job["start_date"].isoformat()

            if job.get("quotation_amount") is not None:
                job["quotation_amount"] = float(
                    job["quotation_amount"]
                )

        return jsonify({
            "total_jobs": total_jobs,
            "ongoing_jobs": ongoing_jobs,
            "completed_jobs": completed_jobs,
            "total_rfqs": total_rfqs,
            "quotation_value": float(quotation_value),
            "invoice_value": float(invoice_value),
            "payments_received": float(payments_received),
            "outstanding_amount": outstanding_amount,
            "recent_jobs": recent_jobs
        }), 200

    except Exception as error:

        print("Error fetching dashboard:", error)

        return jsonify({
            "message": "Unable to load dashboard data."
        }), 500

    finally:
        cursor.close()
        connection.close()
