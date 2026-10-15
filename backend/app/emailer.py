"""Outbound email over SMTP, per tenant.

Each company can configure its own SMTP account (so mail comes from their own
address and lands in their own Sent folder).  If a tenant has not configured
one, the platform-wide ``PLATFORM_SMTP_*`` settings are used when present.
"""

import base64
import hashlib
import ipaddress
import os
import smtplib
import socket
import ssl
from email.message import EmailMessage
from email.utils import formataddr, make_msgid

from cryptography.fernet import Fernet, InvalidToken

ALLOWED_PORTS = {25, 465, 587, 2525}
DAILY_LIMIT = int(os.getenv("EMAIL_DAILY_LIMIT", "300"))


class EmailError(Exception):
    """Raised with a message that is safe to show to the user."""


# ---------------------------------------------------------------------------
# Secret storage
# ---------------------------------------------------------------------------
def _fernet():
    secret = os.getenv("SECRET_KEY", "")
    if not secret:
        raise EmailError("SECRET_KEY is not configured.")
    key = base64.urlsafe_b64encode(hashlib.sha256(f"smtp:{secret}".encode()).digest())
    return Fernet(key)


def encrypt_secret(value):
    return _fernet().encrypt(value.encode()).decode() if value else None


def decrypt_secret(value):
    if not value:
        return ""
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        raise EmailError("Saved SMTP password can no longer be read. Please enter it again.")


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------
def platform_settings():
    host = os.getenv("PLATFORM_SMTP_HOST", "").strip()
    if not host:
        return None
    return {
        "smtp_host": host,
        "smtp_port": int(os.getenv("PLATFORM_SMTP_PORT", "587")),
        "smtp_user": os.getenv("PLATFORM_SMTP_USER", ""),
        "password": os.getenv("PLATFORM_SMTP_PASSWORD", ""),
        "security": os.getenv("PLATFORM_SMTP_SECURITY", "starttls"),
        "from_email": os.getenv("PLATFORM_SMTP_FROM", os.getenv("PLATFORM_SMTP_USER", "")),
        "from_name": "",
        "reply_to": "",
        "signature": "",
        "platform": True,
    }


def load_settings(cursor, tenant_id):
    """Return the SMTP settings to use for a tenant (dictionary cursor)."""
    cursor.execute("SELECT * FROM tenant_email_settings WHERE tenant_id = %s", (tenant_id,))
    row = cursor.fetchone()
    if row and row["smtp_host"] and row["from_email"]:
        row["password"] = decrypt_secret(row["smtp_password_enc"])
        row["platform"] = False
        return row
    fallback = platform_settings()
    if fallback:
        return fallback
    raise EmailError("Email is not set up yet. Add your SMTP details in Settings > Email.")


def assert_safe_host(host, port):
    """Stop tenants from using the server to probe internal services."""
    if port not in ALLOWED_PORTS:
        raise EmailError("SMTP port must be one of 25, 465, 587 or 2525.")
    if os.getenv("ALLOW_PRIVATE_SMTP") == "1":
        return
    try:
        addresses = {info[4][0] for info in socket.getaddrinfo(host, port, proto=socket.IPPROTO_TCP)}
    except socket.gaierror:
        raise EmailError(f"Could not find the SMTP server '{host}'.")
    for address in addresses:
        ip = ipaddress.ip_address(address)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise EmailError("SMTP host must be a public mail server.")


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------
def _connect(settings):
    host, port = settings["smtp_host"], int(settings["smtp_port"])
    assert_safe_host(host, port)
    context = ssl.create_default_context()
    security = (settings.get("security") or "starttls").lower()

    if security == "ssl":
        server = smtplib.SMTP_SSL(host, port, timeout=20, context=context)
    else:
        server = smtplib.SMTP(host, port, timeout=20)
        server.ehlo()
        if security == "starttls":
            server.starttls(context=context)
            server.ehlo()
    if settings.get("smtp_user"):
        server.login(settings["smtp_user"], settings.get("password", ""))
    return server


def build_message(settings, to, subject, html, text=None, cc=None, attachments=None, reply_to=None):
    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr((settings.get("from_name") or "", settings["from_email"]))
    message["To"] = ", ".join(to)
    if cc:
        message["Cc"] = ", ".join(cc)
    reply = reply_to or settings.get("reply_to")
    if reply:
        message["Reply-To"] = reply
    message["Message-ID"] = make_msgid(domain=settings["from_email"].split("@")[-1] or None)
    message.set_content(text or "Please view this message in an HTML-capable email client.")
    message.add_alternative(html, subtype="html")
    for name, content, mime in attachments or []:
        maintype, _, subtype = (mime or "application/octet-stream").partition("/")
        message.add_attachment(content, maintype=maintype, subtype=subtype or "octet-stream", filename=name)
    return message


def deliver(settings, to, subject, html, text=None, cc=None, attachments=None, reply_to=None):
    """Send one message. Raises EmailError with a readable reason on failure."""
    to = [address.strip() for address in to if address and address.strip()]
    cc = [address.strip() for address in (cc or []) if address and address.strip()]
    if not to:
        raise EmailError("Recipient email address is missing.")

    message = build_message(settings, to, subject, html, text, cc, attachments, reply_to)
    try:
        server = _connect(settings)
        try:
            server.send_message(message, to_addrs=to + cc)
        finally:
            try:
                server.quit()
            except Exception:
                pass
    except EmailError:
        raise
    except smtplib.SMTPAuthenticationError:
        raise EmailError("The SMTP server rejected the username or password.")
    except smtplib.SMTPRecipientsRefused:
        raise EmailError("The recipient address was refused by the mail server.")
    except (smtplib.SMTPException, OSError) as error:
        raise EmailError(f"Could not send the email: {error}")


def sent_today(cursor, tenant_id):
    cursor.execute(
        """SELECT COUNT(*) AS n FROM email_logs
           WHERE tenant_id = %s AND status = 'Sent' AND created_at >= CURDATE()""",
        (tenant_id,),
    )
    row = cursor.fetchone()
    return row["n"] if isinstance(row, dict) else row[0]


def log_email(cursor, tenant_id, kind, entity_type, entity_id, to_email, subject, status, error=None, sent_by=None):
    cursor.execute(
        """INSERT INTO email_logs
           (tenant_id, kind, entity_type, entity_id, to_email, subject, status, error, sent_by)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (tenant_id, kind, entity_type, entity_id, to_email[:255], subject[:255], status,
         (error or None) and error[:500], sent_by),
    )


def send_and_log(cursor, tenant_id, settings, kind, entity_type, entity_id, to, subject, html,
                 text=None, cc=None, attachments=None, sent_by=None):
    """Enforce the daily cap, deliver, and record the outcome."""
    if sent_today(cursor, tenant_id) >= DAILY_LIMIT:
        raise EmailError("Daily email limit reached. Try again tomorrow.")
    try:
        deliver(settings, to, subject, html, text, cc, attachments)
    except EmailError as error:
        log_email(cursor, tenant_id, kind, entity_type, entity_id, ", ".join(to), subject, "Failed", str(error), sent_by)
        raise
    log_email(cursor, tenant_id, kind, entity_type, entity_id, ", ".join(to), subject, "Sent", None, sent_by)
