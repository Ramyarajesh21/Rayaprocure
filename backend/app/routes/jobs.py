from flask import Blueprint, request
from app.db import get_db_connection

jobs_bp = Blueprint("jobs", __name__)


ALLOWED_STATUSES = ["Ongoing", "Completed"]


# ============================================================
# GET ALL JOBS
# ============================================================
@jobs_bp.route("/jobs", methods=["GET"])
def get_jobs():

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                jobs.id,
                jobs.quotation_id,

                quotations.description AS quotation_description,
                quotations.amount AS quotation_amount,
                quotations.subtotal AS quotation_subtotal,
                quotations.adjustment AS quotation_adjustment,
                quotations.grand_total AS quotation_grand_total,
                quotations.status AS quotation_status,

                rfqs.rfq_number,

                customers.id AS customer_id,
                customers.company_name,
                customers.contact_name,
                customers.phone,
                customers.email,

                jobs.job_name,
                jobs.start_date,
                jobs.status

            FROM jobs

            JOIN quotations
                ON jobs.quotation_id = quotations.id

            JOIN rfqs
                ON quotations.rfq_id = rfqs.id

            JOIN customers
                ON rfqs.customer_id = customers.id

            ORDER BY jobs.id DESC
        """)

        jobs = cursor.fetchall()

        return jobs, 200

    except Exception as error:
        print("Error fetching jobs:", error)

        return {
            "message": "Unable to fetch jobs."
        }, 500

    finally:
        cursor.close()
        connection.close()


# ============================================================
# GET SINGLE JOB
# ============================================================
@jobs_bp.route("/jobs/<int:id>", methods=["GET"])
def get_job(id):

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute("""
            SELECT
                jobs.id,
                jobs.quotation_id,

                quotations.description AS quotation_description,
                quotations.amount AS quotation_amount,
                quotations.subtotal AS quotation_subtotal,
                quotations.adjustment AS quotation_adjustment,
                quotations.grand_total AS quotation_grand_total,
                quotations.status AS quotation_status,

                rfqs.rfq_number,

                customers.id AS customer_id,
                customers.company_name,
                customers.contact_name,
                customers.phone,
                customers.email,

                jobs.job_name,
                jobs.start_date,
                jobs.status

            FROM jobs

            JOIN quotations
                ON jobs.quotation_id = quotations.id

            JOIN rfqs
                ON quotations.rfq_id = rfqs.id

            JOIN customers
                ON rfqs.customer_id = customers.id

            WHERE jobs.id = %s
        """, (id,))

        job = cursor.fetchone()

        if job:
            return job, 200

        return {
            "message": "Job not found"
        }, 404

    except Exception as error:
        print("Error fetching job:", error)

        return {
            "message": "Unable to fetch job."
        }, 500

    finally:
        cursor.close()
        connection.close()


# ============================================================
# POST - ADD JOB
# ============================================================
@jobs_bp.route("/jobs", methods=["POST"])
def add_job():

    data = request.get_json() or {}

    quotation_id = data.get("quotation_id")
    job_name = data.get("job_name")
    start_date = data.get("start_date")
    status = data.get("status", "Ongoing")

    # Validation
    if not quotation_id:
        return {
            "message": "Quotation is required."
        }, 400

    if not job_name or not job_name.strip():
        return {
            "message": "Job name is required."
        }, 400

    if not start_date:
        return {
            "message": "Start date is required."
        }, 400

    if status not in ALLOWED_STATUSES:
        return {
            "message": "Invalid job status."
        }, 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:

        # Check quotation
        cursor.execute("""
            SELECT id, status
            FROM quotations
            WHERE id = %s
        """, (quotation_id,))

        quotation = cursor.fetchone()

        if not quotation:
            return {
                "message": "Quotation not found."
            }, 404

        # Only Accepted quotation can become a Job
        if quotation["status"] != "Accepted":
            return {
                "message": "Only an Accepted quotation can be converted into a job."
            }, 400

        # Prevent the same quotation from creating multiple jobs
        cursor.execute("""
            SELECT id
            FROM jobs
            WHERE quotation_id = %s
        """, (quotation_id,))

        existing_job = cursor.fetchone()

        if existing_job:
            return {
                "message": "A job already exists for this quotation."
            }, 400

        cursor.execute("""
            INSERT INTO jobs
            (
                quotation_id,
                job_name,
                start_date,
                status
            )
            VALUES (%s, %s, %s, %s)
        """, (
            quotation_id,
            job_name.strip(),
            start_date,
            status
        ))

        connection.commit()

        return {
            "message": "Job added successfully",
            "id": cursor.lastrowid
        }, 201

    except Exception as error:
        connection.rollback()

        print("Error adding job:", error)

        return {
            "message": "Unable to add job."
        }, 500

    finally:
        cursor.close()
        connection.close()


# ============================================================
# PUT - UPDATE JOB
# ============================================================
@jobs_bp.route("/jobs/<int:id>", methods=["PUT"])
def update_job(id):

    data = request.get_json() or {}

    quotation_id = data.get("quotation_id")
    job_name = data.get("job_name")
    start_date = data.get("start_date")
    status = data.get("status")

    # Validation
    if not quotation_id:
        return {
            "message": "Quotation is required."
        }, 400

    if not job_name or not job_name.strip():
        return {
            "message": "Job name is required."
        }, 400

    if not start_date:
        return {
            "message": "Start date is required."
        }, 400

    if status not in ALLOWED_STATUSES:
        return {
            "message": "Invalid job status."
        }, 400

    connection = get_db_connection()
    cursor = connection.cursor(dictionary=True)

    try:

        # Check existing job
        cursor.execute("""
            SELECT id
            FROM jobs
            WHERE id = %s
        """, (id,))

        existing_job = cursor.fetchone()

        if not existing_job:
            return {
                "message": "Job not found."
            }, 404

        # Check quotation
        cursor.execute("""
            SELECT id, status
            FROM quotations
            WHERE id = %s
        """, (quotation_id,))

        quotation = cursor.fetchone()

        if not quotation:
            return {
                "message": "Quotation not found."
            }, 404

        # Quotation must be Accepted
        if quotation["status"] != "Accepted":
            return {
                "message": "Only an Accepted quotation can be linked to a job."
            }, 400

        # Prevent another job from using the same quotation
        cursor.execute("""
            SELECT id
            FROM jobs
            WHERE quotation_id = %s
              AND id != %s
        """, (quotation_id, id))

        duplicate_job = cursor.fetchone()

        if duplicate_job:
            return {
                "message": "A job already exists for this quotation."
            }, 400

        cursor.execute("""
            UPDATE jobs
            SET
                quotation_id = %s,
                job_name = %s,
                start_date = %s,
                status = %s
            WHERE id = %s
        """, (
            quotation_id,
            job_name.strip(),
            start_date,
            status,
            id
        ))

        connection.commit()

        return {
            "message": "Job updated successfully"
        }, 200

    except Exception as error:
        connection.rollback()

        print("Error updating job:", error)

        return {
            "message": "Unable to update job."
        }, 500

    finally:
        cursor.close()
        connection.close()


# ============================================================
# DELETE - DELETE JOB
# ============================================================
@jobs_bp.route("/jobs/<int:id>", methods=["DELETE"])
def delete_job(id):

    connection = get_db_connection()
    cursor = connection.cursor()

    try:

        cursor.execute(
            "DELETE FROM jobs WHERE id = %s",
            (id,)
        )

        if cursor.rowcount == 0:
            return {
                "message": "Job not found."
            }, 404

        connection.commit()

        return {
            "message": "Job deleted successfully"
        }, 200

    except Exception as error:
        connection.rollback()

        print("Error deleting job:", error)

        return {
            "message": "Unable to delete job."
        }, 500

    finally:
        cursor.close()
        connection.close()