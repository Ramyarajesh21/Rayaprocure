# RayaProcure — Repository Analysis

## Overview

RayaProcure is a full-stack vendor-operations management system.

**Technology stack**

- Frontend: React 19, Vite, React Router, Axios
- Backend: Flask REST API
- Database: MySQL
- Document output: `html2canvas` and `jsPDF` for quotation and invoice PDFs

## Business workflow

```text
Customer → RFQ → Quotation → Accepted Quotation → Job → Invoice → Payment
```

## Implemented features

| Area | Features |
|---|---|
| Authentication | Username/password login, password change, and three roles: Owner, Accounts, Operations. |
| Role access | Client-side route and navigation restrictions by role. |
| Customers | Create, view, search, edit, and delete customer records. |
| RFQs | Create, view details, search, edit, and delete RFQs; auto-generated `RFQ-###` numbers. |
| Quotations | Create, edit, list, and delete quotations linked to RFQs; line items, quantities, units, rates, subtotals, adjustments, notes, terms, expiry date, and statuses. |
| Quotation PDF | Preview, print/download PDF, and edit quotation. |
| Jobs | Create, edit, and delete jobs from accepted quotations; statuses: Ongoing and Completed. |
| Invoices | Create, edit, list, and delete one invoice per job; invoice and payment-status tracking. |
| Invoice PDF | Preview and PDF download; invoice email action opens the local email composer using `mailto:`. |
| Payments | Create, edit, and delete payments linked to invoices; prevents payments exceeding an invoice amount. |
| Dashboard | RFQ/job counts, financial totals, outstanding balance, and recent jobs. |
| Reports | Customer/RFQ/quotation/job totals, job breakdown, invoice value, payments received, and outstanding balance. |
| Settings | Light/dark theme, local notification preferences per role, and password change. |
| UI | Responsive layout, navigation, reusable table/modal/button/status/toast components, and an About page. |

## Roles

| Role | Access |
|---|---|
| Owner | Full access, including Jobs, Reports, and Settings. |
| Operations | Dashboard, Customers, RFQs, Quotations, and About. |
| Accounts | Dashboard, Customers, Invoices, Payments, Reports, and About. |

## Backend business rules

- A job can only be created from an **Accepted** quotation.
- A quotation can only have one job.
- A job can only have one invoice.
- Invoice numbers must be unique.
- Payments cannot exceed the associated invoice amount.
- Customer deletion handles the database foreign-key “in use” case.
- Quotation line items are stored separately and totals are recalculated by the server.

## Important gaps and risks

1. **Authentication and authorization have been enhanced**

   Login now creates a signed Flask session, and the backend enforces role permissions for every business endpoint. The frontend sends session credentials and clears its local session state when the server returns `401`.

2. **Credential and password handling have been enhanced**

   Database configuration and the Flask secret are now environment variables, documented in `.env.example`. New passwords are securely hashed, and a successful login automatically upgrades legacy plaintext passwords to hashes.

3. **Missing database setup files**

   No schema, migrations, seed data, or backend setup README is included. The application requires tables such as `users`, `customers`, `rfqs`, `quotations`, `quotation_items`, `jobs`, `invoices`, `payments`, and `company_settings`.

4. **Company settings endpoint has been enabled**

   `backend/app/routes/company.py` is now registered. Its `/api/company` endpoints are available to the Owner role.

5. **Quotation sending is not implemented**

   The quotation preview action displays a toast that sending will be added later. Invoice sending only opens a local mail client; it does not send an email or attach a PDF.

6. **API configuration has been enhanced**

   The frontend supports `VITE_API_BASE_URL`, with a documented local-development fallback. Server CORS origins are also environment-configurable.

7. **Inconsistent database-failure handling**

   Some API routes assume the MySQL connection succeeds; a database outage can therefore produce unhandled server errors.

8. **Branding inconsistency**

   The user interface uses RayaProcure, while local-storage keys, the Flask secret-key name, and the backend root message still use “VendorFlow.”

## Verification performed

- `npm run build` completed successfully.
- `python -m compileall -q backend` completed successfully.
- End-to-end API testing was not possible because the repository contains no MySQL schema or supplied database instance.

## Recommended next priorities

1. Add server-side authentication (session or JWT) and role-based API authorization.
2. Remove committed credentials; use environment variables and hashed passwords.
3. Add MySQL schema/migrations, seed data, and setup documentation.
4. Register or remove the unused company-settings blueprint.
5. Add environment-driven frontend API configuration.
6. Implement real outbound email/document delivery if required.
