import re
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, session

from app.audit import record_audit
from app.db import get_db_connection
from app.documents import (
    QUOTATION_SELECT,
    build_document,
    fetch_customer,
    get_quotation_detail,
    load_company,
    load_items,
    replace_items,
)
from app.notifications import create_notification
from app.numbering import next_document_number
from app.security import tenant_id


quotations_bp = Blueprint("quotations", __name__)


DEFAULT_TERMS = """1. This quotation is valid until the date shown above.
2. Work or supply will be carried out according to the agreed scope and specifications.
3. Any additional work or requirement outside the agreed scope will be charged separately.
4. Delivery or work schedules will be mutually agreed with the customer.
5. Payment terms will be as mutually agreed between the supplier and the customer.
6. Any changes to the scope, quantity, or specifications may require a revised quotation."""

DEFAULT_NOTES = """Please review the quoted scope, quantities, and specifications carefully before confirmation.
This quotation is subject to the availability of required materials and resources."""

ALLOWED_STATUSES = ["Draft", "Sent", "Accepted", "Rejected", "Expired"]  # "Revised" is set only by /revise

def sync_rfq_status(cursor, rfq_id):
    """An RFQ is quoted while it has at least one linked quotation."""
    cursor.execute("SELECT COUNT(*) AS quotation_count FROM quotations WHERE rfq_id = %s", (rfq_id,))
    row = cursor.fetchone()
    quotation_count = row["quotation_count"] if isinstance(row, dict) else row[0]
    cursor.execute(
        "UPDATE rfqs SET status = %s WHERE id = %s",
        ("Quoted" if quotation_count else "New", rfq_id),
    )


