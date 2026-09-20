from flask import Blueprint, request
from app.db import get_db_connection

customers_bp = Blueprint("customers", __name__)


@customers_bp.route("/customers", methods=["GET"])
def get_customers():

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    cursor.execute("SELECT * FROM customers")

    customers = cursor.fetchall()

    cursor.close()
    connection.close()

    return customers, 200


@customers_bp.route("/customers", methods=["POST"])
def add_customer():

    data = request.get_json()

    company_name = data.get("company_name")
    contact_name = data.get("contact_name")
    phone = data.get("phone")
    email = data.get("email")

    connection = get_db_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        INSERT INTO customers
        (company_name, contact_name, phone, email)
        VALUES (%s, %s, %s, %s)
        """,
        (company_name, contact_name, phone, email)
    )

    connection.commit()

    cursor.close()
    connection.close()

    return {
        "message": "Customer added successfully"
    }, 201


@customers_bp.route("/customers/<int:id>", methods=["PUT"])
def update_customer(id):

    data = request.get_json()

    connection = get_db_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        UPDATE customers
        SET company_name = %s,
            contact_name = %s,
            phone = %s,
            email = %s
        WHERE id = %s
        """,
        (
            data.get("company_name"),
            data.get("contact_name"),
            data.get("phone"),
            data.get("email"),
            id
        )
    )

    connection.commit()

    cursor.close()
    connection.close()

    return {
        "message": "Customer updated successfully"
    }, 200


@customers_bp.route("/customers/<int:id>", methods=["DELETE"])
def delete_customer(id):

    connection = get_db_connection()
    cursor = connection.cursor()

    try:

        cursor.execute(
            "DELETE FROM customers WHERE id = %s",
            (id,)
        )

        connection.commit()

        return {
            "message": "Customer deleted successfully"
        }, 200

    except Exception as error:

        connection.rollback()

        if getattr(error, "errno", None) == 1451:
            return {
                "message": "This customer cannot be deleted because it is already used in existing RFQ records."
            }, 409

        return {
            "message": "Unable to delete customer."
        }, 500

    finally:

        cursor.close()
        connection.close()