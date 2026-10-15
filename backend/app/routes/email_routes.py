import re

from flask import Blueprint, jsonify, request, session

from app.audit import record_audit
from app.db import get_db_connection
from app.documents import load_company
from app.email_templates import document_email
from app.emailer import (
    ALLOWED_PORTS,
    EmailError,
    encrypt_secret,
    load_settings,
    send_and_log,
)
from app.security import require_roles, tenant_id
from app.shares import get_or_create_share, portal_url

email_bp = Blueprint("email", __name__)

EMAIL_PATTERN = re.compile(r"[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+")
MAX_PDF_BYTES = 8 * 1024 * 1024


def split_addresses(value):
    """Accept a list or a comma/semicolon separated string; return valid addresses."""
    if not value:
        return []
    if isinstance(value, str):
        value = re.split(r"[;,]", value)
    return [item.strip() for item in value if item and item.strip()]


def validate_addresses(addresses, label):
    for address in addresses:
        if not EMAIL_PATTERN.fullmatch(address):
            raise ValueError(f"'{address}' is not a valid {label} email address.")


# ---------------------------------------------------------------------------
# SMTP settings (Owner only)
# ---------------------------------------------------------------------------
@email_bp.route("/api/email/settings", methods=["GET"])
@require_roles("Owner")
def get_email_settings():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM tenant_email_settings WHERE tenant_id = %s", (tenant_id(),))
        row = cursor.fetchone() or {}
        return jsonify({
            "smtpHost": row.get("smtp_host", ""),
            "smtpPort": row.get("smtp_port", 587),
            "smtpUser": row.get("smtp_user", ""),
            "hasPassword": bool(row.get("smtp_password_enc")),
            "security": row.get("security", "starttls"),
            "fromEmail": row.get("from_email", ""),
            "fromName": row.get("from_name", ""),
            "replyTo": row.get("reply_to", ""),
            "signature": row.get("signature") or "",
            "lastTestStatus": row.get("last_test_status"),
            "lastTestAt": row.get("last_test_at"),
        }), 200
    finally:
        cursor.close()
        connection.close()


@email_bp.route("/api/email/settings", methods=["PUT"])
@require_roles("Owner")
def save_email_settings():
    data = request.get_json() or {}
    host = str(data.get("smtpHost") or "").strip()
    from_email = str(data.get("fromEmail") or "").strip()
    security = str(data.get("security") or "starttls").lower()

    if not host or not from_email:
        return jsonify({"message": "SMTP host and the From email address are required."}), 400
    if not EMAIL_PATTERN.fullmatch(from_email):
        return jsonify({"message": "Enter a valid From email address."}), 400
    if security not in {"starttls", "ssl", "none"}:
        return jsonify({"message": "Security must be STARTTLS, SSL or none."}), 400
    try:
        port = int(data.get("smtpPort") or 587)
    except (TypeError, ValueError):
        return jsonify({"message": "SMTP port must be a number."}), 400
    if port not in ALLOWED_PORTS:
        return jsonify({"message": "SMTP port must be one of 25, 465, 587 or 2525."}), 400
    reply_to = str(data.get("replyTo") or "").strip()
    if reply_to and not EMAIL_PATTERN.fullmatch(reply_to):
        return jsonify({"message": "Enter a valid reply-to email address."}), 400

    password = data.get("smtpPassword")
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """INSERT INTO tenant_email_settings
               (tenant_id, smtp_host, smtp_port, smtp_user, security, from_email,
                from_name, reply_to, signature)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON DUPLICATE KEY UPDATE
                 smtp_host = VALUES(smtp_host), smtp_port = VALUES(smtp_port),
                 smtp_user = VALUES(smtp_user), security = VALUES(security),
                 from_email = VALUES(from_email), from_name = VALUES(from_name),
                 reply_to = VALUES(reply_to), signature = VALUES(signature),
                 last_test_status = NULL, last_test_at = NULL""",
            (tenant_id(), host, port, str(data.get("smtpUser") or "").strip(), security,
             from_email, str(data.get("fromName") or "").strip(), reply_to,
             str(data.get("signature") or "").strip() or None),
        )
        # Only touch the stored password when a new one is supplied.
        if password:
            cursor.execute(
                "UPDATE tenant_email_settings SET smtp_password_enc = %s WHERE tenant_id = %s",
                (encrypt_secret(password), tenant_id()),
            )
        record_audit(cursor, "Updated", "EmailSettings", None, {"host": host})
        connection.commit()
        return jsonify({"message": "Email settings saved."}), 200
    except EmailError as error:
        connection.rollback()
        return jsonify({"message": str(error)}), 500
    except Exception as error:
        connection.rollback()
        print("Save email settings error:", error)
        return jsonify({"message": "Unable to save email settings."}), 500
    finally:
        cursor.close()
        connection.close()


