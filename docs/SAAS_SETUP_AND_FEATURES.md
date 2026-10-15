# RayaProcure SaaS: setup and feature guide

## What changed

RayaProcure is now a multi-company (multi-tenant) product for Indian businesses.

| Area | What you get |
|---|---|
| **Multi-tenancy** | Companies sign up themselves (`/login` → "New company? Create a workspace"). Every table carries a `tenant_id` and every query filters on it. Document numbers are unique per company. |
| **GST** | GSTIN validation (format + checksum), state detection, CGST/SGST vs IGST from place of supply, HSN/SAC and GST rate per line, discounts, round-off, amount in words, reverse-charge flag, bank/UPI block. Suppliers not registered for GST get tax-free bills of supply. All maths is done on the server. |
| **Your own document format** | *Document Templates*: rename headings, toggle columns/sections, colours, fonts, extra header fields, or paste your **own HTML** (with `{{placeholders}}` and `{{#items}}` loops). One template drives the preview, the PDF, the email and the customer link. Numbering prefixes (`INV/24-25/0001`), default terms and notes are configurable in *Company Profile*. |
| **Email** | Each company saves its own SMTP account (*Email & Reminders*). Quotations and invoices are emailed with the PDF attached and a secure customer link. Passwords are stored encrypted. |
| **Customer link** | `/p/<token>`: no login. Customer views/downloads the document, and for quotations can Accept or Decline (name + note recorded, owner notified). Works on phones. |
| **Reminders** | Before-due and after-due invoice reminders, quotation follow-ups and expiry notices. Each reminder is sent once, catch-up safe, and quotations past validity are marked Expired. |
| **Sales workflow** | Catalog of products/services; auto-filled invoices from a job's quotation; **milestone/advance billing** (bill 30%, then 70%); **quotation revisions** (`-R1`, `-R2`, old version kept); job status/assignee/due date/notes; **job costs and margin**. |
| **Reports** | Receivables aging, quotation win rate, revenue by customer, monthly GST summary, GST sales register + aging CSV exports. |
| **Mobile / PWA** | Installable app (manifest + service worker), slide-in menu on phones, responsive forms and documents. |
| **Security** | Rate limits on login/signup/customer link, SMTP host restrictions (no internal network probing), template HTML sanitised, encrypted SMTP passwords. |

## Setup

### 1. Configure

Copy `.env.example` to `.env` and fill it in (`SECRET_KEY`, `DB_*`, `PUBLIC_APP_URL`).

### 2a. New installation

```bash
mysql -u root -p < schema.sql          # base tables
cd backend
pip install -r requirements.txt
python migrate.py                      # tenancy, GST, email, reminders, workflow
python run.py
```

### 2b. Upgrading an existing database

**Back up first** (`mysqldump rayaprocure_db > backup.sql`), then:

```bash
cd backend
pip install -r requirements.txt
python migrate.py
```

Your existing company becomes tenant 1. Existing users, customers, quotations, invoices and payments are kept unchanged. Old plaintext passwords still work once and are re-hashed on first login. The migration was rehearsed on legacy-shaped data (login, invoices, balances, dashboard all verified).
`migrate.py` is safe to re-run.

If your old numbering was `RPQ-00001`, set *Company Profile → Numbering* prefix to `RPQ-` and digits to `5` so numbers continue.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev        # or: npm run build
```

### 4. First-time company setup (in the app)

1. **Company Profile**: GSTIN (state auto-detected), bank/UPI, numbering, default terms.
2. **Email & Reminders → Email**: pick a provider preset, enter SMTP details, send a test.
3. **Email & Reminders → Reminders**: choose days, enable.
4. **Document Templates**: optional, to match your existing invoice format.

Gmail/Google Workspace needs an *App Password*; Microsoft 365 needs SMTP AUTH enabled.

### 5. Reminders schedule

Reminders are off until a company enables them. Run the job daily:

* **Windows Task Scheduler / cron:** `python backend/run_reminders.py` every morning.
* **Or** set `REMINDER_SCHEDULER=1` to run it inside the API process (single server only).

It is safe to run more often; a reminder is never sent twice.

## Tests

The tests need a **throwaway** database (they refuse to run against `rayaprocure_db`):

```bash
cd backend
python tests/create_test_db.py                 # builds rayaprocure_test from scratch
DB_NAME=rayaprocure_test python -m unittest discover -s tests -v
```

(PowerShell: `$env:DB_NAME="rayaprocure_test"; python -m unittest discover -s tests -v`)

Coverage: tenant isolation, GST maths, quote-to-cash, email (against a local SMTP sink), customer link, reminders, templates, reports, revisions, jobs/margins, milestone billing, rate limits, legacy passwords.

## Known limits and next steps

* **E-invoicing (IRN/QR):** database fields exist (`irn`, `ack_no`, `e_invoice_status`) but nothing calls the government portal yet. This needs a GSP account (ClearTax, Masters India, etc.) and credentials.
* **Online payments** (Razorpay/UPI links) are not built.
* **Recurring invoices** are not built. An invoice currently needs a job, so a retainer would be modelled as a long-running job with milestone invoices.
* **Accounting exports:** CSV registers only. Direct Tally / Zoho Books / QuickBooks formats are not built.
* **Rate limiting** is per process. Put equivalent limits on your reverse proxy in production.
* **Changing `SECRET_KEY`** logs everyone out and makes saved SMTP passwords unreadable (they must be re-entered).
* The PWA icons are generated placeholders (`frontend/public/icon-*.png`); replace with your brand artwork.
* The seeded development Owner (`owner` / `owner@123`) in `schema.sql` must be changed or removed before going live.
