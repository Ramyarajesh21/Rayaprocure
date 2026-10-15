import { useEffect, useState } from "react";

import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import Button from "../../components/Button";
import { useToast } from "../../components/Toast/ToastContext";

import api from "../../services/api";
import { clearCompanyCache, useStates } from "../../services/company";
import { errorMessage } from "../../utils/format";

// API field (camelCase, used by PUT) -> column returned by GET.
const FIELDS = {
    companyName: "company_name",
    businessType: "business_type",
    email: "email",
    phone: "phone",
    address: "address",
    website: "website",
    logoUrl: "logo_url",
    currency: "currency",
    gstin: "gstin",
    stateCode: "state_code",
    pan: "pan",
    bankName: "bank_name",
    bankAccountName: "bank_account_name",
    bankAccountNo: "bank_account_no",
    bankIfsc: "bank_ifsc",
    bankBranch: "bank_branch",
    upiId: "upi_id",
    rfqPrefix: "rfq_prefix",
    quotationPrefix: "quotation_prefix",
    invoicePrefix: "invoice_prefix",
    numberWidth: "number_width",
    quotationValidDays: "quotation_valid_days",
    invoiceDueDays: "invoice_due_days",
    defaultQuotationTerms: "default_quotation_terms",
    defaultQuotationNotes: "default_quotation_notes",
    defaultInvoiceTerms: "default_invoice_terms",
    defaultInvoiceNotes: "default_invoice_notes",
    brandColor: "brand_color",
    signatureUrl: "signature_url",
    authorisedSignatory: "authorised_signatory",
};

const TABS = ["Business & GST", "Bank & payment", "Numbering & defaults", "Branding"];

function Field({ label, hint, wide, children }) {
    return (
        <label className={`pf-field${wide ? " pf-wide" : ""}`}>
            <span>{label}</span>
            {children}
            {hint && <small>{hint}</small>}
        </label>
    );
}

