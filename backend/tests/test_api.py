"""End-to-end API tests (tenancy, GST, quote-to-cash).

Run against a THROWAWAY database only:

    DB_NAME=rayaprocure_test python -m unittest discover -s tests -v

The suite refuses to run against the default production database name.
"""

import os
import sys
import unittest
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ["RATE_LIMIT_DISABLED"] = "1"

if os.getenv("DB_NAME", "rayaprocure_db") == "rayaprocure_db":
    raise SystemExit("Refusing to run tests against rayaprocure_db. Set DB_NAME to a test database.")

from app import create_app  # noqa: E402

VALID_GSTIN_TN = "33AAPFU0939F1Z2"
VALID_GSTIN_MH = "27AAPFU0939F1ZV"


def unique(prefix):
    return f"{prefix}{uuid.uuid4().hex[:8]}"


class Client:
    """A logged-in test client for one tenant."""

    def __init__(self, app, company):
        self.http = app.test_client()
        self.username = unique("owner")
        response = self.http.post("/api/auth/register", json={
            "company_name": company, "name": "Owner", "username": self.username,
            "email": f"{self.username}@example.com", "password": "password123",
        })
        assert response.status_code == 201, response.get_json()
        self.tenant_id = response.get_json()["user"]["tenant_id"]

    def get(self, path):
        return self.http.get(path)

    def post(self, path, json=None):
        return self.http.post(path, json=json or {})

    def put(self, path, json=None):
        return self.http.put(path, json=json or {})

    def delete(self, path):
        return self.http.delete(path)


class ApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.a = Client(cls.app, unique("Alpha Traders "))
        cls.b = Client(cls.app, unique("Beta Works "))

    # -- helpers ---------------------------------------------------------
    def setup_gst_company(self, client, gstin):
        response = client.put("/api/company", {"companyName": "Alpha Traders", "gstin": gstin})
        self.assertEqual(response.status_code, 200, response.get_json())

    def make_quotation(self, client, customer_state=None, gst_rate=18):
        customer = client.post("/customers", {
            "company_name": unique("Cust "), "email": "buyer@example.com",
            "state_code": customer_state,
        })
        self.assertEqual(customer.status_code, 201, customer.get_json())
        customer_id = customer.get_json()["id"]

        rfq = client.post("/rfqs", {"customer_id": customer_id, "request_date": "2026-01-10"})
        self.assertEqual(rfq.status_code, 201, rfq.get_json())
        rfq_id = rfq.get_json()["id"]

        quotation = client.post("/quotations", {
            "rfq_id": rfq_id, "quotation_date": "2026-01-11",
            "items": [{
                "description": "Widget", "unit": "Nos", "quantity": 10, "rate": 100,
                "gst_rate": gst_rate, "hsn_sac": "8479",
            }],
        })
        self.assertEqual(quotation.status_code, 201, quotation.get_json())
        return customer_id, rfq_id, quotation.get_json()["id"]

    # -- tests -----------------------------------------------------------
    def test_registration_isolated_and_login(self):
        me = self.a.get("/api/auth/me").get_json()["user"]
        self.assertEqual(me["tenant_id"], self.a.tenant_id)
        self.assertNotEqual(self.a.tenant_id, self.b.tenant_id)

        fresh = self.app.test_client()
        ok = fresh.post("/api/auth/login", json={"username": self.a.username, "password": "password123"})
        self.assertEqual(ok.status_code, 200)
        bad = fresh.post("/api/auth/login", json={"username": self.a.username, "password": "wrong"})
        self.assertEqual(bad.status_code, 401)

    def test_tenant_data_is_isolated(self):
        customer_id, rfq_id, quotation_id = self.make_quotation(self.a)

        # Tenant B sees none of tenant A's data.
        self.assertNotIn(customer_id, [row["id"] for row in self.b.get("/customers").get_json()])
        self.assertNotIn(quotation_id, [row["id"] for row in self.b.get("/quotations").get_json()])
        self.assertEqual(self.b.get(f"/quotations/{quotation_id}").status_code, 404)
        self.assertEqual(self.b.put(f"/customers/{customer_id}", {"company_name": "Hacked"}).status_code, 404)
        self.assertEqual(self.b.delete(f"/quotations/{quotation_id}").status_code, 404)
        self.assertEqual(self.b.post("/rfqs", {"customer_id": customer_id, "request_date": "2026-01-01"}).status_code, 404)

        # ... and tenant A still has it.
        self.assertEqual(self.a.get(f"/quotations/{quotation_id}").status_code, 200)

    def test_unauthenticated_requests_are_rejected(self):
        anonymous = self.app.test_client()
        self.assertEqual(anonymous.get("/customers").status_code, 401)
        self.assertEqual(anonymous.get("/invoices").status_code, 401)

    def test_numbers_are_per_tenant(self):
        _, _, first = self.make_quotation(self.b)
        number = self.b.get(f"/quotations/{first}").get_json()["quotation_number"]
        self.assertTrue(number.startswith("QTN-"))

    def test_gst_intra_state_splits_cgst_sgst(self):
        client = Client(self.app, unique("Intra Co "))
        self.setup_gst_company(client, VALID_GSTIN_MH)  # Maharashtra (27)
        _, _, quotation_id = self.make_quotation(client, customer_state="27")

        quotation = client.get(f"/quotations/{quotation_id}").get_json()
        self.assertEqual(quotation["supply_type"], "intra")
        self.assertEqual(float(quotation["taxable_value"]), 1000.00)
        self.assertEqual(float(quotation["cgst_total"]), 90.00)
        self.assertEqual(float(quotation["sgst_total"]), 90.00)
        self.assertEqual(float(quotation["igst_total"]), 0.00)
        self.assertEqual(float(quotation["grand_total"]), 1180.00)
        self.assertIn("One Thousand One Hundred Eighty", quotation["amount_in_words"])

    def test_gst_inter_state_uses_igst(self):
        client = Client(self.app, unique("Inter Co "))
        self.setup_gst_company(client, VALID_GSTIN_MH)
        _, _, quotation_id = self.make_quotation(client, customer_state="29")  # Karnataka

        quotation = client.get(f"/quotations/{quotation_id}").get_json()
        self.assertEqual(quotation["supply_type"], "inter")
        self.assertEqual(float(quotation["igst_total"]), 180.00)
        self.assertEqual(float(quotation["cgst_total"]), 0.00)

    def test_unregistered_supplier_charges_no_tax(self):
        client = Client(self.app, unique("Small Co "))
        _, _, quotation_id = self.make_quotation(client, customer_state="29", gst_rate=18)
        quotation = client.get(f"/quotations/{quotation_id}").get_json()
        self.assertEqual(quotation["supply_type"], "none")
        self.assertEqual(float(quotation["total_tax"]), 0.00)
        self.assertEqual(float(quotation["grand_total"]), 1000.00)

    def test_invalid_gstin_rejected(self):
        response = self.a.put("/api/company", {"gstin": "27AAPFU0939F1ZX"})
        self.assertEqual(response.status_code, 400)
        response = self.a.post("/customers", {"company_name": "X", "gstin": "BAD"})
        self.assertEqual(response.status_code, 400)

    def test_quote_to_cash_flow(self):
        client = Client(self.app, unique("Flow Co "))
        self.setup_gst_company(client, VALID_GSTIN_MH)
        _, _, quotation_id = self.make_quotation(client, customer_state="27")

        self.assertEqual(client.post(f"/quotations/{quotation_id}/decision", {"decision": "Accepted"}).status_code, 200)
        job = client.post("/jobs", {"quotation_id": quotation_id, "job_name": "Install", "start_date": "2026-01-15"})
        self.assertEqual(job.status_code, 201, job.get_json())
        job_id = job.get_json()["id"]

        draft = client.get(f"/invoices/draft/{job_id}").get_json()
        self.assertTrue(draft["invoice_number"].startswith("INV-"))
        self.assertEqual(len(draft["items"]), 1)

        invoice = client.post("/invoices", {
            "job_id": job_id, "items": draft["items"],
            "place_of_supply": draft["place_of_supply"],
        })
        self.assertEqual(invoice.status_code, 201, invoice.get_json())
        invoice_id = invoice.get_json()["id"]

        detail = client.get(f"/invoices/{invoice_id}").get_json()
        self.assertEqual(float(detail["grand_total"]), 1180.00)
        self.assertEqual(detail["payment_status"], "Pending")
        self.assertIsNotNone(detail["due_date"])

        # Over-payment is refused; partial then full payment reconciles status.
        too_much = client.post("/payments", {"invoice_id": invoice_id, "payment_date": "2026-02-01", "amount": 5000, "status": "Received"})
        self.assertEqual(too_much.status_code, 400)
        client.post("/payments", {"invoice_id": invoice_id, "payment_date": "2026-02-01", "amount": 500, "status": "Received"})
        self.assertEqual(client.get(f"/invoices/{invoice_id}").get_json()["payment_status"], "Partial")
        client.post("/payments", {"invoice_id": invoice_id, "payment_date": "2026-02-02", "amount": 680, "status": "Received"})
        self.assertEqual(client.get(f"/invoices/{invoice_id}").get_json()["payment_status"], "Paid")

        dashboard = client.get("/dashboard").get_json()
        self.assertEqual(dashboard["invoice_value"], 1180.0)
        self.assertEqual(dashboard["outstanding_amount"], 0.0)