@email_bp.route("/api/email/test", methods=["POST"])
@require_roles("Owner")
def send_test_email():
    data = request.get_json() or {}
    recipient = str(data.get("to") or "").strip()
    if not recipient or not EMAIL_PATTERN.fullmatch(recipient):
        return jsonify({"message": "Enter the address to send the test email to."}), 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        settings = load_settings(cursor, tenant_id())
        company = load_company(cursor, tenant_id())
        name = company.get("company_name") or "your company"
        try:
            send_and_log(
                cursor, tenant_id(), settings, "Test", None, None, [recipient],
                f"Test email from {name}",
                f"<p>This is a test email from <strong>{name}</strong>. Your SMTP settings work.</p>",
                "This is a test email. Your SMTP settings work.",
                sent_by=session["user"]["id"],
            )
            status = "OK"
            outcome = ({"message": f"Test email sent to {recipient}."}, 200)
        except EmailError as error:
            status = "Failed"
            outcome = ({"message": str(error)}, 502)

        if not settings.get("platform"):
            cursor.execute(
                "UPDATE tenant_email_settings SET last_test_status = %s, last_test_at = NOW() WHERE tenant_id = %s",
                (status, tenant_id()),
            )
        connection.commit()
        return jsonify(outcome[0]), outcome[1]
    except EmailError as error:
        return jsonify({"message": str(error)}), 400
    finally:
        cursor.close()
        connection.close()


# ---------------------------------------------------------------------------
# Send a quotation / invoice
# ---------------------------------------------------------------------------
def load_document_for_email(cursor, entity_type, entity_id):
    if entity_type == "quotation":
        cursor.execute("""
            SELECT q.id, q.quotation_number, q.quotation_date, q.valid_until, q.grand_total,
                   q.status, c.email AS customer_email, c.company_name
            FROM quotations q
            JOIN rfqs r ON q.rfq_id = r.id
            JOIN customers c ON r.customer_id = c.id
            WHERE q.id = %s AND q.tenant_id = %s
        """, (entity_id, tenant_id()))
    else:
        cursor.execute("""
            SELECT invoices.id, invoices.invoice_number, invoices.invoice_date, invoices.due_date,
                   invoices.grand_total, invoices.status, c.email AS customer_email, c.company_name
            FROM invoices
            JOIN jobs ON invoices.job_id = jobs.id
            JOIN quotations q ON jobs.quotation_id = q.id
            JOIN rfqs r ON q.rfq_id = r.id
            JOIN customers c ON r.customer_id = c.id
            WHERE invoices.id = %s AND invoices.tenant_id = %s
        """, (entity_id, tenant_id()))
    return cursor.fetchone()


