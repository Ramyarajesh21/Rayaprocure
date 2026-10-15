from flask import Blueprint, jsonify, request

from app.db import get_db_connection
from app.reminders import parse_days, run_for_tenant
from app.security import require_roles, tenant_id

reminders_bp = Blueprint("reminders", __name__)

DAY_FIELDS = {
    "invoiceBeforeDueDays": ("invoice_before_due_days", "before-due days"),
    "invoiceOverdueDays": ("invoice_overdue_days", "overdue days"),
    "quoteFollowupDays": ("quote_followup_days", "follow-up days"),
    "quoteExpiryNoticeDays": ("quote_expiry_notice_days", "expiry notice days"),
}


@reminders_bp.route("/api/reminders/settings", methods=["GET"])
def get_reminder_settings():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM reminder_settings WHERE tenant_id = %s", (tenant_id(),))
        row = cursor.fetchone()
        if not row:
            cursor.execute("INSERT INTO reminder_settings (tenant_id) VALUES (%s)", (tenant_id(),))
            connection.commit()
            cursor.execute("SELECT * FROM reminder_settings WHERE tenant_id = %s", (tenant_id(),))
            row = cursor.fetchone()
        return jsonify({
            "enabled": bool(row["enabled"]),
            "invoiceBeforeDueDays": row["invoice_before_due_days"],
            "invoiceOverdueDays": row["invoice_overdue_days"],
            "quoteFollowupDays": row["quote_followup_days"],
            "quoteExpiryNoticeDays": row["quote_expiry_notice_days"],
            "copyOwner": bool(row["copy_owner"]),
        }), 200
    finally:
        cursor.close()
        connection.close()


@reminders_bp.route("/api/reminders/settings", methods=["PUT"])
@require_roles("Owner")
def save_reminder_settings():
    data = request.get_json() or {}
    values = {}
    for field, (column, label) in DAY_FIELDS.items():
        raw = str(data.get(field, "")).strip()
        if raw and not all(part.strip().isdigit() for part in raw.replace(";", ",").split(",") if part.strip()):
            return jsonify({"message": f"Enter {label} as numbers separated by commas, e.g. 1, 7, 14."}), 400
        values[column] = ",".join(str(day) for day in parse_days(raw, [])) if raw else ""
    if not values["invoice_overdue_days"] and not values["invoice_before_due_days"]:
        return jsonify({"message": "Add at least one invoice reminder day."}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """INSERT INTO reminder_settings
               (tenant_id, enabled, invoice_before_due_days, invoice_overdue_days,
                quote_followup_days, quote_expiry_notice_days, copy_owner)
               VALUES (%s, %s, %s, %s, %s, %s, %s)
               ON DUPLICATE KEY UPDATE enabled = VALUES(enabled),
                 invoice_before_due_days = VALUES(invoice_before_due_days),
                 invoice_overdue_days = VALUES(invoice_overdue_days),
                 quote_followup_days = VALUES(quote_followup_days),
                 quote_expiry_notice_days = VALUES(quote_expiry_notice_days),
                 copy_owner = VALUES(copy_owner)""",
            (tenant_id(), bool(data.get("enabled")), values["invoice_before_due_days"],
             values["invoice_overdue_days"], values["quote_followup_days"],
             values["quote_expiry_notice_days"], bool(data.get("copyOwner", True))),
        )
        connection.commit()
        return jsonify({"message": "Reminder settings saved."}), 200
    except Exception as error:
        connection.rollback()
        print("Save reminder settings error:", error)
        return jsonify({"message": "Unable to save reminder settings."}), 500
    finally:
        cursor.close()
        connection.close()


@reminders_bp.route("/api/reminders/run", methods=["POST"])
@require_roles("Owner")
def run_now():
    """Run this company's reminders immediately (also useful for testing)."""
    connection = get_db_connection()
    try:
        summary = run_for_tenant(connection, tenant_id())
        return jsonify(summary), 200
    except Exception as error:
        connection.rollback()
        print("Manual reminder run error:", error)
        return jsonify({"message": "Unable to run reminders."}), 500
    finally:
        connection.close()


@reminders_bp.route("/api/reminders/logs", methods=["GET"])
def reminder_logs():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT l.id, l.entity_type, l.entity_id, l.stage, l.status, l.detail, l.created_at,
                      COALESCE(i.invoice_number, q.quotation_number) AS number
               FROM reminder_logs l
               LEFT JOIN invoices i ON l.entity_type = 'invoice' AND i.id = l.entity_id
               LEFT JOIN quotations q ON l.entity_type = 'quotation' AND q.id = l.entity_id
               WHERE l.tenant_id = %s
               ORDER BY l.id DESC LIMIT 100""",
            (tenant_id(),),
        )
        return jsonify(cursor.fetchall()), 200
    finally:
        cursor.close()
        connection.close()
