from datetime import datetime
from decimal import Decimal

from flask import Blueprint, jsonify, request

from app.db import get_db_connection
from app.gst import parse_decimal
from app.security import tenant_id

jobs_bp = Blueprint("jobs", __name__)

ALLOWED_STATUSES = ["Not Started", "Ongoing", "On Hold", "Completed"]

JOB_SELECT = """
    jobs.id, jobs.quotation_id,
    quotations.quotation_number,
    quotations.description AS quotation_description,
    quotations.amount AS quotation_amount,
    quotations.subtotal AS quotation_subtotal,
    quotations.adjustment AS quotation_adjustment,
    quotations.grand_total AS quotation_grand_total,
    quotations.taxable_value AS quotation_taxable_value,
    quotations.status AS quotation_status,
    rfqs.rfq_number,
    customers.id AS customer_id, customers.company_name, customers.contact_name,
    customers.phone, customers.email,
    jobs.job_name, jobs.start_date, jobs.status, jobs.due_date, jobs.notes,
    jobs.assigned_to, users.name AS assignee_name,
    COALESCE((SELECT SUM(jc.amount) FROM job_costs jc WHERE jc.job_id = jobs.id), 0) AS costs_total,
    COALESCE((SELECT SUM(i.taxable_value) FROM invoices i WHERE i.job_id = jobs.id), 0) AS billed_taxable,
    (SELECT COUNT(*) FROM invoices i WHERE i.job_id = jobs.id) AS invoice_count
"""

JOB_FROM = """
    FROM jobs
    JOIN quotations ON jobs.quotation_id = quotations.id
    JOIN rfqs ON quotations.rfq_id = rfqs.id
    JOIN customers ON rfqs.customer_id = customers.id
    LEFT JOIN users ON users.id = jobs.assigned_to
"""


def add_margin(job):
    """Margin = job value (excl. GST) minus recorded costs."""
    value = float(job.get("quotation_taxable_value") or 0) or float(job.get("quotation_subtotal") or 0)
    costs = float(job.get("costs_total") or 0)
    job["job_value"] = round(value, 2)
    job["costs_total"] = round(costs, 2)
    job["margin"] = round(value - costs, 2)
    job["margin_percent"] = round((value - costs) * 100 / value, 1) if value else None
    job["billed_taxable"] = round(float(job.get("billed_taxable") or 0), 2)
    return job


def parse_job(cursor, data, require_status=True):
    """Validate a job payload; returns normalised values or raises ValueError."""
    quotation_id = data.get("quotation_id")
    job_name = str(data.get("job_name") or "").strip()
    start_date = data.get("start_date")
    status = data.get("status") or ("Ongoing" if not require_status else None)

    if not quotation_id:
        raise ValueError("Quotation is required.")
    if not job_name:
        raise ValueError("Job name is required.")
    if not start_date:
        raise ValueError("Start date is required.")
    if status not in ALLOWED_STATUSES:
        raise ValueError("Invalid job status.")

    due_date = data.get("due_date") or None
    try:
        started = datetime.strptime(start_date, "%Y-%m-%d").date()
        if due_date:
            due = datetime.strptime(due_date, "%Y-%m-%d").date()
            if due < started:
                raise ValueError("Due date cannot be before the start date.")
    except TypeError:
        raise ValueError("Dates must be valid.")
    except ValueError as error:
        if "Due date" in str(error):
            raise
        raise ValueError("Dates must be in YYYY-MM-DD format.")

    assigned_to = data.get("assigned_to") or None
    if assigned_to:
        cursor.execute(
            "SELECT id FROM users WHERE id = %s AND tenant_id = %s AND is_active = TRUE",
            (assigned_to, tenant_id()),
        )
        if not cursor.fetchone():
            raise ValueError("Choose a valid team member.")

    return {
        "quotation_id": quotation_id,
        "job_name": job_name,
        "start_date": start_date,
        "status": status,
        "due_date": due_date,
        "assigned_to": assigned_to,
        "notes": str(data.get("notes") or "").strip() or None,
    }


def fetch_accepted_quotation(cursor, quotation_id, verb):
    cursor.execute(
        "SELECT id, status FROM quotations WHERE id = %s AND tenant_id = %s",
        (quotation_id, tenant_id()),
    )
    quotation = cursor.fetchone()
    if not quotation:
        return None, ({"message": "Quotation not found."}, 404)
    if quotation["status"] != "Accepted":
        return None, ({"message": f"Only an Accepted quotation can be {verb} a job."}, 400)
    return quotation, None


# ============================================================
# LIST / GET
# ============================================================
@jobs_bp.route("/jobs", methods=["GET"])
def get_jobs():
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            f"SELECT {JOB_SELECT} {JOB_FROM} WHERE jobs.tenant_id = %s ORDER BY jobs.id DESC",
            (tenant_id(),),
        )
        return jsonify([add_margin(job) for job in cursor.fetchall()]), 200
    except Exception as error:
        print("Error fetching jobs:", error)
        return {"message": "Unable to fetch jobs."}, 500
    finally:
        cursor.close()
        connection.close()


@jobs_bp.route("/jobs/<int:id>", methods=["GET"])
def get_job(id):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            f"SELECT {JOB_SELECT} {JOB_FROM} WHERE jobs.id = %s AND jobs.tenant_id = %s",
            (id, tenant_id()),
        )
        job = cursor.fetchone()
        if not job:
            return {"message": "Job not found"}, 404
        return jsonify(add_margin(job)), 200
    except Exception as error:
        print("Error fetching job:", error)
        return {"message": "Unable to fetch job."}, 500
    finally:
        cursor.close()
        connection.close()


