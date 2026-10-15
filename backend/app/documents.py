"""Shared logic for GST documents (quotations and invoices).

Both document types have the same shape: header row, line items, tax totals.
Keeping the maths and persistence here means a tax rule is fixed in one place.
"""

from decimal import Decimal

from app.gst import (
    STATES,
    amount_in_words,
    compute_document,
    determine_supply,
    state_code_from_gstin,
    validate_gstin,
)

DOC_TABLES = {
    "quotation": ("quotations", "quotation_items", "quotation_id"),
    "invoice": ("invoices", "invoice_items", "invoice_id"),
}

ITEM_COLUMNS = (
    "description", "hsn_sac", "quantity", "unit", "rate", "discount_percent",
    "gst_rate", "amount", "taxable_amount", "cgst_amount", "sgst_amount",
    "igst_amount", "total_amount",
)

TOTAL_COLUMNS = (
    "subtotal", "taxable_value", "cgst_total", "sgst_total", "igst_total",
    "total_tax", "adjustment", "round_off", "grand_total",
)


def load_company(cursor, tenant_id):
    """Return the tenant's company settings row as a dict (dictionary cursor)."""
    cursor.execute("SELECT * FROM company_settings WHERE tenant_id = %s LIMIT 1", (tenant_id,))
    company = cursor.fetchone()
    if company is None:
        raise LookupError("Company settings are missing for this workspace.")
    if not company.get("state_code") and company.get("gstin"):
        company["state_code"] = state_code_from_gstin(company["gstin"])
    return company


def resolve_supply(company, customer, requested_place_of_supply):
    """Work out intra/inter-state treatment for a document.

    The place of supply defaults to the customer's state, then to the seller's.
    """
    place = requested_place_of_supply or (customer or {}).get("state_code") or None
    if place and place not in STATES:
        raise ValueError("Choose a valid place of supply.")
    return determine_supply(bool(company.get("gst_registered")), company.get("state_code"), place)


def build_document(cursor, tenant_id, customer, raw_items, adjustment, requested_place, label):
    """Validate and compute a document. Returns (items, totals, supply_type, place)."""
    company = load_company(cursor, tenant_id)
    supply_type, place = resolve_supply(company, customer, requested_place)
    items, totals = compute_document(
        raw_items,
        adjustment,
        supply_type,
        round_off_enabled=bool(company.get("round_off_enabled", True)),
        label=label,
    )
    if totals["grand_total"] <= 0:
        raise ValueError("The document total must be greater than zero.")
    return items, totals, supply_type, place, company


def replace_items(cursor, doc_type, doc_id, items):
    """Delete and re-insert the line items of one document."""
    _, item_table, fk_column = DOC_TABLES[doc_type]
    cursor.execute(f"DELETE FROM `{item_table}` WHERE `{fk_column}` = %s", (doc_id,))
    columns = ", ".join(f"`{name}`" for name in ITEM_COLUMNS)
    placeholders = ", ".join(["%s"] * (len(ITEM_COLUMNS) + 1))
    for item in items:
        cursor.execute(
            f"INSERT INTO `{item_table}` (`{fk_column}`, {columns}) VALUES ({placeholders})",
            (doc_id, *[item[name] for name in ITEM_COLUMNS]),
        )


def load_items(cursor, doc_type, doc_id):
    _, item_table, fk_column = DOC_TABLES[doc_type]
    columns = ", ".join(f"`{name}`" for name in ("id", fk_column) + ITEM_COLUMNS)
    cursor.execute(
        f"SELECT {columns} FROM `{item_table}` WHERE `{fk_column}` = %s ORDER BY id ASC",
        (doc_id,),
    )
    return cursor.fetchall()


def decorate_document(document, company=None):
    """Add display helpers (state names, amount in words) to a document dict."""
    place = document.get("place_of_supply")
    document["place_of_supply_name"] = STATES.get(place) if place else None
    total = document.get("grand_total")
    if total is not None:
        document["amount_in_words"] = amount_in_words(Decimal(str(total)))
    return document


def fetch_customer(cursor, tenant_id, customer_id):
    cursor.execute(
        "SELECT * FROM customers WHERE id = %s AND tenant_id = %s",
        (customer_id, tenant_id),
    )
    return cursor.fetchone()


def check_customer_gstin(gstin):
    """Return a message for an invalid customer GSTIN, else None."""
    return validate_gstin(gstin)