@email_bp.route("/api/email/send", methods=["POST"])
def send_document():
    # The UI posts multipart form data so it can attach the PDF it just rendered.
    data = request.form if request.form else (request.get_json(silent=True) or {})
    entity_type = data.get("entity_type")
    if entity_type not in {"quotation", "invoice"}:
        return jsonify({"message": "Only quotations and invoices can be emailed."}), 400
    try:
        entity_id = int(data.get("entity_id"))
    except (TypeError, ValueError):
        return jsonify({"message": "Document is required."}), 400

    role = session["user"]["role"]
    if entity_type == "quotation" and role not in {"Owner", "Operations"}:
        return jsonify({"message": "You do not have permission to email quotations."}), 403
    if entity_type == "invoice" and role not in {"Owner", "Accounts"}:
        return jsonify({"message": "You do not have permission to email invoices."}), 403

    pdf = request.files.get("pdf")
    attachments = []
    if pdf:
        content = pdf.read()
        if len(content) > MAX_PDF_BYTES:
            return jsonify({"message": "The PDF is too large to email (limit 8 MB)."}), 400
        if not content.startswith(b"%PDF"):
            return jsonify({"message": "The attachment must be a PDF file."}), 400
        filename = re.sub(r"[^A-Za-z0-9._-]", "_", pdf.filename or f"{entity_type}.pdf")
        attachments.append((filename, content, "application/pdf"))

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        document = load_document_for_email(cursor, entity_type, entity_id)
        if not document:
            return jsonify({"message": "Document not found."}), 404

        recipients = split_addresses(data.get("to")) or split_addresses(document.get("customer_email"))
        cc = split_addresses(data.get("cc"))
        try:
            if not recipients:
                raise ValueError("The customer has no email address. Enter one to send to.")
            validate_addresses(recipients, "recipient")
            validate_addresses(cc, "CC")
        except ValueError as error:
            return jsonify({"message": str(error)}), 400

        settings = load_settings(cursor, tenant_id())
        company = load_company(cursor, tenant_id())
        token = get_or_create_share(cursor, tenant_id(), entity_type, entity_id)
        subject, html, text = document_email(
            company, entity_type, document, portal_url(token),
            message=str(data.get("message") or ""), signature=settings.get("signature") or "",
        )
        subject = str(data.get("subject") or "").strip() or subject

        try:
            send_and_log(
                cursor, tenant_id(), settings, "Document", entity_type, entity_id,
                recipients, subject, html, text, cc, attachments, session["user"]["id"],
            )
        except EmailError as error:
            connection.commit()  # keep the failed-attempt log
            return jsonify({"message": str(error)}), 502

        if entity_type == "quotation":
            cursor.execute(
                """UPDATE quotations SET sent_at = NOW(),
                       status = IF(status = 'Draft', 'Sent', status)
                   WHERE id = %s AND tenant_id = %s""",
                (entity_id, tenant_id()),
            )
        else:
            cursor.execute(
                "UPDATE invoices SET sent_at = NOW() WHERE id = %s AND tenant_id = %s",
                (entity_id, tenant_id()),
            )
        record_audit(cursor, "Emailed", entity_type.title(), entity_id, {"to": recipients})
        connection.commit()
        return jsonify({"message": f"Sent to {', '.join(recipients)}.", "portalUrl": portal_url(token)}), 200
    except EmailError as error:
        connection.rollback()
        return jsonify({"message": str(error)}), 400
    except Exception as error:
        connection.rollback()
        print("Send document error:", error)
        return jsonify({"message": "Unable to send the email."}), 500
    finally:
        cursor.close()
        connection.close()


@email_bp.route("/api/email/logs/<entity_type>/<int:entity_id>", methods=["GET"])
def email_history(entity_type, entity_id):
    if entity_type not in {"quotation", "invoice"}:
        return jsonify([]), 200
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT id, kind, to_email, subject, status, error, created_at
               FROM email_logs
               WHERE tenant_id = %s AND entity_type = %s AND entity_id = %s
               ORDER BY id DESC LIMIT 20""",
            (tenant_id(), entity_type, entity_id),
        )
        return jsonify(cursor.fetchall()), 200
    finally:
        cursor.close()
        connection.close()


@email_bp.route("/api/email/share-link", methods=["POST"])
def share_link():
    """Return (creating if needed) the customer portal link for a document."""
    data = request.get_json() or {}
    entity_type = data.get("entity_type")
    if entity_type not in {"quotation", "invoice"}:
        return jsonify({"message": "Only quotations and invoices can be shared."}), 400
    try:
        entity_id = int(data.get("entity_id"))
    except (TypeError, ValueError):
        return jsonify({"message": "Document is required."}), 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        if not load_document_for_email(cursor, entity_type, entity_id):
            return jsonify({"message": "Document not found."}), 404
        token = get_or_create_share(cursor, tenant_id(), entity_type, entity_id)
        connection.commit()
        return jsonify({"url": portal_url(token)}), 200
    finally:
        cursor.close()
        connection.close()
