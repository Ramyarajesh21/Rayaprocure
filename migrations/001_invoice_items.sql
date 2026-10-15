-- Run this once in MySQL Workbench for databases created before invoice items.
USE rayaprocure_db;

ALTER TABLE invoices
    ADD COLUMN IF NOT EXISTS subtotal DECIMAL(14, 2) NOT NULL DEFAULT 0.00 AFTER amount,
    ADD COLUMN IF NOT EXISTS adjustment DECIMAL(14, 2) NOT NULL DEFAULT 0.00 AFTER subtotal,
    ADD COLUMN IF NOT EXISTS grand_total DECIMAL(14, 2) NOT NULL DEFAULT 0.00 AFTER adjustment;

UPDATE invoices
SET subtotal = amount,
    grand_total = amount
WHERE subtotal = 0 AND grand_total = 0;

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
