import re

from flask import Blueprint, jsonify, request

from app.db import get_db_connection
from app.gst import STATES, normalize_gstin, state_code_from_gstin, validate_gstin
from app.security import tenant_id

customers_bp = Blueprint("customers", __name__)

COLUMNS = (
    "id, company_name, contact_name, phone, email, gstin, pan, state_code, "
    "billing_address, shipping_address, payment_terms_days, created_at"
)


def parse_customer(data):
    """Validate and normalise a customer payload. Raises ValueError on bad input."""
    company_name = str(data.get("company_name") or "").strip()
    if not company_name:
        raise ValueError("Company name is required.")

    email = str(data.get("email") or "").strip()
    if email and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email):
        raise ValueError("Enter a valid email address.")

    gstin = normalize_gstin(data.get("gstin"))
    message = validate_gstin(gstin)
    if message:
        raise ValueError(message)

    pan = str(data.get("pan") or "").strip().upper()
    if pan and not re.fullmatch(r"[A-Z]{5}[0-9]{4}[A-Z]", pan):
        raise ValueError("PAN must look like ABCDE1234F.")

    state_code = str(data.get("state_code") or "").strip() or state_code_from_gstin(gstin)
    if state_code and state_code not in STATES:
        raise ValueError("Choose a valid state.")

    terms = data.get("payment_terms_days")
    if terms in (None, ""):
        terms = None
    else:
        try:
            terms = int(terms)
        except (TypeError, ValueError):
            raise ValueError("Payment terms must be a whole number of days.")
        if not 0 <= terms <= 365:
            raise ValueError("Payment terms must be between 0 and 365 days.")

    return {
        "company_name": company_name,
        "contact_name": str(data.get("contact_name") or "").strip(),
        "phone": str(data.get("phone") or "").strip(),
        "email": email,
        "gstin": gstin,
        "pan": pan,
        "state_code": state_code,
        "billing_address": str(data.get("billing_address") or "").strip() or None,
        "shipping_address": str(data.get("shipping_address") or "").strip() or None,
        "payment_terms_days": terms,
    }


@customers_bp.route("/customers", methods=["GET"])
def get_customers():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            f"SELECT {COLUMNS} FROM customers WHERE tenant_id = %s ORDER BY company_name ASC",
            (tenant_id(),),
        )
        return jsonify(cursor.fetchall()), 200
    finally:
        cursor.close()
        connection.close()


@customers_bp.route("/customers", methods=["POST"])
def add_customer():
    try:
        customer = parse_customer(request.get_json() or {})
    except ValueError as error:
        return jsonify({"message": str(error)}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO customers
            (tenant_id, company_name, contact_name, phone, email, gstin, pan,
             state_code, billing_address, shipping_address, payment_terms_days)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (tenant_id(), *customer.values()),
        )
        connection.commit()
        return jsonify({"message": "Customer added successfully", "id": cursor.lastrowid}), 201
    except Exception as error:
        connection.rollback()
        print("Add customer error:", error)
        return jsonify({"message": "Unable to add customer."}), 500
    finally:
        cursor.close()
        connection.close()


@customers_bp.route("/customers/<int:id>", methods=["PUT"])
def update_customer(id):
    try:
        customer = parse_customer(request.get_json() or {})
    except ValueError as error:
        return jsonify({"message": str(error)}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            UPDATE customers
            SET company_name = %s, contact_name = %s, phone = %s, email = %s,
                gstin = %s, pan = %s, state_code = %s, billing_address = %s,
                shipping_address = %s, payment_terms_days = %s
            WHERE id = %s AND tenant_id = %s
            """,
            (*customer.values(), id, tenant_id()),
        )
        connection.commit()
        if cursor.rowcount == 0:
            cursor.execute("SELECT 1 FROM customers WHERE id = %s AND tenant_id = %s", (id, tenant_id()))
            if not cursor.fetchone():
                return jsonify({"message": "Customer not found."}), 404
        return jsonify({"message": "Customer updated successfully"}), 200
    except Exception as error:
        connection.rollback()
        print("Update customer error:", error)
        return jsonify({"message": "Unable to update customer."}), 500
    finally:
        cursor.close()
        connection.close()


@customers_bp.route("/customers/<int:id>", methods=["DELETE"])
def delete_customer(id):
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            "DELETE FROM customers WHERE id = %s AND tenant_id = %s",
            (id, tenant_id()),
        )
        connection.commit()
        if cursor.rowcount == 0:
            return jsonify({"message": "Customer not found."}), 404
        return jsonify({"message": "Customer deleted successfully"}), 200
    except Exception as error:
        connection.rollback()
        if getattr(error, "errno", None) == 1451:
            return jsonify({
                "message": "This customer cannot be deleted because it is already used in existing RFQ records."
            }), 409
        return jsonify({"message": "Unable to delete customer."}), 500
    finally:
        cursor.close()
        connection.close()
