from flask import Blueprint, request, jsonify
from app.db import get_db_connection

invoices_bp = Blueprint("invoices", __name__)


ALLOWED_STATUSES = ["Submitted", "Approved"]


# GET ALL INVOICES
@invoices_bp.route("/invoices", methods=["GET"])
def get_invoices():

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                invoices.id,
                invoices.job_id,
                jobs.job_name,
                jobs.status AS job_status,
                invoices.invoice_number,
                invoices.amount,
                invoices.status
            FROM invoices
            JOIN jobs
                ON invoices.job_id = jobs.id
            ORDER BY invoices.id DESC
        """)

        invoices = cursor.fetchall()

        return jsonify(invoices), 200

    finally:
        cursor.close()
        connection.close()


# CREATE INVOICE
@invoices_bp.route("/invoices", methods=["POST"])
def create_invoice():

    data = request.get_json() or {}

    job_id = data.get("job_id")
    invoice_number = data.get("invoice_number")
    amount = data.get("amount")
    status = data.get("status", "Submitted")

    # Validation
    if not job_id:
        return jsonify({
            "message": "Job is required."
        }), 400

    if not invoice_number or not invoice_number.strip():
        return jsonify({
            "message": "Invoice number is required."
        }), 400

    if amount is None:
        return jsonify({
            "message": "Invoice amount is required."
        }), 400

    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return jsonify({
            "message": "Invoice amount must be a valid number."
        }), 400

    if amount <= 0:
        return jsonify({
            "message": "Invoice amount must be greater than 0."
        }), 400

    if status not in ALLOWED_STATUSES:
        return jsonify({
            "message": "Invalid invoice status."
        }), 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:

        # Check job
        cursor.execute("""
            SELECT
                id,
                status
            FROM jobs
            WHERE id = %s
        """, (job_id,))

        job = cursor.fetchone()

        if not job:
            return jsonify({
                "message": "Job not found."
            }), 404

        # Ongoing and Completed jobs are both allowed.
        # No job-status restriction is applied here.

        # Prevent duplicate invoice for same job
        cursor.execute("""
            SELECT id
            FROM invoices
            WHERE job_id = %s
        """, (job_id,))

        existing_invoice = cursor.fetchone()

        if existing_invoice:
            return jsonify({
                "message": "An invoice already exists for this job."
            }), 400

        # Prevent duplicate invoice number
        cursor.execute("""
            SELECT id
            FROM invoices
            WHERE invoice_number = %s
        """, (invoice_number.strip(),))

        existing_number = cursor.fetchone()

        if existing_number:
            return jsonify({
                "message": "Invoice number already exists."
            }), 400

        cursor.execute("""
            INSERT INTO invoices (
                job_id,
                invoice_number,
                amount,
                status
            )
            VALUES (%s, %s, %s, %s)
        """, (
            job_id,
            invoice_number.strip(),
            amount,
            status
        ))

        connection.commit()

        new_id = cursor.lastrowid

        return jsonify({
            "message": "Invoice created successfully.",
            "id": new_id
        }), 201

    except Exception as error:

        connection.rollback()

        print("Error creating invoice:", error)

        return jsonify({
            "message": "Unable to create invoice."
        }), 500

    finally:
        cursor.close()
        connection.close()


# UPDATE INVOICE
@invoices_bp.route("/invoices/<int:invoice_id>", methods=["PUT"])
def update_invoice(invoice_id):

    data = request.get_json() or {}

    job_id = data.get("job_id")
    invoice_number = data.get("invoice_number")
    amount = data.get("amount")
    status = data.get("status")

    # Validation
    if not job_id:
        return jsonify({
            "message": "Job is required."
        }), 400

    if not invoice_number or not invoice_number.strip():
        return jsonify({
            "message": "Invoice number is required."
        }), 400

    if amount is None:
        return jsonify({
            "message": "Invoice amount is required."
        }), 400

    try:
        amount = float(amount)
    except (TypeError, ValueError):
        return jsonify({
            "message": "Invoice amount must be a valid number."
        }), 400

    if amount <= 0:
        return jsonify({
            "message": "Invoice amount must be greater than 0."
        }), 400

    if status not in ALLOWED_STATUSES:
        return jsonify({
            "message": "Invalid invoice status."
        }), 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:

        # Check invoice
        cursor.execute("""
            SELECT id
            FROM invoices
            WHERE id = %s
        """, (invoice_id,))

        invoice = cursor.fetchone()

        if not invoice:
            return jsonify({
                "message": "Invoice not found."
            }), 404

        # Check job
        cursor.execute("""
            SELECT id, status
            FROM jobs
            WHERE id = %s
        """, (job_id,))

        job = cursor.fetchone()

        if not job:
            return jsonify({
                "message": "Job not found."
            }), 404

        # Ongoing and Completed jobs are both allowed.

        # Prevent another invoice from using same job
        cursor.execute("""
            SELECT id
            FROM invoices
            WHERE job_id = %s
              AND id != %s
        """, (job_id, invoice_id))

        duplicate_job_invoice = cursor.fetchone()

        if duplicate_job_invoice:
            return jsonify({
                "message": "An invoice already exists for this job."
            }), 400

        # Prevent duplicate invoice number
        cursor.execute("""
            SELECT id
            FROM invoices
            WHERE invoice_number = %s
              AND id != %s
        """, (
            invoice_number.strip(),
            invoice_id
        ))

        duplicate_number = cursor.fetchone()

        if duplicate_number:
            return jsonify({
                "message": "Invoice number already exists."
            }), 400

        cursor.execute("""
            UPDATE invoices
            SET
                job_id = %s,
                invoice_number = %s,
                amount = %s,
                status = %s
            WHERE id = %s
        """, (
            job_id,
            invoice_number.strip(),
            amount,
            status,
            invoice_id
        ))

        connection.commit()

        return jsonify({
            "message": "Invoice updated successfully."
        }), 200

    except Exception as error:

        connection.rollback()

        print("Error updating invoice:", error)

        return jsonify({
            "message": "Unable to update invoice."
        }), 500

    finally:
        cursor.close()
        connection.close()


# DELETE INVOICE
@invoices_bp.route("/invoices/<int:invoice_id>", methods=["DELETE"])
def delete_invoice(invoice_id):

    connection = get_db_connection()
    cursor = connection.cursor()

    try:

        cursor.execute("""
            DELETE FROM invoices
            WHERE id = %s
        """, (invoice_id,))

        if cursor.rowcount == 0:
            return jsonify({
                "message": "Invoice not found."
            }), 404

        connection.commit()

        return jsonify({
            "message": "Invoice deleted successfully."
        }), 200

    except Exception as error:

        connection.rollback()

        print("Error deleting invoice:", error)

        return jsonify({
            "message": "Unable to delete invoice."
        }), 500

    finally:
        cursor.close()
        connection.close()
