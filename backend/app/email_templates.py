"""HTML bodies for outgoing emails (inline styles for email-client safety)."""

from html import escape


def _money(value):
    return f"₹{float(value or 0):,.2f}"


def _shell(brand, company_name, heading, body_html, button_label=None, button_url=None, footer=""):
    button = ""
    if button_url:
        button = (
            f'<p style="margin:24px 0"><a href="{escape(button_url)}" '
            f'style="background:{escape(brand)};color:#ffffff;padding:12px 22px;border-radius:6px;'
            f'text-decoration:none;font-weight:600;display:inline-block">{escape(button_label)}</a></p>'
        )
    return f"""<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1c2733">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:{escape(brand)};color:#ffffff;padding:18px 24px;font-size:18px;font-weight:700">{escape(company_name)}</td></tr>
<tr><td style="padding:24px"><h2 style="margin:0 0 12px;font-size:20px">{escape(heading)}</h2>{body_html}{button}
{footer}</td></tr></table></td></tr></table></body></html>"""


def _details_table(rows):
    cells = "".join(
        f'<tr><td style="padding:6px 0;color:#5b6b7b;width:40%">{escape(label)}</td>'
        f'<td style="padding:6px 0;font-weight:600">{escape(str(value))}</td></tr>'
        for label, value in rows if value not in (None, "")
    )
    return f'<table role="presentation" width="100%" style="border-top:1px solid #e3e8ee;margin:12px 0">{cells}</table>'


def _payment_block(company):
    lines = []
    if company.get("bank_account_no"):
        lines.append(
            f"Bank: {company.get('bank_name', '')} | A/c: {company['bank_account_no']} | IFSC: {company.get('bank_ifsc', '')}"
        )
    if company.get("upi_id"):
        lines.append(f"UPI: {company['upi_id']}")
    if not lines:
        return ""
    body = "<br>".join(escape(line) for line in lines)
    return f'<p style="background:#f4f6f8;padding:12px;border-radius:6px;font-size:14px"><strong>Pay to</strong><br>{body}</p>'


def custom_message_html(message):
    if not message:
        return ""
    return "".join(f'<p style="line-height:1.5">{escape(line)}</p>' for line in message.split("\n") if line.strip())


def document_email(company, doc_type, document, url, message="", signature=""):
    """Return (subject, html, text) for sending a quotation or invoice."""
    brand = company.get("brand_color") or "#1f4e79"
    name = company.get("company_name") or "Our company"
    if doc_type == "quotation":
        subject = f"Quotation {document['quotation_number']} from {name}"
        heading = f"Quotation {document['quotation_number']}"
        rows = [
            ("Quotation no.", document["quotation_number"]),
            ("Date", document.get("quotation_date")),
            ("Valid until", document.get("valid_until")),
            ("Total", _money(document.get("grand_total"))),
        ]
        button = "View & respond to quotation"
        intro = "Please find our quotation attached. You can also review it online and accept or decline it with one click."
    else:
        subject = f"Invoice {document['invoice_number']} from {name}"
        heading = f"Invoice {document['invoice_number']}"
        rows = [
            ("Invoice no.", document["invoice_number"]),
            ("Invoice date", document.get("invoice_date")),
            ("Due date", document.get("due_date")),
            ("Amount", _money(document.get("grand_total"))),
        ]
        button = "View invoice"
        intro = "Please find your invoice attached. You can view or download it online at any time."

    body = custom_message_html(message) or f'<p style="line-height:1.5">{escape(intro)}</p>'
    body += _details_table(rows)
    if doc_type == "invoice":
        body += _payment_block(company)
    footer = f'<p style="color:#5b6b7b;font-size:13px;margin-top:20px">{escape(signature or name)}</p>'
    html = _shell(brand, name, heading, body, button, url, footer)
    text = f"{heading}\n{message or intro}\n\nView online: {url}\n"
    return subject, html, text


def reminder_email(company, kind, document, url, days):
    """kind: invoice_before | invoice_overdue | quote_followup | quote_expiry"""
    brand = company.get("brand_color") or "#1f4e79"
    name = company.get("company_name") or "Our company"
    if kind == "invoice_before":
        number = document["invoice_number"]
        subject = f"Reminder: invoice {number} is due in {days} day(s)"
        heading = "Payment due soon"
        intro = f"This is a friendly reminder that invoice {number} is due on {document.get('due_date')}."
        rows = [("Invoice no.", number), ("Due date", document.get("due_date")), ("Amount due", _money(document.get("balance")))]
        button = "View invoice"
    elif kind == "invoice_overdue":
        number = document["invoice_number"]
        subject = f"Overdue: invoice {number} ({days} day(s) past due)"
        heading = "Payment overdue"
        intro = (
            f"Our records show that invoice {number} was due on {document.get('due_date')} and is now "
            f"{days} day(s) overdue. Please arrange payment at your earliest convenience. "
            "If you have already paid, kindly ignore this message."
        )
        rows = [("Invoice no.", number), ("Due date", document.get("due_date")), ("Amount due", _money(document.get("balance")))]
        button = "View invoice"
    elif kind == "quote_followup":
        number = document["quotation_number"]
        subject = f"Following up on quotation {number}"
        heading = "Quotation follow-up"
        intro = f"We sent you quotation {number} a few days ago and wanted to check whether you have any questions."
        rows = [("Quotation no.", number), ("Valid until", document.get("valid_until")), ("Total", _money(document.get("grand_total")))]
        button = "View & respond"
    else:
        number = document["quotation_number"]
        subject = f"Quotation {number} expires soon"
        heading = "Quotation expiring"
        intro = f"Quotation {number} is valid until {document.get('valid_until')}. Please respond before it expires."
        rows = [("Quotation no.", number), ("Valid until", document.get("valid_until")), ("Total", _money(document.get("grand_total")))]
        button = "View & respond"

    body = f'<p style="line-height:1.5">{escape(intro)}</p>' + _details_table(rows)
    if kind.startswith("invoice"):
        body += _payment_block(company)
    footer = f'<p style="color:#5b6b7b;font-size:13px;margin-top:20px">{escape(name)}</p>'
    return subject, _shell(brand, name, heading, body, button, url, footer), f"{heading}\n{intro}\n\n{url}\n"