function Company() {
    const { showToast } = useToast();
    const states = useStates();
    const [tab, setTab] = useState(TABS[0]);
    const [form, setForm] = useState(null);
    const [gstRegistered, setGstRegistered] = useState(false);
    const [roundOff, setRoundOff] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        api.get("/api/company")
            .then(({ data }) => {
                const next = {};
                Object.entries(FIELDS).forEach(([field, column]) => {
                    next[field] = data[column] ?? "";
                });
                setForm(next);
                setGstRegistered(Boolean(data.gst_registered));
                setRoundOff(data.round_off_enabled !== false);
            })
            .catch(() => showToast("Unable to load company settings.", "error"));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const set = (field) => (event) => setForm((previous) => ({ ...previous, [field]: event.target.value }));

    const onGstin = (event) => {
        const gstin = event.target.value.toUpperCase().replace(/\s/g, "");
        setForm((previous) => {
            const known = gstin.length >= 2 && states.some((state) => state.code === gstin.slice(0, 2));
            return { ...previous, gstin, stateCode: known ? gstin.slice(0, 2) : previous.stateCode };
        });
        if (gstin.length === 15) setGstRegistered(true);
    };

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const payload = { ...form, gstRegistered, roundOffEnabled: roundOff };
            ["numberWidth", "quotationValidDays", "invoiceDueDays"].forEach((key) => {
                payload[key] = Number(payload[key]);
            });
            await api.put("/api/company", payload);
            clearCompanyCache();
            showToast("Company settings saved.", "success");
        } catch (error) {
            showToast(errorMessage(error, "Unable to save company settings."), "error");
        } finally {
            setSaving(false);
        }
    };

    if (!form) {
        return (
            <MainLayout>
                <div className="pf-page">
                    <PageHeader eyebrow="BRAND & DOCUMENTS" title="Company Profile" description="Loading…" />
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <form className="pf-page" onSubmit={save}>
                <PageHeader
                    eyebrow="BRAND & DOCUMENTS"
                    title="Company Profile"
                    description="Business, GST and bank details that appear on every quotation and invoice."
                />

                <div className="pf-tabs" role="tablist">
                    {TABS.map((name) => (
                        <button key={name} type="button" role="tab" className={`pf-tab${tab === name ? " active" : ""}`} onClick={() => setTab(name)}>
                            {name}
                        </button>
                    ))}
                </div>

                {tab === TABS[0] && (
                    <>
                        <div className="pf-card">
                            <h3>Business</h3>
                            <div className="pf-grid">
                                <Field label="Company name"><input value={form.companyName} onChange={set("companyName")} required /></Field>
                                <Field label="Business type"><input value={form.businessType} onChange={set("businessType")} placeholder="e.g. Engineering services" /></Field>
                                <Field label="Email"><input type="email" value={form.email} onChange={set("email")} /></Field>
                                <Field label="Phone"><input value={form.phone} onChange={set("phone")} /></Field>
                                <Field label="Website"><input value={form.website} onChange={set("website")} /></Field>
                                <Field label="Address" wide><textarea rows="3" value={form.address} onChange={set("address")} /></Field>
                            </div>
                        </div>

                        <div className="pf-card">
                            <h3>GST &amp; tax</h3>
                            <p>Enter your GSTIN and the state is detected automatically. GST-registered businesses get CGST/SGST (same state) or IGST (other state) on documents.</p>
                            <label className="pf-check">
                                <input type="checkbox" checked={gstRegistered} onChange={(event) => setGstRegistered(event.target.checked)} />
                                We are registered under GST
                            </label>
                            <div className="pf-grid">
                                <Field label="GSTIN" hint="15 characters, e.g. 33ABCDE1234F1Z5">
                                    <input value={form.gstin} onChange={onGstin} maxLength={15} placeholder="Leave blank if not registered" />
                                </Field>
                                <Field label="State" hint="Your home state (decides CGST/SGST vs IGST)">
                                    <select value={form.stateCode || ""} onChange={set("stateCode")}>
                                        <option value="">Select state</option>
                                        {states.map((state) => (
                                            <option key={state.code} value={state.code}>{state.code} — {state.name}</option>
                                        ))}
                                    </select>
                                </Field>
                                <Field label="PAN"><input value={form.pan} onChange={(event) => setForm({ ...form, pan: event.target.value.toUpperCase() })} maxLength={10} placeholder="ABCDE1234F" /></Field>
                            </div>
                            <label className="pf-check">
                                <input type="checkbox" checked={roundOff} onChange={(event) => setRoundOff(event.target.checked)} />
                                Round invoice totals to the nearest rupee
                            </label>
                        </div>
                    </>
                )}

                {tab === TABS[1] && (
                    <div className="pf-card">
                        <h3>Bank &amp; UPI</h3>
                        <p>Shown on invoices and payment reminders so customers know where to pay.</p>
                        <div className="pf-grid">
                            <Field label="Account name"><input value={form.bankAccountName} onChange={set("bankAccountName")} /></Field>
                            <Field label="Bank name"><input value={form.bankName} onChange={set("bankName")} /></Field>
                            <Field label="Account number"><input value={form.bankAccountNo} onChange={set("bankAccountNo")} inputMode="numeric" /></Field>
                            <Field label="IFSC"><input value={form.bankIfsc} onChange={(event) => setForm({ ...form, bankIfsc: event.target.value.toUpperCase() })} /></Field>
                            <Field label="Branch"><input value={form.bankBranch} onChange={set("bankBranch")} /></Field>
                            <Field label="UPI ID"><input value={form.upiId} onChange={set("upiId")} placeholder="name@bank" /></Field>
                        </div>
                    </div>
                )}

                {tab === TABS[2] && (
                    <>
                        <div className="pf-card">
                            <h3>Document numbering</h3>
                            <p>Match the numbering you already use, e.g. prefix <code>INV/24-25/</code>. Numbers continue from the highest existing number with that prefix.</p>
                            <div className="pf-grid">
                                <Field label="RFQ prefix"><input value={form.rfqPrefix} onChange={set("rfqPrefix")} /></Field>
                                <Field label="Quotation prefix"><input value={form.quotationPrefix} onChange={set("quotationPrefix")} /></Field>
                                <Field label="Invoice prefix"><input value={form.invoicePrefix} onChange={set("invoicePrefix")} /></Field>
                                <Field label="Digits in number" hint="4 gives 0001"><input type="number" min="2" max="8" value={form.numberWidth} onChange={set("numberWidth")} /></Field>
                                <Field label="Quotation valid for (days)"><input type="number" min="1" max="365" value={form.quotationValidDays} onChange={set("quotationValidDays")} /></Field>
                                <Field label="Invoice due in (days)"><input type="number" min="0" max="365" value={form.invoiceDueDays} onChange={set("invoiceDueDays")} /></Field>
                            </div>
                        </div>
                        <div className="pf-card">
                            <h3>Default notes &amp; terms</h3>
                            <div className="pf-grid">
                                <Field label="Quotation notes" wide><textarea rows="3" value={form.defaultQuotationNotes} onChange={set("defaultQuotationNotes")} /></Field>
                                <Field label="Quotation terms &amp; conditions" wide><textarea rows="5" value={form.defaultQuotationTerms} onChange={set("defaultQuotationTerms")} /></Field>
                                <Field label="Invoice notes" wide><textarea rows="3" value={form.defaultInvoiceNotes} onChange={set("defaultInvoiceNotes")} /></Field>
                                <Field label="Invoice terms &amp; conditions" wide><textarea rows="5" value={form.defaultInvoiceTerms} onChange={set("defaultInvoiceTerms")} /></Field>
                            </div>
                        </div>
                    </>
                )}

                {tab === TABS[3] && (
                    <div className="pf-card">
                        <h3>Branding</h3>
                        <p>Used on documents, emails and the customer link. For the full document layout, see Document Templates.</p>
                        <div className="pf-grid">
                            <Field label="Logo URL" hint="Link to a PNG/JPG logo"><input value={form.logoUrl} onChange={set("logoUrl")} placeholder="https://…" /></Field>
                            <Field label="Signature image URL"><input value={form.signatureUrl} onChange={set("signatureUrl")} placeholder="https://…" /></Field>
                            <Field label="Authorised signatory"><input value={form.authorisedSignatory} onChange={set("authorisedSignatory")} /></Field>
                            <Field label="Brand colour"><input type="color" value={form.brandColor || "#1f4e79"} onChange={set("brandColor")} /></Field>
                        </div>
                    </div>
                )}

                <div className="pf-actions">
                    <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
                </div>
            </form>
        </MainLayout>
    );
}

export default Company;
