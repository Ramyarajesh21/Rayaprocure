"""Automatic payment and quotation reminders.

Safe to run as often as you like (hourly, daily, or by hand):

* every reminder *stage* is claimed in ``reminder_logs`` behind a unique key, so
  the same reminder is never sent twice, even with several workers;
* if the job was down for a few days it sends ONE catch-up email for the most
  relevant missed stage instead of a burst;
* quotations past their validity date are marked Expired.
"""

from datetime import date

from app.documents import get_invoice_detail, get_quotation_detail, load_company
from app.email_templates import reminder_email
from app.emailer import EmailError, load_settings, send_and_log
from app.notifications import create_notification
from app.shares import get_or_create_share, portal_url


def parse_days(text, default):
    """'1, 7,14' -> [1, 7, 14]; ignores junk."""
    values = set()
    for part in str(text or "").replace(";", ",").split(","):
        part = part.strip()
        if part.isdigit() and 0 <= int(part) <= 365:
            values.add(int(part))
    return sorted(values) or list(default)


def claim_stages(cursor, tenant_id, entity_type, entity_id, stages):
    """Insert a claim row per stage; return the stages that were newly claimed."""
    claimed = []
    for stage in stages:
        cursor.execute(
            """INSERT IGNORE INTO reminder_logs (tenant_id, entity_type, entity_id, stage, status)
               VALUES (%s, %s, %s, %s, 'Pending')""",
            (tenant_id, entity_type, entity_id, stage),
        )
        if cursor.rowcount:
            claimed.append(stage)
    return claimed


def finish_stage(cursor, tenant_id, entity_type, entity_id, stage, status, detail=None):
    if status == "Failed":
        # Release the claim so the next run retries.
        cursor.execute(
            "DELETE FROM reminder_logs WHERE tenant_id = %s AND entity_type = %s AND entity_id = %s AND stage = %s",
            (tenant_id, entity_type, entity_id, stage),
        )
        return
    cursor.execute(
        """UPDATE reminder_logs SET status = %s, detail = %s
           WHERE tenant_id = %s AND entity_type = %s AND entity_id = %s AND stage = %s""",
        (status, (detail or "")[:255] or None, tenant_id, entity_type, entity_id, stage),
    )


def owner_emails(cursor, tenant_id, company):
    cursor.execute(
        "SELECT email FROM users WHERE tenant_id = %s AND role = 'Owner' AND is_active = TRUE AND email IS NOT NULL",
        (tenant_id,),
    )
    emails = {row["email"] for row in cursor.fetchall() if row["email"]}
    if company.get("email"):
        emails.add(company["email"])
    return sorted(emails)


def send_reminder(cursor, tenant_id, settings, company, kind, entity_type, entity_id,
                  document, recipient, cc, days):
    token = get_or_create_share(cursor, tenant_id, entity_type, entity_id)
    subject, html, text = reminder_email(company, kind, document, portal_url(token), days)
    send_and_log(
        cursor, tenant_id, settings, "Reminder", entity_type, entity_id,
        [recipient], subject, html, text, cc,
    )


def process_entity(cursor, tenant_id, settings, company, cc, kind, entity_type, entity_id,
                   document, stage_keys, chosen_stage, days, summary):
    """Claim stages, send one email for ``chosen_stage`` and record the outcome."""
    claimed = claim_stages(cursor, tenant_id, entity_type, entity_id, stage_keys)
    if not claimed or chosen_stage not in claimed:
        # Older/other stages that were claimed but not chosen are skipped.
        for stage in claimed:
            finish_stage(cursor, tenant_id, entity_type, entity_id, stage, "Skipped", "superseded")
        return

    for stage in claimed:
        if stage != chosen_stage:
            finish_stage(cursor, tenant_id, entity_type, entity_id, stage, "Skipped", "superseded")

    recipient = (document.get("email") or "").strip()
    number = document.get("invoice_number") or document.get("quotation_number")
    if not recipient:
        finish_stage(cursor, tenant_id, entity_type, entity_id, chosen_stage, "Skipped", "customer has no email")
        summary["skipped"] += 1
        return

    try:
        send_reminder(cursor, tenant_id, settings, company, kind, entity_type, entity_id,
                      document, recipient, cc, days)
    except EmailError as error:
        finish_stage(cursor, tenant_id, entity_type, entity_id, chosen_stage, "Failed", str(error))
        summary["failed"] += 1
        summary["errors"].append(f"{number}: {error}")
        return

    finish_stage(cursor, tenant_id, entity_type, entity_id, chosen_stage, "Sent")
    summary["sent"] += 1
    create_notification(
        cursor, "Reminder sent", f"Reminder emailed to {document.get('company_name')} for {number}.",
        entity_type.title(), f"/{entity_type}s/{entity_id}/preview", tenant_id=tenant_id,
    )


