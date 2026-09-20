from flask import Blueprint, request, jsonify
from app.db import get_db_connection

company_bp = Blueprint("company", __name__)


@company_bp.route("/api/company", methods=["GET"])
def get_company():

    connection = get_db_connection()

    if connection is None:
        return jsonify({
            "message": "Database connection failed"
        }), 500

    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                id,
                company_name,
                business_type,
                email,
                phone,
                address,
                currency,
                date_format
            FROM company_settings
            ORDER BY id ASC
            LIMIT 1
        """)

        company = cursor.fetchone()

        if not company:
            return jsonify({
                "message": "Company settings not found"
            }), 404

        return jsonify(company), 200

    except Exception as e:

        print("GET COMPANY ERROR:", e)

        return jsonify({
            "message": "Unable to load company settings"
        }), 500

    finally:
        cursor.close()
        connection.close()


@company_bp.route("/api/company", methods=["PUT"])
def update_company():

    data = request.get_json()

    if not data:
        return jsonify({
            "message": "No company data received"
        }), 400

    connection = get_db_connection()

    if connection is None:
        return jsonify({
            "message": "Database connection failed"
        }), 500

    cursor = connection.cursor()

    try:
        cursor.execute("""
            UPDATE company_settings
            SET
                company_name = %s,
                business_type = %s,
                email = %s,
                phone = %s,
                address = %s,
                currency = %s,
                date_format = %s
            WHERE id = (
                SELECT id FROM (
                    SELECT id
                    FROM company_settings
                    ORDER BY id ASC
                    LIMIT 1
                ) AS temp
            )
        """, (
            data.get("companyName", ""),
            data.get("businessType", ""),
            data.get("email", ""),
            data.get("phone", ""),
            data.get("address", ""),
            data.get("currency", "INR"),
            data.get("dateFormat", "DD/MM/YYYY")
        ))

        connection.commit()

        return jsonify({
            "message": "Company settings updated successfully."
        }), 200

    except Exception as e:

        connection.rollback()

        print("UPDATE COMPANY ERROR:", e)

        return jsonify({
            "message": "Unable to update company settings"
        }), 500

    finally:
        cursor.close()
        connection.close()