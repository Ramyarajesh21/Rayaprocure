from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, session

from app.audit import record_audit
from app.db import get_db_connection
from app.documents import (
    INVOICE_FROM,
    INVOICE_SELECT,
    build_document,
    fetch_customer,
    get_invoice_detail,
    load_company,
    load_items,
    replace_items,
)
from app.notifications import create_notification
from app.numbering import next_document_number
from app.payment_reconciliation import reconcile_invoice_payment_status
from app.security import tenant_id

invoices_bp = Blueprint("invoices", __name__)

ALLOWED_STATUSES = ["Submitted", "Approved"]

def parse_dates(data, company, customer):
    """Default the invoice and due dates from tenant / customer settings."""
    try:
        invoice_date = (
            datetime.strptime(data["invoice_date"], "%Y-%m-%d").date()
            if data.get("invoice_date") else datetime.today().date()
        )
        if data.get("due_date"):
            due_date = datetime.strptime(data["due_date"], "%Y-%m-%d").date()
        else:
            days = (customer or {}).get("payment_terms_days") or company.get("invoice_due_days") or 15
            due_date = invoice_date + timedelta(days=int(days))
    except ValueError:
        raise ValueError("Invoice and due dates must be valid dates.")
    if due_date < invoice_date:
        raise ValueError("Due date cannot be before the invoice date.")
    return invoice_date, due_date


def fetch_job_context(cursor, job_id):
    """Return the job with its quotation's customer, or None."""
    cursor.execute("""
        SELECT jobs.id, jobs.quotation_id, rfqs.customer_id
        FROM jobs
        JOIN quotations ON jobs.quotation_id = quotations.id
        JOIN rfqs ON quotations.rfq_id = rfqs.id
        WHERE jobs.id = %s AND jobs.tenant_id = %s
    """, (job_id, tenant_id()))
    return cursor.fetchone()


# =========================================================
# GET ALL INVOICES
# =========================================================
@invoices_bp.route("/invoices", methods=["GET"])
def get_invoices():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute(f"""
            SELECT {INVOICE_SELECT}
            {INVOICE_FROM}
            WHERE invoices.tenant_id = %s
            ORDER BY invoices.id DESC
        """, (tenant_id(),))
        return jsonify(cursor.fetchall()), 200
    except Exception as error:
        print("Error fetching invoices:", error)
        return jsonify({"message": "Unable to load invoices."}), 500
    finally:
        cursor.close()
        connection.close()


# =========================================================
# GET SINGLE INVOICE
# =========================================================
@invoices_bp.route("/invoices/<int:invoice_id>", methods=["GET"])
def get_invoice(invoice_id):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        invoice = get_invoice_detail(cursor, tenant_id(), invoice_id)
        if not invoice:
            return jsonify({"message": "Invoice not found."}), 404
        return jsonify(invoice), 200
    except Exception as error:
        print("Error fetching invoice:", error)
        return jsonify({"message": "Unable to load invoice."}), 500
    finally:
        cursor.close()
        connection.close()


# =========================================================
# DRAFT AN INVOICE FROM A JOB'S ACCEPTED QUOTATION
# =========================================================
@invoices_bp.route("/invoices/draft/<int:job_id>", methods=["GET"])
def draft_invoice_from_job(job_id):
    """Pre-fill invoice lines, tax treatment and dates from the job's quotation."""
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        job = fetch_job_context(cursor, job_id)
        if not job:
            return jsonify({"message": "Job not found."}), 404

        company = load_company(cursor, tenant_id())
        customer = fetch_customer(cursor, tenant_id(), job["customer_id"])
        invoice_date, due_date = parse_dates({}, company, customer)

        cursor.execute(
            "SELECT place_of_supply, adjustment, grand_total FROM quotations WHERE id = %s AND tenant_id = %s",
            (job["quotation_id"], tenant_id()),
        )
        quotation = cursor.fetchone() or {}

        # Milestone billing: ?percent=30 bills 30% of every quotation line.
        try:
            percent = float(request.args.get("percent") or 100)
        except ValueError:
            return jsonify({"message": "Percent must be a number."}), 400
        if not 0 < percent <= 100:
            return jsonify({"message": "Percent must be between 0 and 100."}), 400

        items = load_items(cursor, "quotation", job["quotation_id"])
        for item in items:
            item.pop("id", None)
            item.pop("quotation_id", None)
            if percent < 100:
                item["rate"] = round(float(item["rate"]) * percent / 100, 2)
                item["description"] = f"{item['description']} ({percent:g}% milestone)"

        cursor.execute(
            """SELECT COALESCE(SUM(grand_total), 0) AS billed, COUNT(*) AS invoices
               FROM invoices WHERE job_id = %s AND tenant_id = %s""",
            (job_id, tenant_id()),
        )
        billing = cursor.fetchone()
        quote_total = float(quotation.get("grand_total") or 0)

        number = next_document_number(
            cursor, tenant_id(), "invoices", "invoice_number",
            company.get("invoice_prefix") or "INV-", int(company.get("number_width") or 4),
        )
        return jsonify({
            "job_id": job_id,
            "invoice_number": number,
            "invoice_date": invoice_date.isoformat(),
            "due_date": due_date.isoformat(),
            "place_of_supply": quotation.get("place_of_supply"),
            "adjustment": float(quotation.get("adjustment") or 0) if percent == 100 else 0,
            "notes": company.get("default_invoice_notes") or "",
            "terms_conditions": company.get("default_invoice_terms") or "",
            "milestone_label": "" if percent == 100 else f"{percent:g}% milestone",
            "items": items,
            "quote_total": quote_total,
            "billed_so_far": float(billing["billed"]),
            "invoice_count": billing["invoices"],
            "remaining": round(quote_total - float(billing["billed"]), 2),
        }), 200
    except Exception as error:
        print("Error drafting invoice:", error)
        return jsonify({"message": "Unable to prepare the invoice draft."}), 500
    finally:
        cursor.close()
        connection.close()