# ---------------------------------------------------------------------------
# Full document loaders (used by the internal API, the portal and reminders)
# ---------------------------------------------------------------------------
QUOTATION_SELECT = """
    q.id, q.quotation_number, q.quotation_date, q.valid_until, q.rfq_id,
    r.rfq_number, r.customer_id, r.purpose, r.request_date, r.required_date,
    c.company_name, q.description, q.amount, q.subtotal, q.adjustment,
    q.grand_total, q.notes, q.terms_conditions, q.status,
    q.place_of_supply, q.supply_type, q.taxable_value, q.cgst_total,
    q.sgst_total, q.igst_total, q.total_tax, q.round_off,
    q.sent_at, q.responded_at, q.response_note, q.responded_by_name,
    q.revision_of, q.revision_no,
    (SELECT r2.id FROM quotations r2 WHERE r2.revision_of = q.id LIMIT 1) AS revised_by_id,
    (SELECT r2.quotation_number FROM quotations r2 WHERE r2.revision_of = q.id LIMIT 1) AS revised_by_number
"""

INVOICE_SELECT = """
    invoices.id, invoices.job_id, jobs.job_name, jobs.status AS job_status,
    invoices.invoice_number, invoices.invoice_date, invoices.due_date,
    invoices.amount, invoices.subtotal, invoices.adjustment, invoices.grand_total,
    invoices.status, invoices.payment_status, invoices.notes, invoices.terms_conditions,
    invoices.place_of_supply, invoices.supply_type, invoices.taxable_value,
    invoices.cgst_total, invoices.sgst_total, invoices.igst_total, invoices.total_tax,
    invoices.round_off, invoices.reverse_charge, invoices.irn, invoices.ack_no,
    invoices.ack_date, invoices.e_invoice_status, invoices.eway_bill_no,
    invoices.sent_at, invoices.milestone_label, quotations.quotation_number,
    customers.id AS customer_id, customers.company_name, customers.contact_name,
    customers.phone, customers.email, customers.gstin AS customer_gstin,
    customers.state_code AS customer_state_code,
    customers.billing_address AS address, customers.shipping_address,
    COALESCE((SELECT SUM(p.amount) FROM payments p
              WHERE p.invoice_id = invoices.id AND p.status = 'Received'), 0) AS paid_amount
"""

INVOICE_FROM = """
    FROM invoices
    JOIN jobs ON invoices.job_id = jobs.id
    JOIN quotations ON jobs.quotation_id = quotations.id
    JOIN rfqs ON quotations.rfq_id = rfqs.id
    JOIN customers ON rfqs.customer_id = customers.id
"""


def get_quotation_detail(cursor, tenant_id, quotation_id):
    """Return one quotation with customer details and items, or None."""
    cursor.execute(f"""
        SELECT {QUOTATION_SELECT}
        FROM quotations q
        JOIN rfqs r ON q.rfq_id = r.id
        JOIN customers c ON r.customer_id = c.id
        WHERE q.id = %s AND q.tenant_id = %s
    """, (quotation_id, tenant_id))
    quotation = cursor.fetchone()
    if not quotation:
        return None

    customer = fetch_customer(cursor, tenant_id, quotation["customer_id"]) or {}
    quotation["address"] = customer.get("billing_address") or ""
    quotation["shipping_address"] = customer.get("shipping_address") or ""
    quotation["contact_person"] = customer.get("contact_name") or ""
    quotation["phone"] = customer.get("phone") or ""
    quotation["email"] = customer.get("email") or ""
    quotation["customer_gstin"] = customer.get("gstin") or ""
    quotation["customer_state_code"] = customer.get("state_code")
    quotation["items"] = load_items(cursor, "quotation", quotation_id)
    return decorate_document(quotation)


def get_invoice_detail(cursor, tenant_id, invoice_id):
    """Return one invoice with customer details and items, or None."""
    cursor.execute(f"""
        SELECT {INVOICE_SELECT}
        {INVOICE_FROM}
        WHERE invoices.id = %s AND invoices.tenant_id = %s
    """, (invoice_id, tenant_id))
    invoice = cursor.fetchone()
    if not invoice:
        return None
    invoice["items"] = load_items(cursor, "invoice", invoice_id)
    invoice["balance"] = float(invoice["grand_total"] or 0) - float(invoice["paid_amount"] or 0)
    return decorate_document(invoice)
