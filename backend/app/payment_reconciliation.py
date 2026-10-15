"""Keep each invoice's payment status consistent with recorded payments."""


def reconcile_invoice_payment_status(cursor, invoice_id):
    """Derive Pending, Partial, or Paid from received payments for one invoice."""
    cursor.execute(
        """
        SELECT
            invoices.amount AS invoice_amount,
            COALESCE(
                SUM(CASE WHEN payments.status = 'Received' THEN payments.amount ELSE 0 END),
                0
            ) AS received_amount
        FROM invoices
        LEFT JOIN payments
            ON payments.invoice_id = invoices.id
        WHERE invoices.id = %s
        GROUP BY invoices.id, invoices.amount
        """,
        (invoice_id,),
    )
    invoice = cursor.fetchone()

    if not invoice:
        return

    invoice_amount = float(invoice["invoice_amount"] or 0)
    received_amount = float(invoice["received_amount"] or 0)

    if received_amount <= 0:
        payment_status = "Pending"
    elif received_amount >= invoice_amount:
        payment_status = "Paid"
    else:
        payment_status = "Partial"

    cursor.execute(
        "UPDATE invoices SET payment_status = %s WHERE id = %s",
        (payment_status, invoice_id),
    )
