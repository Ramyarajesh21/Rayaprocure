import re

from flask import Blueprint, request, jsonify

from app.db import get_db_connection
from app.gst import STATES, state_code_from_gstin, validate_gstin, normalize_gstin
from app.security import tenant_id

company_bp = Blueprint("company", __name__)

# API field (camelCase, as sent by the UI) -> database column.
TEXT_FIELDS = {
    "companyName": "company_name",
    "businessType": "business_type",
    "email": "email",
    "phone": "phone",
    "address": "address",
    "taxNumber": "tax_number",
    "website": "website",
    "logoUrl": "logo_url",
    "currency": "currency",
    "dateFormat": "date_format",
    "pan": "pan",
    "bankName": "bank_name",
    "bankAccountName": "bank_account_name",
    "bankAccountNo": "bank_account_no",
    "bankIfsc": "bank_ifsc",
    "bankBranch": "bank_branch",
    "upiId": "upi_id",
    "rfqPrefix": "rfq_prefix",
    "quotationPrefix": "quotation_prefix",
    "invoicePrefix": "invoice_prefix",
    "defaultQuotationTerms": "default_quotation_terms",
    "defaultQuotationNotes": "default_quotation_notes",
    "defaultInvoiceTerms": "default_invoice_terms",
    "defaultInvoiceNotes": "default_invoice_notes",
    "brandColor": "brand_color",
    "signatureUrl": "signature_url",
    "authorisedSignatory": "authorised_signatory",
}

BOOL_FIELDS = {"gstRegistered": "gst_registered", "roundOffEnabled": "round_off_enabled"}
INT_FIELDS = {
    "numberWidth": ("number_width", 2, 8),
    "quotationValidDays": ("quotation_valid_days", 1, 365),
    "invoiceDueDays": ("invoice_due_days", 0, 365),
}

SELECT_COLUMNS = (
    ["id", "gstin", "state_code"]
    + list(TEXT_FIELDS.values())
    + list(BOOL_FIELDS.values())
    + [column for column, _, _ in INT_FIELDS.values()]
)


@company_bp.route("/api/company", methods=["GET"])
def get_company():
    connection = get_db_connection()
    if connection is None:
        return jsonify({"message": "Database connection failed"}), 500

    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            f"SELECT {', '.join(SELECT_COLUMNS)} FROM company_settings WHERE tenant_id = %s LIMIT 1",
            (tenant_id(),),
        )
        company = cursor.fetchone()
        if not company:
            return jsonify({"message": "Company settings not found"}), 404

        company["state_name"] = STATES.get(company.get("state_code"))
        return jsonify(company), 200
    except Exception as error:
        print("GET COMPANY ERROR:", error)
        return jsonify({"message": "Unable to load company settings"}), 500
    finally:
        cursor.close()
        connection.close()


@company_bp.route("/api/company/states", methods=["GET"])
def list_states():
    return jsonify([{"code": code, "name": name} for code, name in sorted(STATES.items())]), 200


@company_bp.route("/api/company", methods=["PUT"])
def update_company():
    data = request.get_json()
    if not data:
        return jsonify({"message": "No company data received"}), 400

    updates = {}

    for field, column in TEXT_FIELDS.items():
        if field in data:
            updates[column] = str(data[field] or "").strip()

    for field, column in BOOL_FIELDS.items():
        if field in data:
            updates[column] = bool(data[field])

    for field, (column, low, high) in INT_FIELDS.items():
        if field in data:
            try:
                value = int(data[field])
            except (TypeError, ValueError):
                return jsonify({"message": f"{field} must be a whole number."}), 400
            if not low <= value <= high:
                return jsonify({"message": f"{field} must be between {low} and {high}."}), 400
            updates[column] = value

    if updates.get("company_name") == "":
        return jsonify({"message": "Company name is required."}), 400

    if "brand_color" in updates and not re.fullmatch(r"#[0-9a-fA-F]{6}", updates["brand_color"]):
        return jsonify({"message": "Brand colour must be a hex value such as #1f4e79."}), 400

    for column in ("rfq_prefix", "quotation_prefix", "invoice_prefix"):
        if column in updates and not re.fullmatch(r"[A-Za-z0-9/_-]{0,20}", updates[column]):
            return jsonify({"message": "Number prefixes may only use letters, digits, - _ /"}), 400

    if "pan" in updates:
        updates["pan"] = updates["pan"].upper()
        if updates["pan"] and not re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", updates["pan"]):
            return jsonify({"message": "PAN must look like ABCDE1234F."}), 400

    # GSTIN drives the seller state; a manual state can be given when unregistered.
    if "gstin" in data:
        gstin = normalize_gstin(data["gstin"])
        message = validate_gstin(gstin)
        if message:
            return jsonify({"message": message}), 400
        updates["gstin"] = gstin
        if gstin:
            updates["state_code"] = state_code_from_gstin(gstin)
            updates["gst_registered"] = True

    if "stateCode" in data and "state_code" not in updates:
        code = str(data["stateCode"] or "").strip() or None
        if code and code not in STATES:
            return jsonify({"message": "Choose a valid state."}), 400
        updates["state_code"] = code

    if updates.get("gst_registered") and not updates.get("state_code"):
        # A registered supplier must have a home state for CGST/SGST vs IGST.
        connection = get_db_connection()
        cursor = connection.cursor()
        try:
            cursor.execute("SELECT state_code FROM company_settings WHERE tenant_id = %s", (tenant_id(),))
            row = cursor.fetchone()
        finally:
            cursor.close()
            connection.close()
        if not row or not row[0]:
            return jsonify({"message": "Enter a GSTIN or choose your state to enable GST."}), 400

    if not updates:
        return jsonify({"message": "No valid company fields received."}), 400

    connection = get_db_connection()
    if connection is None:
        return jsonify({"message": "Database connection failed"}), 500

    cursor = connection.cursor()
    try:
        assignments = ", ".join(f"`{column}` = %s" for column in updates)
        cursor.execute(
            f"UPDATE company_settings SET {assignments} WHERE tenant_id = %s",
            (*updates.values(), tenant_id()),
        )
        connection.commit()
        return jsonify({"message": "Company settings updated successfully."}), 200
    except Exception as error:
        connection.rollback()
        print("UPDATE COMPANY ERROR:", error)
        return jsonify({"message": "Unable to update company settings"}), 500
    finally:
        cursor.close()
        connection.close()
