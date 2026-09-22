from flask import Blueprint, request, jsonify
from app.db import get_db_connection
from datetime import datetime, timedelta
from decimal import Decimal


quotations_bp = Blueprint("quotations", __name__)


# =========================================================
# DEFAULT QUOTATION CONTENT
# =========================================================

DEFAULT_TERMS = """1. This quotation is valid for 10 days from the quotation date.
2. Work or supply will be carried out according to the agreed scope and specifications.
3. Any additional work or requirement outside the agreed scope will be charged separately.
4. Delivery or work schedules will be mutually agreed with the customer.
5. Payment terms will be as mutually agreed between Rayaprocure and the customer.
6. Any changes to the scope, quantity, or specifications may require a revised quotation."""


DEFAULT_NOTES = """Please review the quoted scope, quantities, and specifications carefully before confirmation.
This quotation is subject to the availability of required materials and resources.
Any applicable taxes or statutory charges will be handled as per the agreed commercial terms."""


# =========================================================
# QUOTATION STATUSES
# =========================================================

ALLOWED_STATUSES = [
    "Draft",
    "Sent",
    "Accepted",
    "Rejected",
    "Expired"
]


# =========================================================
# HELPER - GENERATE QUOTATION NUMBER
# =========================================================

def generate_quotation_number(cursor):

    cursor.execute("""
        SELECT quotation_number
        FROM quotations
        WHERE quotation_number IS NOT NULL
        ORDER BY id DESC
        LIMIT 1
    """)

    result = cursor.fetchone()

    if not result or not result[0]:
        return "RPQ-00001"

    last_number = result[0]

    try:
        number = int(last_number.split("-")[-1])
        next_number = number + 1

        return f"RPQ-{next_number:05d}"

    except (ValueError, IndexError):
        return "RPQ-00001"


# =========================================================
# HELPER - GET QUOTATION ITEMS
# =========================================================

def get_quotation_items(cursor, quotation_id):

    cursor.execute("""
        SELECT
            id,
            quotation_id,
            description,
            quantity,
            unit,
            rate,
            amount
        FROM quotation_items
        WHERE quotation_id = %s
        ORDER BY id ASC
    """, (quotation_id,))

    return cursor.fetchall()


# =========================================================
# GET ALL QUOTATIONS
# =========================================================

@quotations_bp.route("/quotations", methods=["GET"])
def get_quotations():

    connection = get_db_connection()

    if not connection:
        return jsonify({
            "message": "Database connection failed."
        }), 500

    cursor = connection.cursor(dictionary=True)

    try:

        cursor.execute("""
            SELECT
                q.id,
                q.quotation_number,
                q.quotation_date,
                q.valid_until,
                q.rfq_id,
                r.rfq_number,
                r.customer_id,
                c.company_name,
                r.purpose,
                r.request_date,
                r.required_date,
                q.description,
                q.amount,
                q.subtotal,
                q.adjustment,
                q.grand_total,
                q.notes,
                q.terms_conditions,
                q.status
            FROM quotations q
            JOIN rfqs r
                ON q.rfq_id = r.id
            JOIN customers c
                ON r.customer_id = c.id
            ORDER BY q.id DESC
        """)

        quotations = cursor.fetchall()

        return jsonify(quotations), 200

    except Exception as error:

        print("Get quotations error:", error)

        return jsonify({
            "message": "Unable to load quotations."
        }), 500

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
        return jsonify({
            "message": "Database connection failed."
        }), 500

    cursor = connection.cursor(dictionary=True)

    try:

        # -------------------------------------------------
        # GET QUOTATION + RFQ + CUSTOMER
        # -------------------------------------------------

        cursor.execute("""
            SELECT
                q.id,
                q.quotation_number,
                q.quotation_date,
                q.valid_until,
                q.rfq_id,

                r.rfq_number,
                r.customer_id,
                r.purpose,
                r.request_date,
                r.required_date,

                c.company_name,

                q.description,
                q.amount,
                q.subtotal,
                q.adjustment,
                q.grand_total,
                q.notes,
                q.terms_conditions,
                q.status

            FROM quotations q

            JOIN rfqs r
                ON q.rfq_id = r.id

            JOIN customers c
                ON r.customer_id = c.id

            WHERE q.id = %s
        """, (quotation_id,))

        quotation = cursor.fetchone()

        if not quotation:

            return jsonify({
                "message": "Quotation not found."
            }), 404


        # -------------------------------------------------
        # GET CUSTOMER DETAILS SAFELY
        # -------------------------------------------------

        cursor.execute("""
            SELECT *
            FROM customers
            WHERE id = %s
        """, (quotation["customer_id"],))

        customer = cursor.fetchone()

        if customer:

            quotation["address"] = (
                customer.get("address")
                or customer.get("company_address")
                or ""
            )

            quotation["contact_person"] = (
                customer.get("contact_person")
                or customer.get("contact_name")
                or ""
            )

            quotation["phone"] = (
                customer.get("phone")
                or customer.get("contact")
                or customer.get("mobile")
                or ""
            )

            quotation["email"] = (
                customer.get("email")
                or customer.get("email_address")
                or ""
            )

        else:

            quotation["address"] = ""
            quotation["contact_person"] = ""
            quotation["phone"] = ""
            quotation["email"] = ""


        # -------------------------------------------------
        # GET QUOTATION ITEMS
        # -------------------------------------------------

        quotation["items"] = get_quotation_items(
            cursor,
            quotation_id
        )


        return jsonify(quotation), 200


    except Exception as error:

        print(
            "Get quotation error:",
            error
        )

        return jsonify({
            "message": "Unable to load quotation."
        }), 500


    finally:

        cursor.close()
        connection.close()


