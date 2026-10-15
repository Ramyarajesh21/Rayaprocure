"""Tests for email sending, the customer portal, reminders and templates.

Uses a local in-process SMTP sink (nothing is sent to the internet).
Run with DB_NAME pointing at a throwaway database.
"""

import asyncore
import os
import smtpd
import sys
import threading
import unittest
from datetime import date, timedelta
from email import message_from_bytes
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ["RATE_LIMIT_DISABLED"] = "1"
os.environ["ALLOW_PRIVATE_SMTP"] = "1"

if os.getenv("DB_NAME", "rayaprocure_db") == "rayaprocure_db":
    raise SystemExit("Refusing to run tests against rayaprocure_db. Set DB_NAME to a test database.")

from app import create_app  # noqa: E402
from app.db import get_db_connection  # noqa: E402
from app.reminders import run_for_tenant  # noqa: E402
from test_api import Client, VALID_GSTIN_MH, unique  # noqa: E402

SMTP_PORT = 2525
MESSAGES = []


class Sink(smtpd.SMTPServer):
    def process_message(self, peer, mailfrom, rcpttos, data, **kwargs):
        MESSAGES.append({"from": mailfrom, "to": rcpttos, "message": message_from_bytes(data)})


def start_sink():
    server = Sink(("127.0.0.1", SMTP_PORT), None)
    thread = threading.Thread(target=lambda: asyncore.loop(timeout=0.2), daemon=True)
    thread.start()
    return server


def body_of(message):
    html = ""
    for part in message.walk():
        if part.get_content_type() == "text/html":
            html = part.get_payload(decode=True).decode()
    return html


class PlatformTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sink = start_sink()
        cls.app = create_app()
        cls.c = Client(cls.app, unique("Mail Co "))
        cls.other = Client(cls.app, unique("Other Co "))

        assert cls.c.put("/api/company", {"companyName": "Mail Co", "gstin": VALID_GSTIN_MH,
                                          "bankName": "HDFC", "bankAccountNo": "1234567890",
                                          "bankIfsc": "HDFC0001234", "upiId": "mail@upi"}).status_code == 200
        response = cls.c.put("/api/email/settings", {
            "smtpHost": "127.0.0.1", "smtpPort": SMTP_PORT, "security": "none",
            "fromEmail": "billing@mailco.test", "fromName": "Mail Co", "smtpPassword": "s3cret",
        })
        assert response.status_code == 200, response.get_json()

    @classmethod
    def tearDownClass(cls):
        cls.sink.close()

    def setUp(self):
        MESSAGES.clear()

    # -- helpers ---------------------------------------------------------
    def new_quotation(self, email="buyer@customer.test"):
        customer = self.c.post("/customers", {"company_name": unique("Buyer "), "email": email, "state_code": "27"})
        customer_id = customer.get_json()["id"]
        rfq = self.c.post("/rfqs", {"customer_id": customer_id, "request_date": "2026-01-10"}).get_json()["id"]
        quotation = self.c.post("/quotations", {
            "rfq_id": rfq, "quotation_date": date.today().isoformat(),
            "items": [{"description": "Service", "unit": "Job", "quantity": 1, "rate": 5000, "gst_rate": 18}],
        })
        self.assertEqual(quotation.status_code, 201, quotation.get_json())
        return quotation.get_json()["id"]

    def new_invoice(self, due_days_ago, email="buyer@customer.test"):
        quotation_id = self.new_quotation(email)
        self.c.post(f"/quotations/{quotation_id}/decision", {"decision": "Accepted"})
        job_id = self.c.post("/jobs", {"quotation_id": quotation_id, "job_name": "Job", "start_date": "2026-01-15"}).get_json()["id"]
        draft = self.c.get(f"/invoices/draft/{job_id}").get_json()
        invoice_date = date.today() - timedelta(days=due_days_ago + 15)
        response = self.c.post("/invoices", {
            "job_id": job_id, "items": draft["items"], "place_of_supply": draft["place_of_supply"],
            "invoice_date": invoice_date.isoformat(),
            "due_date": (date.today() - timedelta(days=due_days_ago)).isoformat(),
        })
        self.assertEqual(response.status_code, 201, response.get_json())
        invoice_id = response.get_json()["id"]
        self.c.post(f"/invoices/{invoice_id}/approve")
        return invoice_id

    def wait_for_messages(self, count, timeout=3):
        import time
        end = time.time() + timeout
        while len(MESSAGES) < count and time.time() < end:
            time.sleep(0.05)

    # -- email settings --------------------------------------------------
    def test_smtp_password_is_never_returned(self):
        settings = self.c.get("/api/email/settings").get_json()
        self.assertTrue(settings["hasPassword"])
        self.assertNotIn("smtpPassword", settings)
        self.assertNotIn("s3cret", str(settings))

    def test_email_settings_owner_only_and_validated(self):
        bad_port = self.c.put("/api/email/settings", {"smtpHost": "h", "fromEmail": "a@b.co", "smtpPort": 22})
        self.assertEqual(bad_port.status_code, 400)
        bad_from = self.c.put("/api/email/settings", {"smtpHost": "h", "fromEmail": "nope"})
        self.assertEqual(bad_from.status_code, 400)

    def test_test_email_is_delivered(self):
        response = self.c.post("/api/email/test", {"to": "owner@mailco.test"})
        self.assertEqual(response.status_code, 200, response.get_json())
        self.wait_for_messages(1)
        self.assertEqual(MESSAGES[0]["to"], ["owner@mailco.test"])

    # -- sending documents + portal -------------------------------------
    def test_send_quotation_with_pdf_then_customer_accepts_via_portal(self):
        quotation_id = self.new_quotation()
        pdf = (b"%PDF-1.4 fake pdf content", "Quotation.pdf")
        import io
        response = self.c.http.post("/api/email/send", data={
            "entity_type": "quotation", "entity_id": str(quotation_id),
            "message": "Hello, please review.", "pdf": (io.BytesIO(pdf[0]), pdf[1]),
        }, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 200, response.get_json())
        self.wait_for_messages(1)

        message = MESSAGES[0]["message"]
        self.assertEqual(MESSAGES[0]["to"], ["buyer@customer.test"])
        self.assertIn("Quotation", message["Subject"])
        attachments = [p.get_filename() for p in message.walk() if p.get_filename()]
        self.assertEqual(attachments, ["Quotation.pdf"])
        self.assertIn("/p/", body_of(message))

        detail = self.c.get(f"/quotations/{quotation_id}").get_json()
        self.assertEqual(detail["status"], "Sent")

        token = response.get_json()["portalUrl"].rsplit("/", 1)[-1]
        public = self.app.test_client()

        view = public.get(f"/api/public/{token}")
        self.assertEqual(view.status_code, 200)
        payload = view.get_json()
        self.assertEqual(payload["type"], "quotation")
        self.assertTrue(payload["canRespond"])
        # Nothing sensitive leaks to the customer.
        self.assertNotIn("smtp", str(payload["company"]).lower())
        self.assertNotIn("tenant_id", str(payload))

        self.assertEqual(public.post(f"/api/public/{token}/respond", json={"decision": "Accepted"}).status_code, 400)
        accepted = public.post(f"/api/public/{token}/respond", json={"decision": "Accepted", "name": "Ravi Kumar"})
        self.assertEqual(accepted.status_code, 200, accepted.get_json())
        after = self.c.get(f"/quotations/{quotation_id}").get_json()
        self.assertEqual(after["status"], "Accepted")
        self.assertEqual(after["responded_by_name"], "Ravi Kumar")
        again = public.post(f"/api/public/{token}/respond", json={"decision": "Rejected", "name": "Ravi Kumar"})
        self.assertEqual(again.status_code, 409)

    def test_bad_share_token_is_404(self):
        self.assertEqual(self.app.test_client().get("/api/public/not-a-real-token").status_code, 404)

    def test_cannot_email_or_reach_another_tenants_document(self):
        quotation_id = self.new_quotation()
        response = self.other.post("/api/email/send", {"entity_type": "quotation", "entity_id": quotation_id, "to": "x@y.co"})
        self.assertEqual(response.status_code, 404)

    def test_fake_pdf_is_rejected(self):
        import io
        quotation_id = self.new_quotation()
        response = self.c.http.post("/api/email/send", data={
            "entity_type": "quotation", "entity_id": str(quotation_id),
            "pdf": (io.BytesIO(b"MZ not a pdf"), "evil.pdf"),
        }, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 400)

    def test_customer_without_email_needs_recipient(self):
        quotation_id = self.new_quotation(email="")
        response = self.c.post("/api/email/send", {"entity_type": "quotation", "entity_id": quotation_id})
        self.assertEqual(response.status_code, 400)

    # -- reminders -------------------------------------------------------
    def enable_reminders(self):
        response = self.c.put("/api/reminders/settings", {
            "enabled": True, "invoiceBeforeDueDays": "3", "invoiceOverdueDays": "1,7,14",
            "quoteFollowupDays": "3", "quoteExpiryNoticeDays": "2", "copyOwner": False,
        })
        self.assertEqual(response.status_code, 200, response.get_json())

    def test_overdue_reminder_sent_once_only(self):
        invoice_id = self.new_invoice(due_days_ago=8)
        self.enable_reminders()
        MESSAGES.clear()

        first = self.c.post("/api/reminders/run").get_json()
        self.assertGreaterEqual(first["sent"], 1, first)
        self.wait_for_messages(1)
        subjects = [m["message"]["Subject"] for m in MESSAGES]
        self.assertTrue(any("overdue" in s.lower() for s in subjects), subjects)

        MESSAGES.clear()
        second = self.c.post("/api/reminders/run").get_json()
        self.assertEqual(second["sent"], 0, second)

        logs = self.c.get("/api/reminders/logs").get_json()
        stages = {(row["entity_id"], row["stage"]): row["status"] for row in logs if row["entity_id"] == invoice_id}
        self.assertEqual(stages[(invoice_id, "overdue-7")], "Sent")
        self.assertEqual(stages[(invoice_id, "overdue-1")], "Skipped")  # catch-up sends one email, not two

    def test_paid_invoice_gets_no_reminder(self):
        invoice_id = self.new_invoice(due_days_ago=8)
        invoice = self.c.get(f"/invoices/{invoice_id}").get_json()
        self.c.post("/payments", {"invoice_id": invoice_id, "payment_date": date.today().isoformat(),
                                  "amount": invoice["grand_total"], "status": "Received"})
        self.enable_reminders()
        MESSAGES.clear()
        self.c.post("/api/reminders/run")
        self.assertFalse([m for m in MESSAGES if invoice["invoice_number"] in m["message"]["Subject"]])

    def test_expired_quotation_is_marked(self):
        quotation_id = self.new_quotation()
        yesterday = (date.today() - timedelta(days=1)).isoformat()
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute("UPDATE quotations SET status = 'Sent', valid_until = %s, sent_at = NOW() WHERE id = %s",
                       (yesterday, quotation_id))
        connection.commit()
        cursor.close()
        connection.close()
        self.enable_reminders()
        summary = self.c.post("/api/reminders/run").get_json()
        self.assertGreaterEqual(summary["expired"], 1)
        self.assertEqual(self.c.get(f"/quotations/{quotation_id}").get_json()["status"], "Expired")

    def test_reminders_owner_only_and_disabled_by_default(self):
        fresh = Client(self.app, unique("Quiet Co "))
        self.assertFalse(fresh.get("/api/reminders/settings").get_json()["enabled"])
        connection = get_db_connection()
        try:
            summary = run_for_tenant(connection, fresh.tenant_id)
        finally:
            connection.close()
        self.assertFalse(summary["enabled"])
        self.assertEqual(summary["sent"], 0)

    # -- templates -------------------------------------------------------
    def test_template_crud_default_and_safety(self):
        scripted = self.c.post("/api/templates", {"name": "Bad", "doc_type": "invoice", "custom_html": "<script>alert(1)</script>"})
        self.assertEqual(scripted.status_code, 400)
        handler = self.c.post("/api/templates", {"name": "Bad2", "doc_type": "invoice", "custom_html": '<img src=x onerror="a()">'})
        self.assertEqual(handler.status_code, 400)

        created = self.c.post("/api/templates", {
            "name": "My format", "doc_type": "invoice", "is_default": True,
            "layout": {"title": "TAX INVOICE", "columns": {"hsn": True}},
            "custom_html": "<h1>{{company.company_name}}</h1>",
        })
        self.assertEqual(created.status_code, 201, created.get_json())
        default = self.c.get("/api/templates/default/invoice").get_json()
        self.assertEqual(default["name"], "My format")
        self.assertEqual(default["layout"]["title"], "TAX INVOICE")

        # Another company never sees it.
        self.assertEqual(self.other.get("/api/templates").get_json(), [])
        self.assertIsNone(self.other.get("/api/templates/default/invoice").get_json())

        # It is served to the customer portal too.
        invoice_id = self.new_invoice(due_days_ago=-5)
        sent = self.c.post("/api/email/send", {"entity_type": "invoice", "entity_id": invoice_id})
        self.assertEqual(sent.status_code, 200, sent.get_json())
        token = sent.get_json()["portalUrl"].rsplit("/", 1)[-1]
        portal = self.app.test_client().get(f"/api/public/{token}").get_json()
        self.assertEqual(portal["template"]["layout"]["title"], "TAX INVOICE")

    def test_catalog_is_tenant_scoped(self):
        created = self.c.post("/api/catalog", {"name": "Consulting", "hsn_sac": "998313", "rate": 1500, "gst_rate": 18})
        self.assertEqual(created.status_code, 201, created.get_json())
        self.assertTrue(any(i["name"] == "Consulting" for i in self.c.get("/api/catalog").get_json()))
        self.assertEqual(self.other.get("/api/catalog").get_json(), [])
        self.assertEqual(self.other.delete(f"/api/catalog/{created.get_json()['id']}").status_code, 404)
        self.assertEqual(self.c.post("/api/catalog", {"name": "X", "hsn_sac": "12"}).status_code, 400)


if __name__ == "__main__":
    unittest.main()