def expire_quotations(cursor, tenant_id, today):
    cursor.execute(
        """UPDATE quotations SET status = 'Expired'
           WHERE tenant_id = %s AND status = 'Sent' AND valid_until < %s""",
        (tenant_id, today),
    )
    return cursor.rowcount


def run_for_tenant(connection, tenant_id, today=None, force=False):
    """Run all reminder checks for one tenant. Returns a summary dict."""
    today = today or date.today()
    summary = {"sent": 0, "skipped": 0, "failed": 0, "expired": 0, "errors": [], "enabled": True}
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute("SELECT * FROM reminder_settings WHERE tenant_id = %s", (tenant_id,))
        config = cursor.fetchone()
        if not config or (not config["enabled"] and not force):
            summary["enabled"] = False
            return summary

        summary["expired"] = expire_quotations(cursor, tenant_id, today)
        connection.commit()

        try:
            settings = load_settings(cursor, tenant_id)
        except EmailError as error:
            summary["errors"].append(str(error))
            return summary

        company = load_company(cursor, tenant_id)
        cc = owner_emails(cursor, tenant_id, company) if config["copy_owner"] else []

        before_days = parse_days(config["invoice_before_due_days"], [3])
        overdue_days = parse_days(config["invoice_overdue_days"], [1, 7, 14, 30])
        followup_days = parse_days(config["quote_followup_days"], [3, 7])
        expiry_days = parse_days(config["quote_expiry_notice_days"], [2])

        # ---- invoices ---------------------------------------------------
        cursor.execute(
            """SELECT id, due_date FROM invoices
               WHERE tenant_id = %s AND payment_status != 'Paid' AND due_date IS NOT NULL
                 AND (status = 'Approved' OR sent_at IS NOT NULL)""",
            (tenant_id,),
        )
        for row in cursor.fetchall():
            delta = (row["due_date"] - today).days
            if delta < 0:
                late = -delta
                eligible = [d for d in overdue_days if d <= late]
                if not eligible:
                    continue
                kind, keys = "invoice_overdue", [f"overdue-{d}" for d in eligible]
                newest = f"overdue-{max(eligible)}"
                days = late
            else:
                eligible = [d for d in before_days if delta <= d]
                if not eligible:
                    continue
                kind, keys = "invoice_before", [f"before-{d}" for d in eligible]
                newest = f"before-{min(eligible)}"
                days = delta

            invoice = get_invoice_detail(cursor, tenant_id, row["id"])
            if not invoice or invoice["balance"] <= 0.005:
                continue
            # The chosen stage is the one closest to today.
            process_entity(cursor, tenant_id, settings, company, cc, kind, "invoice", row["id"],
                           invoice, keys, newest, days, summary)
            connection.commit()

        # ---- quotations -------------------------------------------------
        cursor.execute(
            """SELECT id, sent_at, valid_until FROM quotations
               WHERE tenant_id = %s AND status = 'Sent' AND sent_at IS NOT NULL
                 AND responded_at IS NULL AND valid_until >= %s""",
            (tenant_id, today),
        )
        for row in cursor.fetchall():
            since_sent = (today - row["sent_at"].date()).days
            days_left = (row["valid_until"] - today).days

            expiring = [d for d in expiry_days if days_left <= d]
            if expiring:
                kind, keys, newest, days = "quote_expiry", [f"expiry-{d}" for d in expiring], f"expiry-{min(expiring)}", days_left
            else:
                due = [d for d in followup_days if d <= since_sent]
                if not due:
                    continue
                kind, keys, newest, days = "quote_followup", [f"followup-{d}" for d in due], f"followup-{max(due)}", since_sent

            quotation = get_quotation_detail(cursor, tenant_id, row["id"])
            if not quotation:
                continue
            process_entity(cursor, tenant_id, settings, company, cc, kind, "quotation", row["id"],
                           quotation, keys, newest, days, summary)
            connection.commit()

        return summary
    finally:
        cursor.close()


def run_all(connection_factory, today=None):
    """Run for every tenant with reminders enabled (used by the CLI/scheduler)."""
    connection = connection_factory()
    if not connection:
        raise RuntimeError("Could not connect to the database.")
    results = {}
    try:
        cursor = connection.cursor(dictionary=True)
        cursor.execute(
            """SELECT t.id FROM tenants t
               JOIN reminder_settings s ON s.tenant_id = t.id
               WHERE t.is_active = TRUE AND s.enabled = TRUE"""
        )
        tenant_ids = [row["id"] for row in cursor.fetchall()]
        cursor.close()
        for tenant_id in tenant_ids:
            try:
                results[tenant_id] = run_for_tenant(connection, tenant_id, today)
            except Exception as error:  # one tenant must never block the rest
                connection.rollback()
                results[tenant_id] = {"errors": [str(error)]}
    finally:
        connection.close()
    return results
