import csv
from datetime import date, datetime
import io

from flask import Blueprint, jsonify, Response, request
from app.db import get_db_connection
from app.security import tenant_id

reports_bp = Blueprint("reports", __name__)

EXPORTS = {
    "customers": ("SELECT id, company_name, contact_name, phone, email FROM customers WHERE tenant_id = %s ORDER BY id DESC", ["ID", "Company", "Contact", "Phone", "Email"]),
    "rfqs": ("SELECT rfq_number, request_date, required_date, purpose, status FROM rfqs WHERE tenant_id = %s ORDER BY id DESC", ["RFQ", "Request Date", "Required Date", "Purpose", "Status"]),
    "invoices": ("SELECT invoice_number, invoice_date, due_date, amount, status, payment_status FROM invoices WHERE tenant_id = %s ORDER BY id DESC", ["Invoice", "Invoice Date", "Due Date", "Amount", "Status", "Payment Status"]),
    "payments": ("SELECT payment_date, amount, status FROM payments WHERE tenant_id = %s ORDER BY id DESC", ["Payment Date", "Amount", "Status"]),
}

@reports_bp.route("/reports/export/<report_type>", methods=["GET"])
def export_report(report_type):
    export = EXPORTS.get(report_type)
    if not export:
        return jsonify({"message": "Unknown report type."}), 404
    connection = get_db_connection(); cursor = connection.cursor()
    try:
        cursor.execute(export[0], (tenant_id(),)); rows = cursor.fetchall()
        output = io.StringIO(); writer = csv.writer(output); writer.writerow(export[1]); writer.writerows(rows)
        return Response(output.getvalue(), mimetype="text/csv", headers={"Content-Disposition": f"attachment; filename={report_type}-report.csv"})
    finally:
        cursor.close(); connection.close()


@reports_bp.route("/reports/summary", methods=["GET"])
def get_reports_summary():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    t = tenant_id()

    # Customers
    cursor.execute("SELECT COUNT(*) AS total_customers FROM customers WHERE tenant_id = %s", (t,))
    customers = cursor.fetchone()

    # RFQs
    cursor.execute("SELECT COUNT(*) AS total_rfqs FROM rfqs WHERE tenant_id = %s", (t,))
    rfqs = cursor.fetchone()

    # Quotations
    cursor.execute("SELECT COUNT(*) AS total_quotations FROM quotations WHERE tenant_id = %s", (t,))
    quotations = cursor.fetchone()

    # Jobs
    cursor.execute("""
        SELECT
            COUNT(*) AS total_jobs,
            SUM(CASE WHEN status = 'Ongoing' THEN 1 ELSE 0 END) AS ongoing_jobs,
            SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed_jobs
        FROM jobs
        WHERE tenant_id = %s
    """, (t,))
    jobs = cursor.fetchone()

    # Invoice value
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) AS total_invoice_value
        FROM invoices
        WHERE tenant_id = %s
    """, (t,))
    invoices = cursor.fetchone()

    # Payments received
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) AS total_payments_received
        FROM payments
        WHERE tenant_id = %s AND status = 'Received'
    """, (t,))
    payments = cursor.fetchone()

    # Outstanding
    total_invoice_value = float(invoices["total_invoice_value"] or 0)
    total_payments_received = float(payments["total_payments_received"] or 0)

    outstanding_amount = total_invoice_value - total_payments_received

    cursor.close()
    connection.close()

    return jsonify({
        "total_customers": customers["total_customers"],
        "total_rfqs": rfqs["total_rfqs"],
        "total_quotations": quotations["total_quotations"],
        "total_jobs": jobs["total_jobs"] or 0,
        "ongoing_jobs": jobs["ongoing_jobs"] or 0,
        "completed_jobs": jobs["completed_jobs"] or 0,
        "total_invoice_value": total_invoice_value,
        "total_payments_received": total_payments_received,
        "outstanding_amount": outstanding_amount
    }), 200


# ---------------------------------------------------------------------------
# Business insights: receivables aging, quotation win rate, revenue, GST
# ---------------------------------------------------------------------------
def parse_range():
    """Read optional ?from=YYYY-MM-DD&to=YYYY-MM-DD filters."""
    values = []
    for key in ("from", "to"):
        raw = request.args.get(key)
        if not raw:
            values.append(None)
            continue
        try:
            values.append(datetime.strptime(raw, "%Y-%m-%d").date())
        except ValueError:
            raise ValueError("Dates must be in YYYY-MM-DD format.")
    return values


def add_range(query, params, column, start, end):
    if start:
        query += f" AND {column} >= %s"
        params.append(start)
    if end:
        query += f" AND {column} <= %s"
        params.append(end)
    return query


