"""Tests for quotation revisions, job execution/margins and milestone billing."""

import os
import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

os.environ.setdefault("SECRET_KEY", "test-secret-key")
os.environ["RATE_LIMIT_DISABLED"] = "1"

if os.getenv("DB_NAME", "rayaprocure_db") == "rayaprocure_db":
    raise SystemExit("Refusing to run tests against rayaprocure_db. Set DB_NAME to a test database.")

from app import create_app  # noqa: E402
from test_api import Client, VALID_GSTIN_MH, unique  # noqa: E402


class WorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.c = Client(cls.app, unique("Flow Co "))
        cls.other = Client(cls.app, unique("Other Flow Co "))
        cls.c.put("/api/company", {"gstin": VALID_GSTIN_MH})

    def quotation(self, status=None):
        customer = self.c.post("/customers", {"company_name": unique("Cust "), "state_code": "27"}).get_json()["id"]
        rfq = self.c.post("/rfqs", {"customer_id": customer, "request_date": "2026-01-01"}).get_json()["id"]
        quotation = self.c.post("/quotations", {
            "rfq_id": rfq,
            "items": [
                {"description": "Design", "unit": "Job", "quantity": 1, "rate": 10000, "gst_rate": 18},
                {"description": "Build", "unit": "Job", "quantity": 1, "rate": 30000, "gst_rate": 18},
            ],
        }).get_json()["id"]
        if status:
            self.c.post(f"/quotations/{quotation}/decision", {"decision": status})
        return quotation

    # -- revisions -------------------------------------------------------
    def test_revise_creates_new_version_and_marks_old(self):
        original = self.quotation()
        detail = self.c.get(f"/quotations/{original}").get_json()

        revised = self.c.post(f"/quotations/{original}/revise")
        self.assertEqual(revised.status_code, 201, revised.get_json())
        new_id = revised.get_json()["id"]
        self.assertEqual(revised.get_json()["quotation_number"], f"{detail['quotation_number']}-R1")

        self.assertEqual(self.c.get(f"/quotations/{original}").get_json()["status"], "Revised")
        self.assertEqual(self.c.get(f"/quotations/{original}").get_json()["revised_by_id"], new_id)
        copy = self.c.get(f"/quotations/{new_id}").get_json()
        self.assertEqual(copy["status"], "Draft")
        self.assertEqual(len(copy["items"]), 2)
        self.assertEqual(float(copy["grand_total"]), float(detail["grand_total"]))

        # A superseded version cannot be revised again, but the latest can (-R2).
        self.assertEqual(self.c.post(f"/quotations/{original}/revise").status_code, 409)
        second = self.c.post(f"/quotations/{new_id}/revise")
        self.assertTrue(second.get_json()["quotation_number"].endswith("-R2"))

    def test_revised_quotation_cannot_be_accepted_by_customer(self):
        original = self.quotation()
        share = self.c.post("/api/email/share-link", {"entity_type": "quotation", "entity_id": original})
        token = share.get_json()["url"].rsplit("/", 1)[-1]
        self.c.post(f"/quotations/{original}/revise")
        portal = self.app.test_client()
        self.assertFalse(portal.get(f"/api/public/{token}").get_json()["canRespond"])
        response = portal.post(f"/api/public/{token}/respond", json={"decision": "Accepted", "name": "Someone"})
        self.assertEqual(response.status_code, 409)

    def test_cannot_revise_quotation_with_a_job_or_other_tenants(self):
        accepted = self.quotation("Accepted")
        self.c.post("/jobs", {"quotation_id": accepted, "job_name": "J", "start_date": "2026-01-05"})
        self.assertEqual(self.c.post(f"/quotations/{accepted}/revise").status_code, 409)
        self.assertEqual(self.other.post(f"/quotations/{accepted}/revise").status_code, 404)

    # -- jobs ------------------------------------------------------------
    def test_job_execution_fields_costs_and_margin(self):
        quotation = self.quotation("Accepted")
        me = self.c.get("/api/auth/me").get_json()["user"]
        created = self.c.post("/jobs", {
            "quotation_id": quotation, "job_name": "Install", "start_date": "2026-01-05",
            "status": "Not Started", "due_date": "2026-02-01", "assigned_to": me["id"], "notes": "Bring ladder",
        })
        self.assertEqual(created.status_code, 201, created.get_json())
        job_id = created.get_json()["id"]

        job = self.c.get(f"/jobs/{job_id}").get_json()
        self.assertEqual(job["status"], "Not Started")
        self.assertEqual(job["assignee_name"], "Owner")
        self.assertEqual(job["job_value"], 40000.0)  # excludes GST
        self.assertEqual(job["margin"], 40000.0)

        self.assertEqual(self.c.post(f"/jobs/{job_id}/costs", {"description": "Materials", "amount": 12000}).status_code, 201)
        cost = self.c.post(f"/jobs/{job_id}/costs", {"description": "Labour", "amount": 8000}).get_json()["id"]
        job = self.c.get(f"/jobs/{job_id}").get_json()
        self.assertEqual(job["costs_total"], 20000.0)
        self.assertEqual(job["margin"], 20000.0)
        self.assertEqual(job["margin_percent"], 50.0)

        self.assertEqual(self.c.delete(f"/jobs/costs/{cost}").status_code, 200)
        self.assertEqual(self.c.get(f"/jobs/{job_id}").get_json()["costs_total"], 12000.0)

        # Isolation and validation.
        self.assertEqual(self.other.get(f"/jobs/{job_id}/costs").get_json(), [])
        self.assertEqual(self.other.post(f"/jobs/{job_id}/costs", {"description": "x", "amount": 1}).status_code, 404)
        self.assertEqual(self.c.post(f"/jobs/{job_id}/costs", {"description": "Bad", "amount": -5}).status_code, 400)
        bad_status = self.c.put(f"/jobs/{job_id}", {"quotation_id": quotation, "job_name": "x", "start_date": "2026-01-05", "status": "Nope"})
        self.assertEqual(bad_status.status_code, 400)
        bad_due = self.c.put(f"/jobs/{job_id}", {"quotation_id": quotation, "job_name": "x", "start_date": "2026-01-05",
                                                 "status": "Ongoing", "due_date": "2025-01-01"})
        self.assertEqual(bad_due.status_code, 400)

    def test_cannot_assign_job_to_another_tenants_user(self):
        stranger = self.other.get("/api/auth/me").get_json()["user"]["id"]
        quotation = self.quotation("Accepted")
        response = self.c.post("/jobs", {"quotation_id": quotation, "job_name": "J", "start_date": "2026-01-05", "assigned_to": stranger})
        self.assertEqual(response.status_code, 400)

    # -- milestone billing -------------------------------------------------
    def test_milestone_invoices_for_one_job(self):
        quotation = self.quotation("Accepted")
        job = self.c.post("/jobs", {"quotation_id": quotation, "job_name": "Phase job", "start_date": "2026-01-05"}).get_json()["id"]

        advance = self.c.get(f"/invoices/draft/{job}?percent=30").get_json()
        self.assertEqual(advance["milestone_label"], "30% milestone")
        self.assertEqual(advance["invoice_count"], 0)
        self.assertEqual(advance["quote_total"], 47200.0)
        first = self.c.post("/invoices", {"job_id": job, "items": advance["items"], "milestone_label": advance["milestone_label"],
                                          "place_of_supply": advance["place_of_supply"]})
        self.assertEqual(first.status_code, 201, first.get_json())
        detail = self.c.get(f"/invoices/{first.get_json()['id']}").get_json()
        self.assertEqual(detail["milestone_label"], "30% milestone")
        self.assertEqual(float(detail["taxable_value"]), 12000.0)
        self.assertEqual(float(detail["grand_total"]), 14160.0)

        # The remaining 70% goes on a second invoice for the same job.
        balance = self.c.get(f"/invoices/draft/{job}?percent=70").get_json()
        self.assertEqual(balance["invoice_count"], 1)
        self.assertEqual(balance["billed_so_far"], 14160.0)
        self.assertEqual(balance["remaining"], 33040.0)
        second = self.c.post("/invoices", {"job_id": job, "items": balance["items"], "milestone_label": "Balance 70%",
                                           "place_of_supply": balance["place_of_supply"]})
        self.assertEqual(second.status_code, 201, second.get_json())
        self.assertNotEqual(first.get_json()["invoice_number"], second.get_json()["invoice_number"])

        job_view = self.c.get(f"/jobs/{job}").get_json()
        self.assertEqual(job_view["invoice_count"], 2)
        self.assertEqual(job_view["billed_taxable"], 40000.0)

        self.assertEqual(self.c.get(f"/invoices/draft/{job}?percent=0").status_code, 400)
        self.assertEqual(self.c.get(f"/invoices/draft/{job}?percent=150").status_code, 400)

    def test_dashboard_still_counts_after_changes(self):
        dashboard = self.c.get("/dashboard").get_json()
        self.assertIn("total_jobs", dashboard)
        self.assertEqual(self.other.get("/dashboard").get_json()["total_jobs"], 0)


if __name__ == "__main__":
    unittest.main()
