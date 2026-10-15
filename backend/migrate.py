"""Idempotent schema migrations for RayaProcure.

Usage (from the backend folder, after importing schema.sql once):

    python migrate.py

Every migration is recorded in ``schema_migrations`` and every step checks
INFORMATION_SCHEMA first, so re-running is always safe.  Set ``DB_NAME`` in
the environment to migrate a different database (for example a test copy).
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.db import get_db_connection  # noqa: E402  (needs .env loaded first)


# Tables that hold tenant-owned business data.
TENANT_TABLES = [
    "users",
    "company_settings",
    "customers",
    "rfqs",
    "quotations",
    "jobs",
    "invoices",
    "payments",
    "attachments",
    "notifications",
    "audit_logs",
]


class Db:
    """Small helper around a cursor with existence-checked DDL."""

    def __init__(self, connection):
        self.connection = connection
        self.cursor = connection.cursor()

    def run(self, sql, params=None):
        self.cursor.execute(sql, params or ())

    def scalar(self, sql, params=None):
        self.cursor.execute(sql, params or ())
        row = self.cursor.fetchone()
        return row[0] if row else None

    def column_exists(self, table, column):
        return bool(self.scalar(
            """SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema = DATABASE() AND table_name = %s AND column_name = %s""",
            (table, column),
        ))

    def index_exists(self, table, index):
        return bool(self.scalar(
            """SELECT COUNT(*) FROM information_schema.statistics
               WHERE table_schema = DATABASE() AND table_name = %s AND index_name = %s""",
            (table, index),
        ))

    def table_exists(self, table):
        return bool(self.scalar(
            """SELECT COUNT(*) FROM information_schema.tables
               WHERE table_schema = DATABASE() AND table_name = %s""",
            (table,),
        ))

    def fk_exists(self, table, name):
        return bool(self.scalar(
            """SELECT COUNT(*) FROM information_schema.table_constraints
               WHERE table_schema = DATABASE() AND table_name = %s
                 AND constraint_name = %s AND constraint_type = 'FOREIGN KEY'""",
            (table, name),
        ))

    def add_column(self, table, column, definition):
        if not self.column_exists(table, column):
            self.run(f"ALTER TABLE `{table}` ADD COLUMN `{column}` {definition}")

    def add_index(self, table, index, columns, unique=False):
        if not self.index_exists(table, index):
            kind = "UNIQUE INDEX" if unique else "INDEX"
            self.run(f"ALTER TABLE `{table}` ADD {kind} `{index}` ({columns})")

    def drop_index(self, table, index):
        if self.index_exists(table, index):
            self.run(f"ALTER TABLE `{table}` DROP INDEX `{index}`")

    def add_fk(self, table, name, column, ref_table, ref_column="id", on_delete="RESTRICT"):
        if not self.fk_exists(table, name):
            self.run(
                f"""ALTER TABLE `{table}` ADD CONSTRAINT `{name}`
                    FOREIGN KEY (`{column}`) REFERENCES `{ref_table}` (`{ref_column}`)
                    ON UPDATE CASCADE ON DELETE {on_delete}"""
            )


# ---------------------------------------------------------------------------
# 003 - multi-tenancy
# ---------------------------------------------------------------------------
def m003_multi_tenancy(db):
    db.run(
        """
        CREATE TABLE IF NOT EXISTS tenants (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            name VARCHAR(200) NOT NULL,
            slug VARCHAR(80) NOT NULL,
            plan VARCHAR(32) NOT NULL DEFAULT 'trial',
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_tenants_slug (slug)
        ) ENGINE=InnoDB
        """
    )

    # Existing single-company data becomes tenant 1.
    if not db.scalar("SELECT COUNT(*) FROM tenants"):
        name = None
        if db.table_exists("company_settings"):
            name = db.scalar("SELECT company_name FROM company_settings ORDER BY id LIMIT 1")
        db.run(
            "INSERT INTO tenants (id, name, slug, plan) VALUES (1, %s, 'default', 'trial')",
            (name or "My Company",),
        )

    for table in TENANT_TABLES:
        if not db.column_exists(table, "tenant_id"):
            db.run(f"ALTER TABLE `{table}` ADD COLUMN `tenant_id` INT UNSIGNED NOT NULL DEFAULT 1")
            # Drop the default afterwards so a forgotten tenant filter fails loudly.
            db.run(f"ALTER TABLE `{table}` ALTER COLUMN `tenant_id` DROP DEFAULT")
        db.add_index(table, f"idx_{table}_tenant", "`tenant_id`")
        db.add_fk(table, f"fk_{table}_tenant", "tenant_id", "tenants")

    # Business numbers only need to be unique inside one tenant.
    for table, old, new, column in (
        ("rfqs", "uq_rfqs_number", "uq_rfqs_tenant_number", "rfq_number"),
        ("quotations", "uq_quotations_number", "uq_quotations_tenant_number", "quotation_number"),
        ("invoices", "uq_invoices_number", "uq_invoices_tenant_number", "invoice_number"),
    ):
        db.add_index(table, new, f"`tenant_id`, `{column}`", unique=True)
        db.drop_index(table, old)

    # One settings row per tenant.
    db.add_index("company_settings", "uq_company_settings_tenant", "`tenant_id`", unique=True)


# ---------------------------------------------------------------------------
# 004 - GST fields (India)
# ---------------------------------------------------------------------------
def m004_gst(db):
    # Older databases may predate columns that schema.sql's upgrade section adds.
    legacy = {
        "company_settings": {
            "business_type": "VARCHAR(150) NOT NULL DEFAULT ''",
            "tax_number": "VARCHAR(80) NOT NULL DEFAULT ''",
            "website": "VARCHAR(200) NOT NULL DEFAULT ''",
            "logo_url": "VARCHAR(500) NOT NULL DEFAULT ''",
            "currency": "CHAR(3) NOT NULL DEFAULT 'INR'",
            "date_format": "VARCHAR(30) NOT NULL DEFAULT 'DD/MM/YYYY'",
        },
        "users": {"email": "VARCHAR(150) NULL", "is_active": "BOOLEAN NOT NULL DEFAULT TRUE"},
        "quotations": {
            "subtotal": "DECIMAL(14, 2) NOT NULL DEFAULT 0.00",
            "adjustment": "DECIMAL(14, 2) NOT NULL DEFAULT 0.00",
            "grand_total": "DECIMAL(14, 2) NOT NULL DEFAULT 0.00",
            "notes": "TEXT NULL",
            "terms_conditions": "TEXT NULL",
            "approved_by": "INT UNSIGNED NULL",
            "approved_at": "DATETIME NULL",
        },
        "invoices": {
            "subtotal": "DECIMAL(14, 2) NOT NULL DEFAULT 0.00",
            "adjustment": "DECIMAL(14, 2) NOT NULL DEFAULT 0.00",
            "grand_total": "DECIMAL(14, 2) NOT NULL DEFAULT 0.00",
            "notes": "TEXT NULL",
            "terms_conditions": "TEXT NULL",
            "approved_by": "INT UNSIGNED NULL",
            "approved_at": "DATETIME NULL",
        },
    }
    for table, columns in legacy.items():
        for column, definition in columns.items():
            db.add_column(table, column, definition)
    db.run("UPDATE invoices SET subtotal = amount, grand_total = amount WHERE subtotal = 0 AND grand_total = 0")
    db.run("UPDATE quotations SET subtotal = amount, grand_total = amount WHERE subtotal = 0 AND grand_total = 0")

    company = {
        "gstin": "VARCHAR(15) NOT NULL DEFAULT ''",
        "pan": "VARCHAR(10) NOT NULL DEFAULT ''",
        "state_code": "CHAR(2) NULL",
        "gst_registered": "BOOLEAN NOT NULL DEFAULT FALSE",
        "round_off_enabled": "BOOLEAN NOT NULL DEFAULT TRUE",
        "bank_name": "VARCHAR(120) NOT NULL DEFAULT ''",
        "bank_account_name": "VARCHAR(120) NOT NULL DEFAULT ''",
        "bank_account_no": "VARCHAR(40) NOT NULL DEFAULT ''",
        "bank_ifsc": "VARCHAR(20) NOT NULL DEFAULT ''",
        "bank_branch": "VARCHAR(120) NOT NULL DEFAULT ''",
        "upi_id": "VARCHAR(80) NOT NULL DEFAULT ''",
        "rfq_prefix": "VARCHAR(20) NOT NULL DEFAULT 'RFQ-'",
        "quotation_prefix": "VARCHAR(20) NOT NULL DEFAULT 'QTN-'",
        "invoice_prefix": "VARCHAR(20) NOT NULL DEFAULT 'INV-'",
        "number_width": "TINYINT UNSIGNED NOT NULL DEFAULT 4",
        "quotation_valid_days": "SMALLINT UNSIGNED NOT NULL DEFAULT 15",
        "invoice_due_days": "SMALLINT UNSIGNED NOT NULL DEFAULT 15",
        "default_quotation_terms": "TEXT NULL",
        "default_quotation_notes": "TEXT NULL",
        "default_invoice_terms": "TEXT NULL",
        "default_invoice_notes": "TEXT NULL",
        "brand_color": "VARCHAR(9) NOT NULL DEFAULT '#1f4e79'",
        "signature_url": "VARCHAR(500) NOT NULL DEFAULT ''",
        "authorised_signatory": "VARCHAR(150) NOT NULL DEFAULT ''",
    }
    for column, definition in company.items():
        db.add_column("company_settings", column, definition)

    # Older single-company installs stored the tax number in tax_number.
    db.run(
        """UPDATE company_settings
           SET gstin = UPPER(tax_number), gst_registered = TRUE,
               state_code = SUBSTRING(tax_number, 1, 2)
           WHERE gstin = '' AND CHAR_LENGTH(tax_number) = 15"""
    )

    customer = {
        "gstin": "VARCHAR(15) NOT NULL DEFAULT ''",
        "pan": "VARCHAR(10) NOT NULL DEFAULT ''",
        "state_code": "CHAR(2) NULL",
        "billing_address": "TEXT NULL",
        "shipping_address": "TEXT NULL",
        "payment_terms_days": "SMALLINT UNSIGNED NULL",
    }
    for column, definition in customer.items():
        db.add_column("customers", column, definition)

    document_totals = {
        "place_of_supply": "CHAR(2) NULL",
        "supply_type": "VARCHAR(8) NOT NULL DEFAULT 'none'",
        "taxable_value": "DECIMAL(14, 2) NOT NULL DEFAULT 0.00",
        "cgst_total": "DECIMAL(14, 2) NOT NULL DEFAULT 0.00",
        "sgst_total": "DECIMAL(14, 2) NOT NULL DEFAULT 0.00",
        "igst_total": "DECIMAL(14, 2) NOT NULL DEFAULT 0.00",
        "total_tax": "DECIMAL(14, 2) NOT NULL DEFAULT 0.00",
        "round_off": "DECIMAL(6, 2) NOT NULL DEFAULT 0.00",
    }
    for table in ("quotations", "invoices"):
        for column, definition in document_totals.items():
            db.add_column(table, column, definition)
        db.run(f"UPDATE `{table}` SET taxable_value = subtotal WHERE taxable_value = 0 AND subtotal > 0")

    db.add_column("invoices", "reverse_charge", "BOOLEAN NOT NULL DEFAULT FALSE")
    db.add_column("invoices", "irn", "VARCHAR(64) NULL")
    db.add_column("invoices", "ack_no", "VARCHAR(30) NULL")
    db.add_column("invoices", "ack_date", "DATETIME NULL")
    db.add_column("invoices", "e_invoice_status", "VARCHAR(20) NOT NULL DEFAULT 'NotApplicable'")
    db.add_column("invoices", "eway_bill_no", "VARCHAR(20) NULL")

    line_columns = {
        "hsn_sac": "VARCHAR(10) NOT NULL DEFAULT ''",
        "discount_percent": "DECIMAL(5, 2) NOT NULL DEFAULT 0.00",
        "gst_rate": "DECIMAL(5, 2) NOT NULL DEFAULT 0.00",
        "taxable_amount": "DECIMAL(14, 2) NOT NULL DEFAULT 0.00",
        "cgst_amount": "DECIMAL(14, 2) NOT NULL DEFAULT 0.00",
        "sgst_amount": "DECIMAL(14, 2) NOT NULL DEFAULT 0.00",
        "igst_amount": "DECIMAL(14, 2) NOT NULL DEFAULT 0.00",
        "total_amount": "DECIMAL(14, 2) NOT NULL DEFAULT 0.00",
    }
    for table in ("quotation_items", "invoice_items"):
        for column, definition in line_columns.items():
            db.add_column(table, column, definition)
        db.run(
            f"""UPDATE `{table}` SET taxable_amount = amount, total_amount = amount
                WHERE taxable_amount = 0 AND total_amount = 0"""
        )

    db.add_column("payments", "method", "VARCHAR(30) NOT NULL DEFAULT 'Bank Transfer'")
    db.add_column("payments", "reference", "VARCHAR(120) NOT NULL DEFAULT ''")
    db.add_column("payments", "notes", "VARCHAR(255) NOT NULL DEFAULT ''")


# ---------------------------------------------------------------------------
# 005 - catalog, templates, email, sharing portal, reminders
# ---------------------------------------------------------------------------
def m005_platform(db):
    db.run(
        """
        CREATE TABLE IF NOT EXISTS catalog_items (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            tenant_id INT UNSIGNED NOT NULL,
            name VARCHAR(200) NOT NULL,
            description VARCHAR(500) NOT NULL DEFAULT '',
            hsn_sac VARCHAR(10) NOT NULL DEFAULT '',
            unit VARCHAR(50) NOT NULL DEFAULT 'Nos',
            rate DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
            gst_rate DECIMAL(5, 2) NOT NULL DEFAULT 18.00,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_catalog_items_tenant (tenant_id, is_active),
            CONSTRAINT fk_catalog_items_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
        ) ENGINE=InnoDB
        """
    )
    db.run(
        """
        CREATE TABLE IF NOT EXISTS document_templates (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            tenant_id INT UNSIGNED NOT NULL,
            doc_type VARCHAR(20) NOT NULL,
            name VARCHAR(120) NOT NULL,
            is_default BOOLEAN NOT NULL DEFAULT FALSE,
            layout JSON NULL,
            custom_html MEDIUMTEXT NULL,
            custom_css MEDIUMTEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_document_templates_tenant (tenant_id, doc_type),
            CONSTRAINT fk_document_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
        ) ENGINE=InnoDB
        """
    )
    db.run(
        """
        CREATE TABLE IF NOT EXISTS tenant_email_settings (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            tenant_id INT UNSIGNED NOT NULL,
            smtp_host VARCHAR(200) NOT NULL DEFAULT '',
            smtp_port INT UNSIGNED NOT NULL DEFAULT 587,
            smtp_user VARCHAR(200) NOT NULL DEFAULT '',
            smtp_password_enc TEXT NULL,
            security VARCHAR(10) NOT NULL DEFAULT 'starttls',
            from_email VARCHAR(200) NOT NULL DEFAULT '',
            from_name VARCHAR(200) NOT NULL DEFAULT '',
            reply_to VARCHAR(200) NOT NULL DEFAULT '',
            signature TEXT NULL,
            last_test_status VARCHAR(20) NULL,
            last_test_at DATETIME NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_tenant_email_settings_tenant (tenant_id),
            CONSTRAINT fk_tenant_email_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
        ) ENGINE=InnoDB
        """
    )
    db.run(
        """
        CREATE TABLE IF NOT EXISTS email_logs (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            tenant_id INT UNSIGNED NOT NULL,
            kind VARCHAR(20) NOT NULL DEFAULT 'Document',
            entity_type VARCHAR(20) NULL,
            entity_id INT UNSIGNED NULL,
            to_email VARCHAR(255) NOT NULL,
            subject VARCHAR(255) NOT NULL,
            status VARCHAR(10) NOT NULL,
            error VARCHAR(500) NULL,
            sent_by INT UNSIGNED NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_email_logs_entity (tenant_id, entity_type, entity_id),
            CONSTRAINT fk_email_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
        ) ENGINE=InnoDB
        """
    )
    db.run(
        """
        CREATE TABLE IF NOT EXISTS document_shares (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            tenant_id INT UNSIGNED NOT NULL,
            entity_type VARCHAR(20) NOT NULL,
            entity_id INT UNSIGNED NOT NULL,
            token CHAR(43) NOT NULL,
            expires_at DATETIME NULL,
            first_viewed_at DATETIME NULL,
            last_viewed_at DATETIME NULL,
            view_count INT UNSIGNED NOT NULL DEFAULT 0,
            revoked BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_document_shares_token (token),
            KEY idx_document_shares_entity (tenant_id, entity_type, entity_id),
            CONSTRAINT fk_document_shares_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
        ) ENGINE=InnoDB
        """
    )
    db.run(
        """
        CREATE TABLE IF NOT EXISTS reminder_settings (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            tenant_id INT UNSIGNED NOT NULL,
            enabled BOOLEAN NOT NULL DEFAULT FALSE,
            invoice_before_due_days VARCHAR(40) NOT NULL DEFAULT '3',
            invoice_overdue_days VARCHAR(40) NOT NULL DEFAULT '1,7,14,30',
            quote_followup_days VARCHAR(40) NOT NULL DEFAULT '3,7',
            quote_expiry_notice_days VARCHAR(40) NOT NULL DEFAULT '2',
            copy_owner BOOLEAN NOT NULL DEFAULT TRUE,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_reminder_settings_tenant (tenant_id),
            CONSTRAINT fk_reminder_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
        ) ENGINE=InnoDB
        """
    )
    db.run(
        """
        CREATE TABLE IF NOT EXISTS reminder_logs (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
            tenant_id INT UNSIGNED NOT NULL,
            entity_type VARCHAR(20) NOT NULL,
            entity_id INT UNSIGNED NOT NULL,
            stage VARCHAR(40) NOT NULL,
            status VARCHAR(10) NOT NULL,
            detail VARCHAR(255) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_reminder_stage (tenant_id, entity_type, entity_id, stage),
            CONSTRAINT fk_reminder_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id)
        ) ENGINE=InnoDB
        """
    )

    db.add_column("quotations", "sent_at", "DATETIME NULL")
    db.add_column("quotations", "responded_at", "DATETIME NULL")
    db.add_column("quotations", "response_note", "VARCHAR(500) NULL")
    db.add_column("quotations", "responded_by_name", "VARCHAR(150) NULL")
    db.add_column("invoices", "sent_at", "DATETIME NULL")

    # Every existing tenant gets a default (disabled) reminder configuration.
    db.run(
        """INSERT INTO reminder_settings (tenant_id)
           SELECT id FROM tenants
           WHERE id NOT IN (SELECT tenant_id FROM reminder_settings)"""
    )


def replace_check(db, table, name, condition):
    """Swap a CHECK constraint (MySQL 8.0.16+)."""
    exists = db.scalar(
        """SELECT COUNT(*) FROM information_schema.table_constraints
           WHERE table_schema = DATABASE() AND table_name = %s
             AND constraint_name = %s AND constraint_type = 'CHECK'""",
        (table, name),
    )
    if exists:
        db.run(f"ALTER TABLE `{table}` DROP CHECK `{name}`")
    db.run(f"ALTER TABLE `{table}` ADD CONSTRAINT `{name}` CHECK ({condition})")


# ---------------------------------------------------------------------------
# 006 - quotation revisions, job execution, milestone billing
# ---------------------------------------------------------------------------
def m006_workflow(db):
    # Quotation revisions: a revised copy points at the quotation it replaces.
    db.add_column("quotations", "revision_of", "INT UNSIGNED NULL")
    db.add_column("quotations", "revision_no", "SMALLINT UNSIGNED NOT NULL DEFAULT 0")
    db.add_index("quotations", "idx_quotations_revision_of", "`revision_of`")
    replace_check(
        db, "quotations", "chk_quotations_status",
        "`status` IN ('Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Revised')",
    )

    # Job execution basics.
    db.add_column("jobs", "assigned_to", "INT UNSIGNED NULL")
    db.add_column("jobs", "due_date", "DATE NULL")
    db.add_column("jobs", "notes", "TEXT NULL")
    replace_check(
        db, "jobs", "chk_jobs_status",
        "`status` IN ('Not Started', 'Ongoing', 'On Hold', 'Completed')",
    )
    db.run(
        """
        CREATE TABLE IF NOT EXISTS job_costs (
            id INT UNSIGNED NOT NULL AUTO_INCREMENT,
            tenant_id INT UNSIGNED NOT NULL,
            job_id INT UNSIGNED NOT NULL,
            description VARCHAR(255) NOT NULL,
            amount DECIMAL(14, 2) NOT NULL,
            cost_date DATE NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_job_costs_job (tenant_id, job_id),
            CONSTRAINT fk_job_costs_tenant FOREIGN KEY (tenant_id) REFERENCES tenants (id),
            CONSTRAINT fk_job_costs_job FOREIGN KEY (job_id) REFERENCES jobs (id) ON DELETE CASCADE,
            CONSTRAINT chk_job_costs_amount CHECK (amount >= 0)
        ) ENGINE=InnoDB
        """
    )

    # Milestone / partial billing: a job may now carry several invoices.
    db.add_column("invoices", "milestone_label", "VARCHAR(120) NOT NULL DEFAULT ''")
    db.add_index("invoices", "idx_invoices_job", "`job_id`")
    db.drop_index("invoices", "uq_invoices_job_id")


MIGRATIONS = [
    ("003_multi_tenancy", m003_multi_tenancy),
    ("004_gst", m004_gst),
    ("005_platform", m005_platform),
    ("006_workflow", m006_workflow),
]


def main():
    connection = get_db_connection()
    if not connection:
        print("Could not connect to MySQL; check the DB_* settings in .env.")
        return 1

    db = Db(connection)
    try:
        db.run(
            """CREATE TABLE IF NOT EXISTS schema_migrations (
                   name VARCHAR(120) NOT NULL PRIMARY KEY,
                   applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
               ) ENGINE=InnoDB"""
        )
        applied = set()
        db.run("SELECT name FROM schema_migrations")
        applied = {row[0] for row in db.cursor.fetchall()}

        for name, migration in MIGRATIONS:
            if name in applied:
                print(f"skip   {name}")
                continue
            print(f"apply  {name}")
            migration(db)
            db.run("INSERT INTO schema_migrations (name) VALUES (%s)", (name,))
            connection.commit()
        print("Migrations complete.")
        return 0
    except Exception as error:
        connection.rollback()
        print("Migration failed:", error)
        return 1
    finally:
        db.cursor.close()
        connection.close()


if __name__ == "__main__":
    sys.exit(main())