# =========================================================
# CREATE QUOTATION
# =========================================================

@quotations_bp.route("/quotations", methods=["POST"])
def create_quotation():

    data = request.get_json() or {}

    rfq_id = data.get("rfq_id")
    quotation_date = data.get("quotation_date")
    items = data.get("items", [])
    adjustment = data.get("adjustment", 0)
    notes = data.get("notes") or DEFAULT_NOTES
    terms_conditions = (
        data.get("terms_conditions")
        or DEFAULT_TERMS
    )
    status = data.get("status", "Draft")

    if status not in ALLOWED_STATUSES:
        return jsonify({
            "message": "Invalid quotation status."
        }), 400

    if not rfq_id:
        return jsonify({
            "message": "RFQ is required."
        }), 400

    if not items or not isinstance(items, list):
        return jsonify({
            "message": "At least one quotation item is required."
        }), 400

    # -----------------------------------------------------
    # DATE
    # -----------------------------------------------------

    if quotation_date:

        try:
            quotation_date_obj = datetime.strptime(
                quotation_date,
                "%Y-%m-%d"
            ).date()

        except ValueError:

            return jsonify({
                "message": "Invalid quotation date."
            }), 400

    else:

        quotation_date_obj = datetime.today().date()

    valid_until_obj = (
        quotation_date_obj + timedelta(days=10)
    )

    # -----------------------------------------------------
    # CALCULATE ITEMS
    # -----------------------------------------------------

    calculated_items = []
    subtotal = Decimal("0.00")

    for item in items:

        description = str(
            item.get("description", "")
        ).strip()

        unit = str(
            item.get("unit", "")
        ).strip()

        if not description:
            return jsonify({
                "message": "Each item must have a description."
            }), 400

        if not unit:
            return jsonify({
                "message": "Each item must have a unit."
            }), 400

        try:

            quantity = Decimal(
                str(item.get("quantity", 0))
            )

            rate = Decimal(
                str(item.get("rate", 0))
            )

        except Exception:

            return jsonify({
                "message": "Invalid quantity or rate."
            }), 400

        if quantity <= 0:
            return jsonify({
                "message": "Quantity must be greater than zero."
            }), 400

        if rate < 0:
            return jsonify({
                "message": "Rate cannot be negative."
            }), 400

        amount = (
            quantity * rate
        ).quantize(
            Decimal("0.01")
        )

        subtotal += amount

        calculated_items.append({
            "description": description,
            "quantity": quantity,
            "unit": unit,
            "rate": rate,
            "amount": amount
        })

    # -----------------------------------------------------
    # ADJUSTMENT
    # -----------------------------------------------------

    try:

        adjustment_decimal = Decimal(
            str(adjustment or 0)
        ).quantize(
            Decimal("0.01")
        )

    except Exception:

        return jsonify({
            "message": "Invalid adjustment amount."
        }), 400

    grand_total = (
        subtotal + adjustment_decimal
    ).quantize(
        Decimal("0.01")
    )

    # -----------------------------------------------------
    # CONNECTION
    # -----------------------------------------------------

    connection = get_db_connection()

    if not connection:
        return jsonify({
            "message": "Database connection failed."
        }), 500

    cursor = connection.cursor()

    try:

        # -------------------------------------------------
        # CHECK RFQ
        # -------------------------------------------------

        cursor.execute("""
            SELECT id
            FROM rfqs
            WHERE id = %s
        """, (rfq_id,))

        rfq = cursor.fetchone()

        if not rfq:

            return jsonify({
                "message": "RFQ not found."
            }), 404

        # -------------------------------------------------
        # GENERATE QUOTATION NUMBER
        # -------------------------------------------------

        quotation_number = generate_quotation_number(
            cursor
        )

        # -------------------------------------------------
        # OLD DESCRIPTION / AMOUNT
        #
        # Kept populated for compatibility with the
        # existing quotation table.
        # -------------------------------------------------

        first_description = calculated_items[0][
            "description"
        ]

        # -------------------------------------------------
        # INSERT QUOTATION
        # -------------------------------------------------

        cursor.execute("""
            INSERT INTO quotations (
                quotation_number,
                quotation_date,
                valid_until,
                rfq_id,
                description,
                amount,
                subtotal,
                adjustment,
                grand_total,
                notes,
                terms_conditions,
                status
            )
            VALUES (
                %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s
            )
        """, (
            quotation_number,
            quotation_date_obj,
            valid_until_obj,
            rfq_id,
            first_description,
            grand_total,
            subtotal,
            adjustment_decimal,
            grand_total,
            notes,
            terms_conditions,
            status
        ))

        quotation_id = cursor.lastrowid

        # -------------------------------------------------
        # INSERT ITEMS
        # -------------------------------------------------

        for item in calculated_items:

            cursor.execute("""
                INSERT INTO quotation_items (
                    quotation_id,
                    description,
                    quantity,
                    unit,
                    rate,
                    amount
                )
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                quotation_id,
                item["description"],
                item["quantity"],
                item["unit"],
                item["rate"],
                item["amount"]
            ))

        # -------------------------------------------------
        # MARK RFQ AS QUOTED
        # -------------------------------------------------

        cursor.execute("""
            UPDATE rfqs
            SET status = 'Quoted'
            WHERE id = %s
        """, (rfq_id,))

        connection.commit()

        return jsonify({
            "message": "Quotation created successfully.",
            "id": quotation_id,
            "quotation_number": quotation_number
        }), 201

    except Exception as error:

        connection.rollback()

        print(
            "Quotation create error:",
            error
        )

        return jsonify({
            "message": "Failed to create quotation."
        }), 500

    finally:

        cursor.close()
        connection.close()


# =========================================================
# UPDATE QUOTATION
# =========================================================

@quotations_bp.route(
    "/quotations/<int:quotation_id>",
    methods=["PUT"]
)
def update_quotation(quotation_id):

    data = request.get_json() or {}

    rfq_id = data.get("rfq_id")
    quotation_date = data.get("quotation_date")
    items = data.get("items", [])
    adjustment = data.get("adjustment", 0)
    notes = data.get("notes") or DEFAULT_NOTES
    terms_conditions = (
        data.get("terms_conditions")
        or DEFAULT_TERMS
    )
    status = data.get("status", "Draft")

    if status not in ALLOWED_STATUSES:

        return jsonify({
            "message": "Invalid quotation status."
        }), 400

    if not rfq_id:

        return jsonify({
            "message": "RFQ is required."
        }), 400

    if not items or not isinstance(items, list):

        return jsonify({
            "message": "At least one quotation item is required."
        }), 400

    # -----------------------------------------------------
    # DATE
    # -----------------------------------------------------

    if quotation_date:

        try:

            quotation_date_obj = datetime.strptime(
                quotation_date,
                "%Y-%m-%d"
            ).date()

        except ValueError:

            return jsonify({
                "message": "Invalid quotation date."
            }), 400

    else:

        quotation_date_obj = datetime.today().date()

    valid_until_obj = (
        quotation_date_obj + timedelta(days=10)
    )

    # -----------------------------------------------------
    # CALCULATE ITEMS
    # -----------------------------------------------------

    calculated_items = []
    subtotal = Decimal("0.00")

    for item in items:

        description = str(
            item.get("description", "")
        ).strip()

        unit = str(
            item.get("unit", "")
        ).strip()

        if not description:

            return jsonify({
                "message": "Each item must have a description."
            }), 400

        if not unit:

            return jsonify({
                "message": "Each item must have a unit."
            }), 400

        try:

            quantity = Decimal(
                str(item.get("quantity", 0))
            )

            rate = Decimal(
                str(item.get("rate", 0))
            )

        except Exception:

            return jsonify({
                "message": "Invalid quantity or rate."
            }), 400

        if quantity <= 0:

            return jsonify({
                "message": "Quantity must be greater than zero."
            }), 400

        if rate < 0:

            return jsonify({
                "message": "Rate cannot be negative."
            }), 400

        amount = (
            quantity * rate
        ).quantize(
            Decimal("0.01")
        )

        subtotal += amount

        calculated_items.append({
            "description": description,
            "quantity": quantity,
            "unit": unit,
            "rate": rate,
            "amount": amount
        })

    # -----------------------------------------------------
    # ADJUSTMENT
    # -----------------------------------------------------

    try:

        adjustment_decimal = Decimal(
            str(adjustment or 0)
        ).quantize(
            Decimal("0.01")
        )

    except Exception:

        return jsonify({
            "message": "Invalid adjustment amount."
        }), 400

    grand_total = (
        subtotal + adjustment_decimal
    ).quantize(
        Decimal("0.01")
    )

    connection = get_db_connection()

    if not connection:

        return jsonify({
            "message": "Database connection failed."
        }), 500

    cursor = connection.cursor()

    try:

        # -------------------------------------------------
        # CHECK QUOTATION
        # -------------------------------------------------

        cursor.execute("""
            SELECT id
            FROM quotations
            WHERE id = %s
        """, (quotation_id,))

        quotation = cursor.fetchone()

        if not quotation:

            return jsonify({
                "message": "Quotation not found."
            }), 404

        # -------------------------------------------------
        # CHECK RFQ
        # -------------------------------------------------

        cursor.execute("""
            SELECT id
            FROM rfqs
            WHERE id = %s
        """, (rfq_id,))

        rfq = cursor.fetchone()

        if not rfq:

            return jsonify({
                "message": "RFQ not found."
            }), 404

        first_description = calculated_items[0][
            "description"
        ]

        # -------------------------------------------------
        # UPDATE QUOTATION
        # -------------------------------------------------

        cursor.execute("""
            UPDATE quotations
            SET
                rfq_id = %s,
                quotation_date = %s,
                valid_until = %s,
                description = %s,
                amount = %s,
                subtotal = %s,
                adjustment = %s,
                grand_total = %s,
                notes = %s,
                terms_conditions = %s,
                status = %s
            WHERE id = %s
        """, (
            rfq_id,
            quotation_date_obj,
            valid_until_obj,
            first_description,
            grand_total,
            subtotal,
            adjustment_decimal,
            grand_total,
            notes,
            terms_conditions,
            status,
            quotation_id
        ))

        # -------------------------------------------------
        # REMOVE OLD ITEMS
        # -------------------------------------------------

        cursor.execute("""
            DELETE FROM quotation_items
            WHERE quotation_id = %s
        """, (quotation_id,))

        # -------------------------------------------------
        # INSERT UPDATED ITEMS
        # -------------------------------------------------

        for item in calculated_items:

            cursor.execute("""
                INSERT INTO quotation_items (
                    quotation_id,
                    description,
                    quantity,
                    unit,
                    rate,
                    amount
                )
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (
                quotation_id,
                item["description"],
                item["quantity"],
                item["unit"],
                item["rate"],
                item["amount"]
            ))

        # -------------------------------------------------
        # KEEP RFQ AS QUOTED
        # -------------------------------------------------

        cursor.execute("""
            UPDATE rfqs
            SET status = 'Quoted'
            WHERE id = %s
        """, (rfq_id,))

        connection.commit()

        return jsonify({
            "message": "Quotation updated successfully."
        }), 200

    except Exception as error:

        connection.rollback()

        print(
            "Quotation update error:",
            error
        )

        return jsonify({
            "message": "Failed to update quotation."
        }), 500

    finally:

        cursor.close()
        connection.close()


# =========================================================
# DELETE QUOTATION
# =========================================================

@quotations_bp.route(
    "/quotations/<int:quotation_id>",
    methods=["DELETE"]
)
def delete_quotation(quotation_id):

    connection = get_db_connection()

    if not connection:

        return jsonify({
            "message": "Database connection failed."
        }), 500

    cursor = connection.cursor()

    try:

        # quotation_items are automatically deleted because
        # the table has ON DELETE CASCADE.

        cursor.execute("""
            DELETE FROM quotations
            WHERE id = %s
        """, (quotation_id,))

        if cursor.rowcount == 0:

            return jsonify({
                "message": "Quotation not found."
            }), 404

        connection.commit()

        return jsonify({
            "message": "Quotation deleted successfully."
        }), 200

    except Exception as error:

        connection.rollback()

        print(
            "Quotation delete error:",
            error
        )

        return jsonify({
            "message": "Failed to delete quotation."
        }), 500

    finally:

        cursor.close()
        connection.close()