# ============================================================
# CREATE / UPDATE / DELETE
# ============================================================
@jobs_bp.route("/jobs", methods=["POST"])
def add_job():
    data = request.get_json() or {}
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        values = parse_job(cursor, data, require_status=False)
        _, error = fetch_accepted_quotation(cursor, values["quotation_id"], "converted into")
        if error:
            return error

        cursor.execute(
            "SELECT id FROM jobs WHERE quotation_id = %s AND tenant_id = %s",
            (values["quotation_id"], tenant_id()),
        )
        if cursor.fetchone():
            return {"message": "A job already exists for this quotation."}, 400

        cursor.execute(
            """INSERT INTO jobs (tenant_id, quotation_id, job_name, start_date, status,
                                 due_date, assigned_to, notes)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s)""",
            (tenant_id(), values["quotation_id"], values["job_name"], values["start_date"],
             values["status"], values["due_date"], values["assigned_to"], values["notes"]),
        )
        connection.commit()
        return {"message": "Job added successfully", "id": cursor.lastrowid}, 201
    except ValueError as error:
        connection.rollback()
        return {"message": str(error)}, 400
    except Exception as error:
        connection.rollback()
        print("Error adding job:", error)
        return {"message": "Unable to add job."}, 500
    finally:
        cursor.close()
        connection.close()


@jobs_bp.route("/jobs/<int:id>", methods=["PUT"])
def update_job(id):
    data = request.get_json() or {}
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        values = parse_job(cursor, data)

        cursor.execute("SELECT id FROM jobs WHERE id = %s AND tenant_id = %s", (id, tenant_id()))
        if not cursor.fetchone():
            return {"message": "Job not found."}, 404

        _, error = fetch_accepted_quotation(cursor, values["quotation_id"], "linked to")
        if error:
            return error

        cursor.execute(
            "SELECT id FROM jobs WHERE quotation_id = %s AND tenant_id = %s AND id != %s",
            (values["quotation_id"], tenant_id(), id),
        )
        if cursor.fetchone():
            return {"message": "A job already exists for this quotation."}, 400

        cursor.execute(
            """UPDATE jobs SET quotation_id = %s, job_name = %s, start_date = %s, status = %s,
                               due_date = %s, assigned_to = %s, notes = %s
               WHERE id = %s AND tenant_id = %s""",
            (values["quotation_id"], values["job_name"], values["start_date"], values["status"],
             values["due_date"], values["assigned_to"], values["notes"], id, tenant_id()),
        )
        connection.commit()
        return {"message": "Job updated successfully"}, 200
    except ValueError as error:
        connection.rollback()
        return {"message": str(error)}, 400
    except Exception as error:
        connection.rollback()
        print("Error updating job:", error)
        return {"message": "Unable to update job."}, 500
    finally:
        cursor.close()
        connection.close()


@jobs_bp.route("/jobs/<int:id>", methods=["DELETE"])
def delete_job(id):
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute("DELETE FROM jobs WHERE id = %s AND tenant_id = %s", (id, tenant_id()))
        if cursor.rowcount == 0:
            return {"message": "Job not found."}, 404
        connection.commit()
        return {"message": "Job deleted successfully"}, 200
    except Exception as error:
        connection.rollback()
        if getattr(error, "errno", None) == 1451:
            return {"message": "This job has invoices and cannot be deleted."}, 409
        print("Error deleting job:", error)
        return {"message": "Unable to delete job."}, 500
    finally:
        cursor.close()
        connection.close()


# ============================================================
# JOB COSTS (for margin tracking)
# ============================================================
@jobs_bp.route("/jobs/<int:id>/costs", methods=["GET"])
def list_costs(id):
    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(
            """SELECT id, description, amount, cost_date FROM job_costs
               WHERE job_id = %s AND tenant_id = %s ORDER BY cost_date DESC, id DESC""",
            (id, tenant_id()),
        )
        return jsonify(cursor.fetchall()), 200
    finally:
        cursor.close()
        connection.close()


@jobs_bp.route("/jobs/<int:id>/costs", methods=["POST"])
def add_cost(id):
    data = request.get_json() or {}
    description = str(data.get("description") or "").strip()
    if not description:
        return {"message": "Describe the cost."}, 400
    try:
        amount = parse_decimal(data.get("amount"), "Amount", minimum=Decimal("0"))
        cost_date = datetime.strptime(data.get("cost_date") or datetime.today().strftime("%Y-%m-%d"), "%Y-%m-%d").date()
    except ValueError as error:
        return {"message": str(error) if "Amount" in str(error) else "Cost date must be a valid date."}, 400

    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute("SELECT id FROM jobs WHERE id = %s AND tenant_id = %s", (id, tenant_id()))
        if not cursor.fetchone():
            return {"message": "Job not found."}, 404
        cursor.execute(
            """INSERT INTO job_costs (tenant_id, job_id, description, amount, cost_date)
               VALUES (%s, %s, %s, %s, %s)""",
            (tenant_id(), id, description[:255], amount, cost_date),
        )
        connection.commit()
        return {"message": "Cost added.", "id": cursor.lastrowid}, 201
    except Exception as error:
        connection.rollback()
        print("Error adding job cost:", error)
        return {"message": "Unable to add the cost."}, 500
    finally:
        cursor.close()
        connection.close()


@jobs_bp.route("/jobs/costs/<int:cost_id>", methods=["DELETE"])
def delete_cost(cost_id):
    connection = get_db_connection()
    cursor = connection.cursor()
    try:
        cursor.execute("DELETE FROM job_costs WHERE id = %s AND tenant_id = %s", (cost_id, tenant_id()))
        connection.commit()
        if cursor.rowcount == 0:
            return {"message": "Cost not found."}, 404
        return {"message": "Cost removed."}, 200
    finally:
        cursor.close()
        connection.close()