class LegacyPasswordTests(unittest.TestCase):
    def test_plaintext_password_can_sign_in_once_and_is_rehashed(self):
        from app.db import get_db_connection

        app = create_app()
        owner = Client(app, unique("Legacy Co "))
        username = unique("legacy")
        connection = get_db_connection()
        cursor = connection.cursor()
        cursor.execute(
            "INSERT INTO users (tenant_id, name, username, password, role) VALUES (%s, 'Old', %s, 'plain-secret', 'Accounts')",
            (owner.tenant_id, username),
        )
        connection.commit()

        fresh = app.test_client()
        self.assertEqual(fresh.post("/api/auth/login", json={"username": username, "password": "nope"}).status_code, 401)
        self.assertEqual(fresh.post("/api/auth/login", json={"username": username, "password": "plain-secret"}).status_code, 200)

        cursor.execute("SELECT password FROM users WHERE username = %s", (username,))
        self.assertTrue(cursor.fetchone()[0].startswith(("scrypt:", "pbkdf2:")))
        cursor.close()
        connection.close()
        # Still works after the upgrade to a hash.
        self.assertEqual(app.test_client().post("/api/auth/login", json={"username": username, "password": "plain-secret"}).status_code, 200)


class RateLimitTests(unittest.TestCase):
    def test_login_is_throttled_per_username(self):
        os.environ["RATE_LIMIT_DISABLED"] = "0"
        try:
            client = create_app().test_client()
            name = unique("victim")
            statuses = [
                client.post("/api/auth/login", json={"username": name, "password": "wrong"}).status_code
                for _ in range(10)
            ]
        finally:
            os.environ["RATE_LIMIT_DISABLED"] = "1"
        self.assertEqual(statuses[:8], [401] * 8)
        self.assertEqual(statuses[8], 429)


if __name__ == "__main__":
    unittest.main()
