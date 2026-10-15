-- RayaProcure MySQL schema
--
-- Import with:
--   mysql -u root -p < schema.sql
--
-- The database name must match DB_NAME in your backend environment.

CREATE DATABASE IF NOT EXISTS rayaprocure_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE rayaprocure_db;

CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    username VARCHAR(120) NOT NULL,
    email VARCHAR(150) NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_username (username),
    CONSTRAINT chk_users_role CHECK (role IN ('Owner', 'Accounts', 'Operations', 'Purchase'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS company_settings (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_name VARCHAR(200) NOT NULL DEFAULT 'RayaProcure',
    business_type VARCHAR(150) NOT NULL DEFAULT '',
    email VARCHAR(150) NOT NULL DEFAULT '',
    phone VARCHAR(50) NOT NULL DEFAULT '',
    address TEXT NULL,
    tax_number VARCHAR(80) NOT NULL DEFAULT '',
    website VARCHAR(200) NOT NULL DEFAULT '',
    logo_url VARCHAR(500) NOT NULL DEFAULT '',
    currency CHAR(3) NOT NULL DEFAULT 'INR',
    date_format VARCHAR(30) NOT NULL DEFAULT 'DD/MM/YYYY',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customers (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    company_name VARCHAR(200) NOT NULL,
    contact_name VARCHAR(150) NOT NULL DEFAULT '',
    phone VARCHAR(50) NOT NULL DEFAULT '',
    email VARCHAR(150) NOT NULL DEFAULT '',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_customers_company_name (company_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rfqs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    customer_id INT UNSIGNED NOT NULL,
    rfq_number VARCHAR(30) NOT NULL,
    request_date DATE NOT NULL,
    required_date DATE NULL,
    purpose VARCHAR(255) NOT NULL DEFAULT '',
    description TEXT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'New',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_rfqs_number (rfq_number),
    KEY idx_rfqs_customer_id (customer_id),
    KEY idx_rfqs_status (status),
    CONSTRAINT fk_rfqs_customer
        FOREIGN KEY (customer_id) REFERENCES customers (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quotations (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    quotation_number VARCHAR(30) NOT NULL,
    quotation_date DATE NOT NULL,
    valid_until DATE NOT NULL,
    rfq_id INT UNSIGNED NOT NULL,
    description TEXT NULL,
    amount DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    subtotal DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    adjustment DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    grand_total DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    notes TEXT NULL,
    terms_conditions TEXT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'Draft',
    approved_by INT UNSIGNED NULL,
    approved_at DATETIME NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_quotations_number (quotation_number),
    KEY idx_quotations_rfq_id (rfq_id),
    KEY idx_quotations_status (status),
    CONSTRAINT fk_quotations_rfq
        FOREIGN KEY (rfq_id) REFERENCES rfqs (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_quotations_status
        CHECK (status IN ('Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS quotation_items (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    quotation_id INT UNSIGNED NOT NULL,
    description VARCHAR(500) NOT NULL,
    quantity DECIMAL(12, 2) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    rate DECIMAL(14, 2) NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_quotation_items_quotation_id (quotation_id),
    CONSTRAINT fk_quotation_items_quotation
        FOREIGN KEY (quotation_id) REFERENCES quotations (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT chk_quotation_items_quantity CHECK (quantity > 0),
    CONSTRAINT chk_quotation_items_rate CHECK (rate >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS jobs (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    quotation_id INT UNSIGNED NOT NULL,
    job_name VARCHAR(255) NOT NULL,
    start_date DATE NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'Ongoing',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_jobs_quotation_id (quotation_id),
    KEY idx_jobs_status (status),
    CONSTRAINT fk_jobs_quotation
        FOREIGN KEY (quotation_id) REFERENCES quotations (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_jobs_status CHECK (status IN ('Ongoing', 'Completed'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoices (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    job_id INT UNSIGNED NOT NULL,
    invoice_number VARCHAR(50) NOT NULL,
    invoice_date DATE NULL,
    due_date DATE NULL,
    amount DECIMAL(14, 2) NOT NULL,
    subtotal DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    adjustment DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    grand_total DECIMAL(14, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(32) NOT NULL DEFAULT 'Submitted',
    payment_status VARCHAR(32) NOT NULL DEFAULT 'Pending',
    approved_by INT UNSIGNED NULL,
    approved_at DATETIME NULL,
    notes TEXT NULL,
    terms_conditions TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_invoices_job_id (job_id),
    UNIQUE KEY uq_invoices_number (invoice_number),
    KEY idx_invoices_status (status),
    KEY idx_invoices_payment_status (payment_status),
    CONSTRAINT fk_invoices_job
        FOREIGN KEY (job_id) REFERENCES jobs (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_invoices_amount CHECK (amount > 0),
    CONSTRAINT chk_invoices_status CHECK (status IN ('Submitted', 'Approved')),
    CONSTRAINT chk_invoices_payment_status CHECK (payment_status IN ('Pending', 'Partial', 'Paid'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS invoice_items (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    invoice_id INT UNSIGNED NOT NULL,
    description VARCHAR(500) NOT NULL,
    quantity DECIMAL(12, 2) NOT NULL,
    unit VARCHAR(50) NOT NULL,
    rate DECIMAL(14, 2) NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_invoice_items_invoice_id (invoice_id),
    CONSTRAINT fk_invoice_items_invoice
        FOREIGN KEY (invoice_id) REFERENCES invoices (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT chk_invoice_items_quantity CHECK (quantity > 0),
    CONSTRAINT chk_invoice_items_rate CHECK (rate >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    invoice_id INT UNSIGNED NOT NULL,
    payment_date DATE NOT NULL,
    amount DECIMAL(14, 2) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'Pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_payments_invoice_id (invoice_id),
    KEY idx_payments_status (status),
    CONSTRAINT fk_payments_invoice
        FOREIGN KEY (invoice_id) REFERENCES invoices (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT chk_payments_amount CHECK (amount > 0),
    CONSTRAINT chk_payments_status CHECK (status IN ('Pending', 'Received'))
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS attachments (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    entity_type VARCHAR(32) NOT NULL,
    entity_id INT UNSIGNED NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(120) NOT NULL DEFAULT 'application/octet-stream',
    size_bytes INT UNSIGNED NOT NULL DEFAULT 0,
    uploaded_by INT UNSIGNED NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_attachments_entity (entity_type, entity_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NULL,
    title VARCHAR(180) NOT NULL,
    message VARCHAR(500) NOT NULL,
    category VARCHAR(40) NOT NULL DEFAULT 'General',
    link_path VARCHAR(255) NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_notifications_user_read (user_id, is_read, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    user_id INT UNSIGNED NULL,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id INT UNSIGNED NULL,
    details JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_audit_logs_entity (entity_type, entity_id, created_at),
    KEY idx_audit_logs_user (user_id, created_at)
) ENGINE=InnoDB;

-- The company API expects one settings record to exist.
INSERT INTO company_settings (
    company_name, business_type, email, phone, address, currency, date_format
)
SELECT 'RayaProcure', '', '', '', '', 'INR', 'DD/MM/YYYY'
WHERE NOT EXISTS (SELECT 1 FROM company_settings);

-- Development Owner account. Change this password immediately after first login.
-- Username: owner
-- Password: owner@123
INSERT INTO users (name, username, password, role)
SELECT
    'System Owner',
    'owner',
    'scrypt:32768:8:1$xOEThs2EI4EpwiWX$0d6706e0c13eea86ce29727ec614ec3327e942c4b2c939e2972a3cf9c84cd2152d5aea764f0d702195274152d839fc0e5555893d512f22a2d8a62ef800d48611',
    'Owner'
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'owner');

-- Upgrade compatibility for older MySQL versions. MySQL before 8.0.29 does
-- not support ALTER TABLE ... ADD COLUMN IF NOT EXISTS, so this helper checks
-- INFORMATION_SCHEMA before adding each column.
DROP PROCEDURE IF EXISTS add_column_if_missing;
DELIMITER //
CREATE PROCEDURE add_column_if_missing(
    IN target_table VARCHAR(64),
    IN target_column VARCHAR(64),
    IN column_definition TEXT
)
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = target_table
          AND column_name = target_column
    ) THEN
        SET @upgrade_sql = CONCAT('ALTER TABLE `', target_table, '` ADD COLUMN ', column_definition);
        PREPARE upgrade_statement FROM @upgrade_sql;
        EXECUTE upgrade_statement;
        DEALLOCATE PREPARE upgrade_statement;
    END IF;
END //
DELIMITER ;

CALL add_column_if_missing('users', 'email', '`email` VARCHAR(150) NULL AFTER `username`');
CALL add_column_if_missing('users', 'is_active', '`is_active` BOOLEAN NOT NULL DEFAULT TRUE AFTER `role`');
CALL add_column_if_missing('company_settings', 'tax_number', '`tax_number` VARCHAR(80) NOT NULL DEFAULT \'\' AFTER `address`');
CALL add_column_if_missing('company_settings', 'website', '`website` VARCHAR(200) NOT NULL DEFAULT \'\' AFTER `tax_number`');
CALL add_column_if_missing('company_settings', 'logo_url', '`logo_url` VARCHAR(500) NOT NULL DEFAULT \'\' AFTER `website`');
CALL add_column_if_missing('quotations', 'approved_by', '`approved_by` INT UNSIGNED NULL AFTER `status`');
CALL add_column_if_missing('quotations', 'approved_at', '`approved_at` DATETIME NULL AFTER `approved_by`');
CALL add_column_if_missing('invoices', 'subtotal', '`subtotal` DECIMAL(14, 2) NOT NULL DEFAULT 0.00 AFTER `amount`');
CALL add_column_if_missing('invoices', 'adjustment', '`adjustment` DECIMAL(14, 2) NOT NULL DEFAULT 0.00 AFTER `subtotal`');
CALL add_column_if_missing('invoices', 'grand_total', '`grand_total` DECIMAL(14, 2) NOT NULL DEFAULT 0.00 AFTER `adjustment`');
CALL add_column_if_missing('invoices', 'approved_by', '`approved_by` INT UNSIGNED NULL AFTER `payment_status`');
CALL add_column_if_missing('invoices', 'approved_at', '`approved_at` DATETIME NULL AFTER `approved_by`');
DROP PROCEDURE IF EXISTS add_column_if_missing;

UPDATE invoices
SET subtotal = amount,
    grand_total = amount
WHERE subtotal = 0 AND grand_total = 0;