def save_invoice(cursor, data, invoice_id=None):
    """Create or update an invoice inside the caller's transaction."""
    company = load_company(cursor, tenant_id())

    job_id = data.get("job_id")
    if not job_id:
        return None, (jsonify({"message": "Job is required."}), 400)

    status = data.get("status") or "Submitted"
    if status not in ALLOWED_STATUSES:
        return None, (jsonify({"message": "Invalid invoice status."}), 400)

    job = fetch_job_context(cursor, job_id)
    if not job:
        return None, (jsonify({"message": "Job not found."}), 404)

    customer = fetch_customer(cursor, tenant_id(), job["customer_id"])
    invoice_date, due_date = parse_dates(data, company, customer)

    invoice_number = (data.get("invoice_number") or "").strip()
    if not invoice_number:
        invoice_number = next_document_number(
            cursor, tenant_id(), "invoices", "invoice_number",
            company.get("invoice_prefix") or "INV-", int(company.get("number_width") or 4),
        )
    cursor.execute(
        "SELECT id FROM invoices WHERE invoice_number = %s AND tenant_id = %s AND id != %s",
        (invoice_number, tenant_id(), invoice_id or 0),
    )
    if cursor.fetchone():
        return None, (jsonify({"message": "Invoice number already exists."}), 400)

    items, totals, supply_type, place, _ = build_document(
        cursor, tenant_id(), customer, data.get("items"), data.get("adjustment", 0),
        data.get("place_of_supply"), "invoice item",
    )

    if invoice_id is not None:
        cursor.execute(
            """SELECT COALESCE(SUM(amount), 0) AS recorded
               FROM payments WHERE invoice_id = %s AND tenant_id = %s""",
            (invoice_id, tenant_id()),
        )
        recorded = float(cursor.fetchone()["recorded"] or 0)
        if float(totals["grand_total"]) < recorded:
            return None, (
                jsonify({
                    "message": "Invoice amount cannot be lower than the recorded "
                               f"payment total of ₹{recorded:,.2f}."
                }),
                400,
            )

    shared = (
        invoice_date, due_date, totals["grand_total"], totals["subtotal"],
        totals["adjustment"], totals["grand_total"], status, data.get("notes"),
        data.get("terms_conditions"), place, supply_type, totals["taxable_value"],
        totals["cgst_total"], totals["sgst_total"], totals["igst_total"],
        totals["total_tax"], totals["round_off"], bool(data.get("reverse_charge")),
        str(data.get("milestone_label") or "").strip()[:120],
    )

    if invoice_id is None:
        cursor.execute("""
            INSERT INTO invoices (
                tenant_id, job_id, invoice_number, invoice_date, due_date, amount,
                subtotal, adjustment, grand_total, status, notes, terms_conditions,
                place_of_supply, supply_type, taxable_value, cgst_total, sgst_total,
                igst_total, total_tax, round_off, reverse_charge, milestone_label, payment_status
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Pending')
        """, (tenant_id(), job_id, invoice_number, *shared))
        invoice_id = cursor.lastrowid
    else:
        cursor.execute("""
            UPDATE invoices SET
                job_id = %s, invoice_number = %s, invoice_date = %s, due_date = %s,
                amount = %s, subtotal = %s, adjustment = %s, grand_total = %s,
                status = %s, notes = %s, terms_conditions = %s, place_of_supply = %s,
                supply_type = %s, taxable_value = %s, cgst_total = %s, sgst_total = %s,
                igst_total = %s, total_tax = %s, round_off = %s, reverse_charge = %s,
                milestone_label = %s
            WHERE id = %s AND tenant_id = %s
        """, (job_id, invoice_number, *shared, invoice_id, tenant_id()))

    replace_items(cursor, "invoice", invoice_id, items)

    # Payment status is derived from received payments, never from the form.
    reconcile_invoice_payment_status(cursor, invoice_id)
    return {"id": invoice_id, "invoice_number": invoice_number}, None


