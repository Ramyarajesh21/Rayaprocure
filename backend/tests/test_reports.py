"""Tests for the business insight reports (aging, win rate, revenue, GST)."""

import os
import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ["RATE_LIMIT_DISABLED"] = "1"

if os.getenv("DB_NAME", "rayaprocure_db") == "rayaprocure_db":
    raise SystemExit("Refusing to run tests against rayaprocure_db. Set DB_NAME to a test database.")

from app import create_app  # noqa: E402
from test_api import Client, VALID_GSTIN_MH, unique  # noqa: E402


class ReportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.c = Client(cls.app, unique("Report Co "))
        cls.other = Client(cls.app, unique("Other Report Co "))
        cls.c.put("/api/company", {"gstin": VALID_GSTIN_MH})

        # Two invoices (one 45 days overdue, one not yet due) and quotations in mixed states.
        cls.overdue_id = cls.make_invoice(45)
        cls.current_id = cls.make_invoice(-10)

    @classmethod
    def make_invoice(cls, due_days_ago):
        customer = cls.c.post("/customers", {"company_name": unique("Cust "), "state_code": "27"}).get_json()["id"]
        rfq = cls.c.post("/rfqs", {"customer_id": customer, "request_date": "2026-01-01"}).get_json()["id"]
        quotation = cls.c.post("/quotations", {
            "rfq_id": rfq, "items": [{"description": "Work", "unit": "Job", "quantity": 1, "rate": 1000, "gst_rate": 18}],
        }).get_json()["id"]
        cls.c.post(f"/quotations/{quotation}/decision", {"decision": "Accepted"})
        job = cls.c.post("/jobs", {"quotation_id": quotation, "job_name": "J", "start_date": "2026-01-02"}).get_json()["id"]
        draft = cls.c.get(f"/invoices/draft/{job}").get_json()
        due = date.today() - timedelta(days=due_days_ago)
        response = cls.c.post("/invoices", {
            "job_id": job, "items": draft["items"], "invoice_date": (due - timedelta(days=15)).isoformat(),
            "due_date": due.isoformat(),
        })
        assert response.status_code == 201, response.get_json()
        return response.get_json()["id"]

    def test_aging_buckets(self):
        report = self.c.get("/reports/aging").get_json()
        self.assertEqual(report["total_outstanding"], 2360.0)
        buckets = {b["key"]: b for b in report["buckets"]}
        self.assertEqual(buckets["d31_60"]["count"], 1)
        self.assertEqual(buckets["d31_60"]["amount"], 1180.0)
        self.assertEqual(buckets["not_due"]["count"], 1)
        self.assertEqual(report["overdue"][0]["days_overdue"], 45)

    def test_aging_drops_paid_invoice_and_is_tenant_scoped(self):
        self.assertEqual(self.other.get("/reports/aging").get_json()["total_outstanding"], 0)

        client = Client(self.app, unique("Paid Co "))
        client.put("/api/company", {"gstin": VALID_GSTIN_MH})
        type(self).c, original = client, type(self).c
        try:
            invoice_id = self.make_invoice(5)
            client.post("/payments", {"invoice_id": invoice_id, "payment_date": date.today().isoformat(),
                                      "amount": 1180, "status": "Received"})
            self.assertEqual(client.get("/reports/aging").get_json()["total_outstanding"], 0)
        finally:
            type(self).c = original

    def test_quotation_funnel_win_rate(self):
        # This tenant has accepted quotations only so far.
        funnel = self.c.get("/reports/quotation-funnel").get_json()
        self.assertEqual(funnel["win_rate"], 100.0)
        self.assertGreaterEqual(funnel["by_status"]["Accepted"]["count"], 2)
        self.assertIsNone(self.other.get("/reports/quotation-funnel").get_json()["win_rate"])

    def test_revenue_by_customer_and_gst_summary(self):
        revenue = self.c.get("/reports/revenue-by-customer").get_json()
        self.assertEqual(sum(row["invoiced"] for row in revenue), 2360.0)

        gst = self.c.get("/reports/gst-summary").get_json()
        self.assertEqual(sum(row["taxable"] for row in gst), 2000.0)
        self.assertEqual(sum(row["cgst"] for row in gst), 180.0)
        self.assertEqual(sum(row["sgst"] for row in gst), 180.0)

    def test_bad_date_rejected(self):
        self.assertEqual(self.c.get("/reports/gst-summary?from=31-01-2026").status_code, 400)

    def test_csv_exports(self):
        register = self.c.get("/reports/export/sales-register")
        self.assertEqual(register.status_code, 200)
        self.assertEqual(register.mimetype, "text/csv")
        lines = register.get_data(as_text=True).strip().splitlines()
        self.assertEqual(len(lines), 3)  # header + 2 invoices
        self.assertIn("CGST", lines[0])

        aging = self.c.get("/reports/export/aging").get_data(as_text=True)
        self.assertIn("31-60 days", aging)


if __name__ == "__main__":
    unittest.main()
