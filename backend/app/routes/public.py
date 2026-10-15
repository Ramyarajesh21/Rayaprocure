"""Customer portal: open a shared quotation/invoice and respond, no login."""

import json
from datetime import date

from flask import Blueprint, jsonify, request

from app.audit import record_audit
from app.db import get_db_connection
from app.documents import get_invoice_detail, get_quotation_detail, load_company
from app.notifications import create_notification
from app.ratelimit import rate_limit

public_bp = Blueprint("public", __name__)

# Only these company fields are ever exposed to a customer.
COMPANY_PUBLIC_FIELDS = (
    "company_name", "business_type", "email", "phone", "address", "website", "logo_url",
    "gstin", "pan", "state_code", "bank_name", "bank_account_name", "bank_account_no",
    "bank_ifsc", "bank_branch", "upi_id", "brand_color", "signature_url",
    "authorised_signatory", "currency", "gst_registered",
)

INTERNAL_KEYS = ("rfq_id", "job_id", "customer_id", "job_status")


def find_share(cursor, token):
    cursor.execute(
        """SELECT * FROM document_shares
           WHERE token = %s AND revoked = FALSE AND (expires_at IS NULL OR expires_at > NOW())""",
        (token,),
    )
    return cursor.fetchone()


def load_public_template(cursor, tenant_id, doc_type):
    cursor.execute(
        """SELECT layout, custom_html, custom_css FROM document_templates
           WHERE tenant_id = %s AND doc_type = %s AND is_default = TRUE LIMIT 1""",
        (tenant_id, doc_type),
    )
    row = cursor.fetchone()
    if not row:
        return None
    layout = row["layout"]
    return {
        "layout": json.loads(layout) if isinstance(layout, str) else layout,
        "custom_html": row["custom_html"],
        "custom_css": row["custom_css"],
    }


def can_respond(document):
    if document["status"] not in {"Draft", "Sent"}:
        return False
    valid_until = document.get("valid_until")
    return not (valid_until and valid_until < date.today())


@public_bp.route("/api/public/<token>", methods=["GET"])
@rate_limit("public-view", 120, 300)
def view_shared_document(token):
    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Service unavailable."}), 503
    cursor = connection.cursor(dictionary=True)
    try:
        share = find_share(cursor, token)
        if not share:
            return jsonify({"message": "This link is invalid or has expired."}), 404

        tenant = share["tenant_id"]
        doc_type = share["entity_type"]
        if doc_type == "quotation":
            document = get_quotation_detail(cursor, tenant, share["entity_id"])
        else:
            document = get_invoice_detail(cursor, tenant, share["entity_id"])
        if not document:
            return jsonify({"message": "This document is no longer available."}), 404

        first_view = share["first_viewed_at"] is None
        cursor.execute(
            """UPDATE document_shares
               SET view_count = view_count + 1, last_viewed_at = NOW(),
                   first_viewed_at = COALESCE(first_viewed_at, NOW())
               WHERE id = %s""",
            (share["id"],),
        )
        if first_view:
            number = document.get("quotation_number") or document.get("invoice_number")
            create_notification(
                cursor, f"{doc_type.title()} viewed",
                f"{document['company_name']} opened {doc_type} {number}.",
                doc_type.title(), f"/{doc_type}s/{share['entity_id']}/preview", tenant_id=tenant,
            )
        connection.commit()

        company_row = load_company(cursor, tenant)
        company = {key: company_row.get(key) for key in COMPANY_PUBLIC_FIELDS}
        for key in INTERNAL_KEYS:
            document.pop(key, None)

        return jsonify({
            "type": doc_type,
            "document": document,
            "company": company,
            "template": load_public_template(cursor, tenant, doc_type),
            "canRespond": doc_type == "quotation" and can_respond(document),
        }), 200
    except Exception as error:
        connection.rollback()
        print("Public view error:", error)
        return jsonify({"message": "Unable to open this document."}), 500
    finally:
        cursor.close()
        connection.close()


@public_bp.route("/api/public/<token>/respond", methods=["POST"])
@rate_limit("public-respond", 10, 600)
def respond_to_quotation(token):
    data = request.get_json() or {}
    decision = data.get("decision")
    name = str(data.get("name") or "").strip()
    note = str(data.get("note") or "").strip()[:500]

    if decision not in {"Accepted", "Rejected"}:
        return jsonify({"message": "Choose Accept or Decline."}), 400
    if len(name) < 2:
        return jsonify({"message": "Please enter your name."}), 400

    connection = get_db_connection()
    if not connection:
        return jsonify({"message": "Service unavailable."}), 503
    cursor = connection.cursor(dictionary=True)
    try:
        share = find_share(cursor, token)
        if not share or share["entity_type"] != "quotation":
            return jsonify({"message": "This link is invalid or has expired."}), 404

        tenant = share["tenant_id"]
        quotation = get_quotation_detail(cursor, tenant, share["entity_id"])
        if not quotation or not can_respond(quotation):
            return jsonify({"message": "This quotation can no longer be responded to."}), 409

        cursor.execute(
            """UPDATE quotations
               SET status = %s, responded_at = NOW(), response_note = %s, responded_by_name = %s
               WHERE id = %s AND tenant_id = %s AND status IN ('Draft', 'Sent')""",
            (decision, note or None, name[:150], quotation["id"], tenant),
        )
        if cursor.rowcount == 0:
            connection.rollback()
            return jsonify({"message": "This quotation was already answered."}), 409

        record_audit(
            cursor, f"Customer {decision.lower()}", "Quotation", quotation["id"],
            {"by": name, "via": "portal"}, tenant_id=tenant, user_id=None,
        )
        create_notification(
            cursor, f"Quotation {decision}",
            f"{name} ({quotation['company_name']}) {decision.lower()} quotation {quotation['quotation_number']}.",
            "Quotation", f"/quotations/{quotation['id']}/preview", tenant_id=tenant,
        )
        connection.commit()
        return jsonify({"message": f"Thank you. The quotation has been marked {decision.lower()}."}), 200
    except Exception as error:
        connection.rollback()
        print("Public respond error:", error)
        return jsonify({"message": "Unable to record your response."}), 500
    finally:
        cursor.close()
        connection.close()
