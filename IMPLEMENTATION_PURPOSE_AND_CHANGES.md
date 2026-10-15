# RayaProcure — Purpose and Implemented Changes

## Product purpose

RayaProcure is a focused vendor-operations workspace for managing the commercial and financial process from an incoming customer requirement through to payment collection.

Its intended operating flow is:

```text
Customer → RFQ → Quotation → Accepted quotation → Job → Invoice → Payment
```

The product is designed for a business that wants a simpler, tailored alternative to using several large systems for CRM, quotations, job tracking, and invoice follow-up. It gives the owner a single view of work, revenue, outstanding balances, user access, and business activity.

## Changes implemented

### 1. Database foundation and setup

- Created a complete `schema.sql` file for MySQL.
- Added all core tables: users, company settings, customers, RFQs, quotations, quotation items, jobs, invoices, invoice items, and payments.
- Added newer business-control tables: attachments, notifications, and audit logs.
- Added default company settings and a development Owner account.
- Made the upgrade section compatible with older MySQL versions by checking whether a column exists before adding it.

**Purpose:** A single SQL script can initialize a new database or safely fill in missing fields in an existing project database.

### 2. Environment and database configuration

- Replaced product-specific database environment variable names with standard names: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`.
- Configured the backend to load the project-root `.env` file.
- Required `SECRET_KEY` before the API starts.
- Configured frontend-to-backend API requests to use the Flask server and preserve login sessions.

**Purpose:** The project can be configured cleanly per computer/environment and avoids the previous login-session mismatch between `localhost` and `127.0.0.1`.

### 3. Login, session, and role-based access

- Implemented session-based login, logout, current-user lookup, and password change support.
- Added password hashing support while retaining safe compatibility for old development records.
- Added active/inactive account control.
- Enforced backend role access, not only frontend menu hiding.

| Role | Main access |
| --- | --- |
| Owner | Full workspace, company profile, users, audit history |
| Operations | Customers, RFQs, quotations |
| Accounts | Customers, invoices, payments, reports |

**Purpose:** Users see and access only work relevant to their job. Sensitive owner controls and financial functions are protected at the API level.

### 4. Customer-to-payment workflow

- Kept and strengthened the core business path: Customer → RFQ → Quotation → Job → Invoice → Payment.
- Automatically synchronizes RFQ status once quotations are created, updated, or removed.
- Added quotation Accept and Reject actions.
- Added invoice approval action.
- Added invoice line-item storage and server-side recalculation of subtotal, adjustment, and grand total.
- Added payment reconciliation that changes invoices to Pending, Partial, or Paid based on recorded received payments.
- Prevents invoice changes that would make the invoice total lower than payments already received.

**Purpose:** The core workflow is operational rather than only visual. Totals and payment status are derived from real data and remain consistent.

### 5. Documents and communication

- Added premium quotation and invoice preview screens.
- Added PDF download for quotations and invoices.
- Added a quotation email-composer action using the customer email address.
- Added supporting-document upload and download for quotations and invoices.
- Enforced a 10 MB file limit and accepts only common business formats: PDF, Office documents, images, CSV, and text files.

**Purpose:** Teams can prepare, share, and retain the documents needed for a commercial record without losing context.

### 6. Company and team management

- Added a Company Profile page for company name, business type, contact details, address, tax number, website, and logo URL.
- Added Team & Access page for Owners.
- Owners can create users, assign roles, and activate or deactivate accounts.

**Purpose:** The owner can maintain business identity and manage workspace access without editing the database directly.

### 7. Notifications and audit history

- Added in-app notifications for important workflow events, including quotation decisions, invoice approvals, and received payments.
- Added an Owner-only Audit History page.
- Successful create, update, and delete API actions are recorded with actor, operation, area, record reference, and timestamp.

**Purpose:** The owner can see what changed and receive lightweight operational alerts without manually checking every record.

### 8. Reports and exports

- Enhanced reports with operational and financial summaries.
- Added CSV exports for invoice and payment reports.
- Dashboard continues to display RFQs, ongoing jobs, revenue, outstanding balance, job completion, and financial overview.

**Purpose:** The owner can quickly demonstrate business performance and export financial working data when needed.

### 9. Premium interface improvements

- Added a premium visual layer across dashboard, navigation, cards, forms, tables, documents, and status indicators.
- Improved page hierarchy, spacing, contrast, responsive layout behavior, and owner controls.
- Added visible navigation to Team & Access, Company Profile, and Audit History.

**Purpose:** The app presents as a cohesive business product suitable for a stakeholder demo rather than a basic CRUD prototype.

## What to do before the demo

1. Run the full `schema.sql` file in MySQL Workbench.
2. Confirm `.env` has the correct `DB_NAME`, database user, password, and a non-empty `SECRET_KEY`.
3. Restart the Flask backend after database/schema changes.
4. Refresh the frontend and sign in.
5. Create sample records for one full journey:
   - Customer
   - RFQ
   - Quotation with line items
   - Accept quotation
   - Job
   - Invoice with line items
   - Approve invoice
   - Record a received payment
6. Open Dashboard, Reports, Notifications, and Audit History to demonstrate that the workflow generated measurable activity.

## Development login

Only when the default development account was inserted by `schema.sql`:

```text
Username: owner
Password: owner@123
```

Change this password after the first login and do not use the default credential in a production environment.

## Current scope note

This implementation is ready for a local stakeholder demo. Before a real production rollout, it still needs production hosting, HTTPS, managed backups, stricter upload malware scanning, rate limiting, robust automated tests, a proper email delivery provider, and a formal deployment/monitoring setup.
