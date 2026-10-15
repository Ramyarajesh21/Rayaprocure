-- Run after 001_invoice_items.sql in MySQL Workbench.
USE rayaprocure_db;

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email VARCHAR(150) NULL AFTER username,
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE AFTER role;

ALTER TABLE company_settings
    ADD COLUMN IF NOT EXISTS tax_number VARCHAR(80) NOT NULL DEFAULT '' AFTER address,
    ADD COLUMN IF NOT EXISTS website VARCHAR(200) NOT NULL DEFAULT '' AFTER tax_number,
    ADD COLUMN IF NOT EXISTS logo_url VARCHAR(500) NOT NULL DEFAULT '' AFTER website;

ALTER TABLE quotations
    ADD COLUMN IF NOT EXISTS approved_by INT UNSIGNED NULL AFTER status,
    ADD COLUMN IF NOT EXISTS approved_at DATETIME NULL AFTER approved_by;

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS approved_by INT UNSIGNED NULL AFTER payment_status,
    ADD COLUMN IF NOT EXISTS approved_at DATETIME NULL AFTER approved_by;

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