OPEN_INVOICES_SQL = """
    SELECT i.id, i.invoice_number, i.invoice_date, i.due_date, i.grand_total,
           c.company_name,
           i.grand_total - COALESCE((SELECT SUM(p.amount) FROM payments p
                                     WHERE p.invoice_id = i.id AND p.status = 'Received'), 0) AS balance
    FROM invoices i
    JOIN jobs j ON i.job_id = j.id
    JOIN quotations q ON j.quotation_id = q.id
    JOIN rfqs r ON q.rfq_id = r.id
    JOIN customers c ON r.customer_id = c.id
    WHERE i.tenant_id = %s AND i.payment_status != 'Paid'
"""

AGING_BUCKETS = [
    ("not_due", "Not yet due", None, 0),
    ("d1_30", "1-30 days", 1, 30),
    ("d31_60", "31-60 days", 31, 60),
    ("d61_90", "61-90 days", 61, 90),
    ("d90_plus", "Over 90 days", 91, None),
]


def bucket_for(days_overdue):
    for key, _, low, high in AGING_BUCKETS:
        if low is None and days_overdue <= 0:
            return key
        if low is not None and days_overdue >= low and (high is None or days_overdue <= high):
            return key
    return "not_due"


def csv_response(rows, header, filename):
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(header)
    writer.writerows(rows)
    return Response(
        output.getvalue(), mimetype="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@reports_bp.route("/reports/aging", methods=["GET"])
def receivables_aging():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(OPEN_INVOICES_SQL, (tenant_id(),))
        today = date.today()
        buckets = {key: {"label": label, "count": 0, "amount": 0.0} for key, label, _, _ in AGING_BUCKETS}
        overdue = []
        total = 0.0

        for row in cursor.fetchall():
            balance = float(row["balance"] or 0)
            if balance <= 0.005:
                continue
            due = row["due_date"] or row["invoice_date"]
            days_overdue = (today - due).days if due else 0
            bucket = buckets[bucket_for(days_overdue)]
            bucket["count"] += 1
            bucket["amount"] = round(bucket["amount"] + balance, 2)
            total += balance
            if days_overdue > 0:
                overdue.append({
                    "id": row["id"], "invoice_number": row["invoice_number"],
                    "company_name": row["company_name"], "due_date": due,
                    "days_overdue": days_overdue, "balance": round(balance, 2),
                })

        overdue.sort(key=lambda item: item["days_overdue"], reverse=True)
        return jsonify({
            "total_outstanding": round(total, 2),
            "buckets": [dict(key=key, **buckets[key]) for key, _, _, _ in AGING_BUCKETS],
            "overdue": overdue[:50],
        }), 200
    finally:
        cursor.close()
        connection.close()


@reports_bp.route("/reports/quotation-funnel", methods=["GET"])
def quotation_funnel():
    try:
        start, end = parse_range()
    except ValueError as error:
        return jsonify({"message": str(error)}), 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        query = """SELECT status, COUNT(*) AS n, COALESCE(SUM(grand_total), 0) AS value
                   FROM quotations WHERE tenant_id = %s"""
        params = [tenant_id()]
        query = add_range(query, params, "quotation_date", start, end)
        cursor.execute(query + " GROUP BY status", params)

        by_status = {status: {"count": 0, "value": 0.0} for status in ("Draft", "Sent", "Accepted", "Rejected", "Expired")}
        for row in cursor.fetchall():
            by_status[row["status"]] = {"count": row["n"], "value": float(row["value"])}

        won = by_status["Accepted"]["count"]
        decided = won + by_status["Rejected"]["count"] + by_status["Expired"]["count"]
        return jsonify({
            "by_status": by_status,
            "win_rate": round(won * 100.0 / decided, 1) if decided else None,
            "won_value": by_status["Accepted"]["value"],
            "open_value": by_status["Draft"]["value"] + by_status["Sent"]["value"],
        }), 200
    finally:
        cursor.close()
        connection.close()


@reports_bp.route("/reports/revenue-by-customer", methods=["GET"])
def revenue_by_customer():
    try:
        start, end = parse_range()
    except ValueError as error:
        return jsonify({"message": str(error)}), 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        query = """
            SELECT c.id, c.company_name, COUNT(i.id) AS invoices,
                   COALESCE(SUM(i.grand_total), 0) AS invoiced,
                   COALESCE(SUM(i.grand_total), 0) - COALESCE(SUM(paid.received), 0) AS outstanding
            FROM invoices i
            JOIN jobs j ON i.job_id = j.id
            JOIN quotations q ON j.quotation_id = q.id
            JOIN rfqs r ON q.rfq_id = r.id
            JOIN customers c ON r.customer_id = c.id
            LEFT JOIN (SELECT invoice_id, SUM(amount) AS received FROM payments
                       WHERE status = 'Received' GROUP BY invoice_id) paid ON paid.invoice_id = i.id
            WHERE i.tenant_id = %s
        """
        params = [tenant_id()]
        query = add_range(query, params, "i.invoice_date", start, end)
        cursor.execute(query + " GROUP BY c.id, c.company_name ORDER BY invoiced DESC LIMIT 20", params)
        rows = cursor.fetchall()
        for row in rows:
            row["invoiced"] = float(row["invoiced"])
            row["outstanding"] = float(row["outstanding"])
        return jsonify(rows), 200
    finally:
        cursor.close()
        connection.close()


@reports_bp.route("/reports/gst-summary", methods=["GET"])
def gst_summary():
    """Month-wise outward supplies: what you report in GSTR-1 / GSTR-3B."""
    try:
        start, end = parse_range()
    except ValueError as error:
        return jsonify({"message": str(error)}), 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        query = """
            SELECT DATE_FORMAT(invoice_date, '%%Y-%%m') AS month, COUNT(*) AS invoices,
                   SUM(taxable_value) AS taxable, SUM(cgst_total) AS cgst,
                   SUM(sgst_total) AS sgst, SUM(igst_total) AS igst,
                   SUM(round_off) AS round_off, SUM(grand_total) AS total
            FROM invoices WHERE tenant_id = %s AND invoice_date IS NOT NULL
        """
        params = [tenant_id()]
        query = add_range(query, params, "invoice_date", start, end)
        cursor.execute(query + " GROUP BY month ORDER BY month DESC LIMIT 24", params)
        rows = cursor.fetchall()
        for row in rows:
            for key in ("taxable", "cgst", "sgst", "igst", "round_off", "total"):
                row[key] = float(row[key] or 0)
        return jsonify(rows), 200
    finally:
        cursor.close()
        connection.close()


@reports_bp.route("/reports/export/sales-register", methods=["GET"])
def export_sales_register():
    """Invoice-level GST register (CSV opens in Excel; accountants can import it)."""
    try:
        start, end = parse_range()
    except ValueError as error:
        return jsonify({"message": str(error)}), 400

    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        query = """
            SELECT i.invoice_number, i.invoice_date, c.company_name, c.gstin,
                   COALESCE(i.place_of_supply, ''), i.supply_type, i.taxable_value,
                   i.cgst_total, i.sgst_total, i.igst_total, i.round_off, i.grand_total,
                   IF(i.reverse_charge, 'Y', 'N'), i.payment_status, COALESCE(i.irn, '')
            FROM invoices i
            JOIN jobs j ON i.job_id = j.id
            JOIN quotations q ON j.quotation_id = q.id
            JOIN rfqs r ON q.rfq_id = r.id
            JOIN customers c ON r.customer_id = c.id
            WHERE i.tenant_id = %s
        """
        params = [tenant_id()]
        query = add_range(query, params, "i.invoice_date", start, end)
        cursor.execute(query + " ORDER BY i.invoice_date, i.id", params)
        return csv_response(
            cursor.fetchall(),
            ["Invoice No", "Invoice Date", "Customer", "Customer GSTIN", "Place of Supply (code)",
             "Supply Type", "Taxable Value", "CGST", "SGST", "IGST", "Round Off", "Invoice Total",
             "Reverse Charge", "Payment Status", "IRN"],
            "gst-sales-register.csv",
        )
    finally:
        cursor.close()
        connection.close()


@reports_bp.route("/reports/export/aging", methods=["GET"])
def export_aging():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(OPEN_INVOICES_SQL + " ORDER BY i.due_date", (tenant_id(),))
        today = date.today()
        rows = []
        for row in cursor.fetchall():
            balance = float(row["balance"] or 0)
            if balance <= 0.005:
                continue
            due = row["due_date"] or row["invoice_date"]
            days = (today - due).days if due else 0
            label = next(label for key, label, _, _ in AGING_BUCKETS if key == bucket_for(days))
            rows.append([row["invoice_number"], row["company_name"], row["invoice_date"], row["due_date"],
                         row["grand_total"], round(balance, 2), max(days, 0), label])
        return csv_response(
            rows,
            ["Invoice No", "Customer", "Invoice Date", "Due Date", "Invoice Total", "Balance", "Days Overdue", "Bucket"],
            "receivables-aging.csv",
        )
    finally:
        cursor.close()
        connection.close()