def parse_payload(data, company):
    """Validate the header fields shared by create and update."""
    status = data.get("status", "Draft")
    if status not in ALLOWED_STATUSES:
        raise ValueError("Invalid quotation status.")
    if not data.get("rfq_id"):
        raise ValueError("RFQ is required.")

    raw_date = data.get("quotation_date")
    if raw_date:
        try:
            quotation_date = datetime.strptime(raw_date, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError("Invalid quotation date.")
    else:
        quotation_date = datetime.today().date()

    raw_valid_until = data.get("valid_until")
    if raw_valid_until:
        try:
            valid_until = datetime.strptime(raw_valid_until, "%Y-%m-%d").date()
        except ValueError:
            raise ValueError("Invalid valid-until date.")
        if valid_until < quotation_date:
            raise ValueError("Valid-until date cannot be before the quotation date.")
    else:
        valid_days = int(company.get("quotation_valid_days") or 15)
        valid_until = quotation_date + timedelta(days=valid_days)

    return {
        "status": status,
        "quotation_date": quotation_date,
        "valid_until": valid_until,
        "notes": data.get("notes") or company.get("default_quotation_notes") or DEFAULT_NOTES,
        "terms": data.get("terms_conditions") or company.get("default_quotation_terms") or DEFAULT_TERMS,
    }


def fetch_rfq(cursor, rfq_id):
    cursor.execute(
        "SELECT id, customer_id FROM rfqs WHERE id = %s AND tenant_id = %s",
        (rfq_id, tenant_id()),
    )
    return cursor.fetchone()


# =========================================================
# GET ALL QUOTATIONS
# =========================================================
@quotations_bp.route("/quotations", methods=["GET"])
def get_quotations():
    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Database connection failed."}), 500

    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(f"""
            SELECT {QUOTATION_SELECT}
            FROM quotations q
            JOIN rfqs r ON q.rfq_id = r.id
            JOIN customers c ON r.customer_id = c.id
            WHERE q.tenant_id = %s
            ORDER BY q.id DESC
        """, (tenant_id(),))
        return jsonify(cursor.fetchall()), 200
    except Exception as error:
        print("Get quotations error:", error)
        return jsonify({"message": "Unable to load quotations."}), 500
    finally:
        cursor.close()
        connection.close()


# =========================================================
# GET SINGLE QUOTATION
# =========================================================
@quotations_bp.route("/quotations/<int:quotation_id>", methods=["GET"])
def get_quotation(quotation_id):
    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Database connection failed."}), 500

    cursor = connection.cursor(dictionary=True)
    try:
        quotation = get_quotation_detail(cursor, tenant_id(), quotation_id)
        if not quotation:
            return jsonify({"message": "Quotation not found."}), 404
        return jsonify(quotation), 200
    except Exception as error:
        print("Get quotation error:", error)
        return jsonify({"message": "Unable to load quotation."}), 500
    finally:
        cursor.close()
        connection.close()


def save_quotation(cursor, data, quotation_id=None):
    """Create or update a quotation inside the caller's transaction."""
    company = load_company(cursor, tenant_id())
    header = parse_payload(data, company)

    rfq = fetch_rfq(cursor, data.get("rfq_id"))
    if not rfq:
        return None, (jsonify({"message": "RFQ not found."}), 404)

    customer = fetch_customer(cursor, tenant_id(), rfq["customer_id"])
    items, totals, supply_type, place, _ = build_document(
        cursor, tenant_id(), customer, data.get("items"), data.get("adjustment", 0),
        data.get("place_of_supply"), "quotation item",
    )

    values = (
        data.get("rfq_id"), header["quotation_date"], header["valid_until"],
        items[0]["description"], totals["grand_total"], totals["subtotal"],
        totals["adjustment"], totals["grand_total"], header["notes"], header["terms"],
        header["status"], place, supply_type, totals["taxable_value"],
        totals["cgst_total"], totals["sgst_total"], totals["igst_total"],
        totals["total_tax"], totals["round_off"],
    )

    if quotation_id is None:
        number = next_document_number(
            cursor, tenant_id(), "quotations", "quotation_number",
            company.get("quotation_prefix") or "QTN-", int(company.get("number_width") or 4),
        )
        cursor.execute("""
            INSERT INTO quotations (
                tenant_id, quotation_number, rfq_id, quotation_date, valid_until,
                description, amount, subtotal, adjustment, grand_total, notes,
                terms_conditions, status, place_of_supply, supply_type,
                taxable_value, cgst_total, sgst_total, igst_total, total_tax, round_off
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (tenant_id(), number, *values))
        quotation_id = cursor.lastrowid
    else:
        number = None
        cursor.execute("""
            UPDATE quotations SET
                rfq_id = %s, quotation_date = %s, valid_until = %s, description = %s,
                amount = %s, subtotal = %s, adjustment = %s, grand_total = %s,
                notes = %s, terms_conditions = %s, status = %s, place_of_supply = %s,
                supply_type = %s, taxable_value = %s, cgst_total = %s, sgst_total = %s,
                igst_total = %s, total_tax = %s, round_off = %s
            WHERE id = %s AND tenant_id = %s
        """, (*values, quotation_id, tenant_id()))

    replace_items(cursor, "quotation", quotation_id, items)
    return {"id": quotation_id, "quotation_number": number, "rfq_id": data.get("rfq_id")}, None


# =========================================================
# CREATE QUOTATION
# =========================================================
@quotations_bp.route("/quotations", methods=["POST"])
def create_quotation():
    data = request.get_json() or {}

    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Database connection failed."}), 500

    cursor = connection.cursor(dictionary=True)
    try:
        result, error = save_quotation(cursor, data)
        if error:
            connection.rollback()
            return error

        sync_rfq_status(cursor, result["rfq_id"])
        connection.commit()
        return jsonify({
            "message": "Quotation created successfully.",
            "id": result["id"],
            "quotation_number": result["quotation_number"],
        }), 201

    except ValueError as error:
        connection.rollback()
        return jsonify({"message": str(error)}), 400
    except Exception as error:
        connection.rollback()
        print("Quotation create error:", error)
        return jsonify({"message": "Failed to create quotation."}), 500
    finally:
        cursor.close()
        connection.close()


# =========================================================
# UPDATE QUOTATION
# =========================================================
@quotations_bp.route("/quotations/<int:quotation_id>", methods=["PUT"])
def update_quotation(quotation_id):
    data = request.get_json() or {}

    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Database connection failed."}), 500

    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT id, rfq_id FROM quotations WHERE id = %s AND tenant_id = %s",
            (quotation_id, tenant_id()),
        )
        existing = cursor.fetchone()
        if not existing:
            return jsonify({"message": "Quotation not found."}), 404

        result, error = save_quotation(cursor, data, quotation_id)
        if error:
            connection.rollback()
            return error

        # Keep the old and new RFQ in sync when a quotation is reassigned.
        sync_rfq_status(cursor, existing["rfq_id"])
        if existing["rfq_id"] != result["rfq_id"]:
            sync_rfq_status(cursor, result["rfq_id"])

        connection.commit()
        return jsonify({"message": "Quotation updated successfully."}), 200

    except ValueError as error:
        connection.rollback()
        return jsonify({"message": str(error)}), 400
    except Exception as error:
        connection.rollback()
        print("Quotation update error:", error)
        return jsonify({"message": "Failed to update quotation."}), 500
    finally:
        cursor.close()
        connection.close()


# =========================================================
# QUOTATION ACCEPT / REJECT (internal users)
# =========================================================
def apply_decision(cursor, quotation_id, decision, user_id, note=None, responder_name=None):
    """Record an Accepted/Rejected decision. Shared with the customer portal."""
    cursor.execute("""
        UPDATE quotations
        SET status = %s, approved_by = %s, approved_at = NOW(), responded_at = NOW(),
            response_note = %s, responded_by_name = %s
        WHERE id = %s AND tenant_id = %s
    """, (decision, user_id, note, responder_name, quotation_id, tenant_id()))


@quotations_bp.route("/quotations/<int:quotation_id>/decision", methods=["POST"])
def decide_quotation(quotation_id):
    decision = (request.get_json() or {}).get("decision")
    if decision not in {"Accepted", "Rejected"}:
        return jsonify({"message": "Decision must be Accepted or Rejected."}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Database connection failed."}), 503

    cursor = connection.cursor()
    try:
        cursor.execute(
            "SELECT id FROM quotations WHERE id = %s AND tenant_id = %s",
            (quotation_id, tenant_id()),
        )
        if not cursor.fetchone():
            return jsonify({"message": "Quotation not found."}), 404

        apply_decision(cursor, quotation_id, decision, session["user"]["id"])
        record_audit(cursor, decision, "Quotation", quotation_id)
        create_notification(
            cursor, f"Quotation {decision}",
            f"Quotation #{quotation_id} was {decision.lower()}.",
            "Quotation", f"/quotations/{quotation_id}/preview",
        )
        connection.commit()
        return jsonify({"message": f"Quotation {decision.lower()} successfully."}), 200
    except Exception as error:
        connection.rollback()
        print("Quotation decision error:", error)
        return jsonify({"message": "Unable to update quotation decision."}), 500
    finally:
        cursor.close()
        connection.close()


# =========================================================
# DELETE QUOTATION
# =========================================================
@quotations_bp.route("/quotations/<int:quotation_id>", methods=["DELETE"])
def delete_quotation(quotation_id):
    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Database connection failed."}), 500

    cursor = connection.cursor()
    try:
        cursor.execute(
            "SELECT rfq_id FROM quotations WHERE id = %s AND tenant_id = %s",
            (quotation_id, tenant_id()),
        )
        quotation = cursor.fetchone()
        if not quotation:
            return jsonify({"message": "Quotation not found."}), 404

        # quotation_items are removed by ON DELETE CASCADE.
        cursor.execute(
            "DELETE FROM quotations WHERE id = %s AND tenant_id = %s",
            (quotation_id, tenant_id()),
        )
        sync_rfq_status(cursor, quotation[0])
        connection.commit()
        return jsonify({"message": "Quotation deleted successfully."}), 200
    except Exception as error:
        connection.rollback()
        print("Quotation delete error:", error)
        if getattr(error, "errno", None) == 1451:
            return jsonify({"message": "This quotation already has a job and cannot be deleted."}), 409
        return jsonify({"message": "Failed to delete quotation."}), 500
    finally:
        cursor.close()
        connection.close()


# =========================================================
# REVISE QUOTATION (keeps the old version for the record)
# =========================================================
@quotations_bp.route("/quotations/<int:quotation_id>/revise", methods=["POST"])
def revise_quotation(quotation_id):
    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Database connection failed."}), 500

    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            "SELECT * FROM quotations WHERE id = %s AND tenant_id = %s FOR UPDATE",
            (quotation_id, tenant_id()),
        )
        original = cursor.fetchone()
        if not original:
            return jsonify({"message": "Quotation not found."}), 404
        if original["status"] == "Revised":
            return jsonify({"message": "This version was already revised. Revise the latest version instead."}), 409

        cursor.execute("SELECT id FROM jobs WHERE quotation_id = %s", (quotation_id,))
        if cursor.fetchone():
            return jsonify({"message": "A job already exists for this quotation, so it cannot be revised."}), 409

        company = load_company(cursor, tenant_id())
        base = re.sub(r"-R\d+$", "", original["quotation_number"])
        revision_no = int(original["revision_no"] or 0) + 1
        number = f"{base}-R{revision_no}"

        today = datetime.today().date()
        valid_until = today + timedelta(days=int(company.get("quotation_valid_days") or 15))

        cursor.execute("""
            INSERT INTO quotations (
                tenant_id, quotation_number, rfq_id, quotation_date, valid_until, description,
                amount, subtotal, adjustment, grand_total, notes, terms_conditions, status,
                place_of_supply, supply_type, taxable_value, cgst_total, sgst_total,
                igst_total, total_tax, round_off, revision_of, revision_no
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'Draft',
                      %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            tenant_id(), number, original["rfq_id"], today, valid_until, original["description"],
            original["amount"], original["subtotal"], original["adjustment"], original["grand_total"],
            original["notes"], original["terms_conditions"], original["place_of_supply"],
            original["supply_type"], original["taxable_value"], original["cgst_total"],
            original["sgst_total"], original["igst_total"], original["total_tax"],
            original["round_off"], quotation_id, revision_no,
        ))
        new_id = cursor.lastrowid

        items = load_items(cursor, "quotation", quotation_id)
        replace_items(cursor, "quotation", new_id, items)

        cursor.execute(
            "UPDATE quotations SET status = 'Revised' WHERE id = %s AND tenant_id = %s",
            (quotation_id, tenant_id()),
        )
        record_audit(cursor, "Revised", "Quotation", quotation_id, {"new_id": new_id, "number": number})
        connection.commit()
        return jsonify({"message": f"Created revision {number}.", "id": new_id, "quotation_number": number}), 201
    except Exception as error:
        connection.rollback()
        print("Quotation revise error:", error)
        return jsonify({"message": "Unable to create a revision."}), 500
    finally:
        cursor.close()
        connection.close()