# =========================================================
# CREATE INVOICE
# =========================================================
@invoices_bp.route("/invoices", methods=["POST"])
def create_invoice():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        result, error = save_invoice(cursor, request.get_json() or {})
        if error:
            connection.rollback()
            return error
        connection.commit()
        return jsonify({
            "message": "Invoice created successfully.",
            "id": result["id"],
            "invoice_number": result["invoice_number"],
        }), 201
    except ValueError as error:
        connection.rollback()
        return jsonify({"message": str(error)}), 400
    except Exception as error:
        connection.rollback()
        print("Error creating invoice:", error)
        return jsonify({"message": "Unable to create invoice."}), 500
    finally:
        cursor.close()
        connection.close()


# =========================================================
# UPDATE INVOICE
# =========================================================
@invoices_bp.route("/invoices/<int:invoice_id>", methods=["PUT"])
def update_invoice(invoice_id):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT id FROM invoices WHERE id = %s AND tenant_id = %s",
            (invoice_id, tenant_id()),
        )
        if not cursor.fetchone():
            return jsonify({"message": "Invoice not found."}), 404

        result, error = save_invoice(cursor, request.get_json() or {}, invoice_id)
        if error:
            connection.rollback()
            return error
        connection.commit()
        return jsonify({"message": "Invoice updated successfully."}), 200
    except ValueError as error:
        connection.rollback()
        return jsonify({"message": str(error)}), 400
    except Exception as error:
        connection.rollback()
        print("Error updating invoice:", error)
        return jsonify({"message": "Unable to update invoice."}), 500
    finally:
        cursor.close()
        connection.close()


# =========================================================
# INVOICE APPROVAL
# =========================================================
@invoices_bp.route("/invoices/<int:invoice_id>/approve", methods=["POST"])
def approve_invoice(invoice_id):
    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Database connection failed."}), 503

    cursor = connection.cursor()
    try:
        cursor.execute(
            "SELECT id FROM invoices WHERE id = %s AND tenant_id = %s",
            (invoice_id, tenant_id()),
        )
        if not cursor.fetchone():
            return jsonify({"message": "Invoice not found."}), 404

        cursor.execute("""
            UPDATE invoices SET status = 'Approved', approved_by = %s, approved_at = NOW()
            WHERE id = %s AND tenant_id = %s
        """, (session["user"]["id"], invoice_id, tenant_id()))
        record_audit(cursor, "Approved", "Invoice", invoice_id)
        create_notification(
            cursor, "Invoice approved", f"Invoice #{invoice_id} was approved.",
            "Invoice", f"/invoices/{invoice_id}/preview",
        )
        connection.commit()
        return jsonify({"message": "Invoice approved successfully."}), 200
    except Exception as error:
        connection.rollback()
        print("Invoice approval error:", error)
        return jsonify({"message": "Unable to approve invoice."}), 500
    finally:
        cursor.close()
        connection.close()


# =========================================================
# DELETE INVOICE
# =========================================================
@invoices_bp.route("/invoices/<int:invoice_id>", methods=["DELETE"])
def delete_invoice(invoice_id):
    connection = get_db_connection()
    cursor = connection.cursor()

    try:
        cursor.execute(
            "DELETE FROM invoices WHERE id = %s AND tenant_id = %s",
            (invoice_id, tenant_id()),
        )
        if cursor.rowcount == 0:
            return jsonify({"message": "Invoice not found."}), 404

        connection.commit()
        return jsonify({"message": "Invoice deleted successfully."}), 200
    except Exception as error:
        connection.rollback()
        print("Error deleting invoice:", error)
        if getattr(error, "errno", None) == 1451:
            return jsonify({"message": "This invoice has payments and cannot be deleted."}), 409
        return jsonify({"message": "Unable to delete invoice."}), 500
    finally:
        cursor.close()
        connection.close()
