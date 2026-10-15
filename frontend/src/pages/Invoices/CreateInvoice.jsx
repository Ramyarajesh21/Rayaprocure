import "../Quotations/Quotations.css";
import "./Invoices.css";

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import api from "../../services/api";
import { useCompany, useStates } from "../../services/company";

import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import Button from "../../components/Button";
import LineItemsEditor from "../../components/LineItemsEditor";
import { useToast } from "../../components/Toast/ToastContext";

import { errorMessage, todayISO } from "../../utils/format";
import {
    blankItem,
    determineSupply,
    itemsFromApi,
    itemsToApi,
    validateItems,
} from "../../utils/gst";

function CreateInvoice() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { showToast } = useToast();

    const editInvoiceId = searchParams.get("edit");
    const isEditMode = Boolean(editInvoiceId);

    const company = useCompany();
    const states = useStates();

    const [jobs, setJobs] = useState([]);
    const [invoices, setInvoices] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        job_id: searchParams.get("job") || "",
        invoice_number: "",
        invoice_date: todayISO(),
        due_date: "",
        place_of_supply: "",
        adjustment: "0",
        reverse_charge: false,
        milestone_label: "",
        notes: "",
        terms_conditions: "",
    });
    const [items, setItems] = useState([blankItem()]);
    const [percent, setPercent] = useState("100");
    const [billing, setBilling] = useState(null);

    const setField = (name, value) => setForm((previous) => ({ ...previous, [name]: value }));

    // Fill the form from the job's accepted quotation.
    const applyDraft = async (jobId, billPercent = "100") => {
        if (!jobId) return;
        try {
            const { data } = await api.get(`/invoices/draft/${jobId}`, { params: { percent: billPercent } });
            setBilling({
                quoteTotal: data.quote_total,
                billed: data.billed_so_far,
                remaining: data.remaining,
                count: data.invoice_count,
            });
            setForm((previous) => ({
                ...previous,
                job_id: String(jobId),
                invoice_number: data.invoice_number,
                invoice_date: data.invoice_date,
                due_date: data.due_date,
                place_of_supply: data.place_of_supply || "",
                adjustment: String(data.adjustment ?? 0),
                milestone_label: data.milestone_label || "",
                notes: data.notes || "",
                terms_conditions: data.terms_conditions || "",
            }));
            setItems(itemsFromApi(data.items));
        } catch (error) {
            showToast(errorMessage(error, "Unable to prepare the invoice from this job."), "error");
        }
    };

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const requests = [
                    api.get("/jobs"),
                    api.get("/invoices"),
                    api.get("/customers"),
                    api.get("/api/catalog"),
                ];
                if (isEditMode) requests.push(api.get(`/invoices/${editInvoiceId}`));
                const [jobsResponse, invoicesResponse, customersResponse, catalogResponse, invoiceResponse] =
                    await Promise.all(requests);
                if (!active) return;

                setJobs(jobsResponse.data || []);
                setInvoices(invoicesResponse.data || []);
                setCustomers(customersResponse.data || []);
                setCatalog((catalogResponse.data || []).filter((entry) => entry.is_active));

                if (invoiceResponse) {
                    const invoice = invoiceResponse.data;
                    setForm({
                        job_id: String(invoice.job_id),
                        invoice_number: invoice.invoice_number,
                        invoice_date: invoice.invoice_date || todayISO(),
                        due_date: invoice.due_date || "",
                        place_of_supply: invoice.place_of_supply || "",
                        adjustment: String(invoice.adjustment ?? 0),
                        reverse_charge: Boolean(invoice.reverse_charge),
                        milestone_label: invoice.milestone_label || "",
                        notes: invoice.notes || "",
                        terms_conditions: invoice.terms_conditions || "",
                    });
                    setItems(itemsFromApi(invoice.items));
                } else if (searchParams.get("job")) {
                    await applyDraft(searchParams.get("job"));
                }
            } catch (error) {
                showToast(errorMessage(error, "Unable to load the invoice form."), "error");
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [editInvoiceId]);

    // A job can be billed in several milestones, so every job stays selectable.
    const availableJobs = useMemo(() => jobs, [jobs]);
    const invoiceCounts = useMemo(() => {
        const counts = {};
        invoices.forEach((invoice) => {
            counts[invoice.job_id] = (counts[invoice.job_id] || 0) + 1;
        });
        return counts;
    }, [invoices]);

    const selectedJob = jobs.find((job) => String(job.id) === form.job_id);
    const customer = customers.find((entry) => entry.id === selectedJob?.customer_id);

    const supplyType = determineSupply(
        company?.gst_registered,
        company?.state_code,
        form.place_of_supply || customer?.state_code
    );

    const handleJobChange = (event) => {
        const jobId = event.target.value;
        setField("job_id", jobId);
        setPercent("100");
        if (!isEditMode) applyDraft(jobId);
    };

    const handlePercent = (value) => {
        setPercent(value);
        const parsed = Number(value);
        if (!isEditMode && form.job_id && parsed > 0 && parsed <= 100) applyDraft(form.job_id, value);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!form.job_id) return showToast("Please select a job.", "error");
        if (form.due_date && form.due_date < form.invoice_date) {
            return showToast("Due date cannot be before the invoice date.", "error");
        }
        const problem = validateItems(items);
        if (problem) return showToast(problem, "error");

        const payload = {
            job_id: Number(form.job_id),
            invoice_number: form.invoice_number.trim() || undefined,
            invoice_date: form.invoice_date,
            due_date: form.due_date || undefined,
            place_of_supply: form.place_of_supply || undefined,
            adjustment: Number(form.adjustment) || 0,
            reverse_charge: form.reverse_charge,
            milestone_label: form.milestone_label.trim(),
            notes: form.notes.trim(),
            terms_conditions: form.terms_conditions.trim(),
            status: "Submitted",
            items: itemsToApi(items),
        };

        try {
            setSaving(true);
            const response = isEditMode
                ? await api.put(`/invoices/${editInvoiceId}`, payload)
                : await api.post("/invoices", payload);
            showToast(response.data?.message || "Invoice saved.", "success");
            navigate(`/invoices/${response.data?.id || editInvoiceId}/preview`);
        } catch (error) {
            showToast(errorMessage(error, "Unable to save the invoice."), "error");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <MainLayout>
                <div className="quotations-page">
                    <PageHeader eyebrow="INVOICES" title="Invoice" description="Loading…" />
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="quotations-page">
                <PageHeader
                    eyebrow="INVOICES"
                    title={isEditMode ? "Edit Invoice" : "Create Invoice"}
                    description="Prepare a GST tax invoice from a job."
                />

                <form className="vf-form quotation-create-form" onSubmit={handleSubmit}>
                    <div className="quotation-form-section">
                        <div className="quotation-section-heading">
                            <h3>Invoice information</h3>
                            <p>Choose the job; items and tax are prefilled from its quotation.</p>
                        </div>

                        <div className="vf-form-row">
                            <div className="vf-form-group">
                                <label htmlFor="job_id">Job</label>
                                <select id="job_id" value={form.job_id} onChange={handleJobChange} required>
                                    <option value="">Select job</option>
                                    {availableJobs.map((job) => (
                                        <option key={job.id} value={job.id}>
                                            {job.job_name} — {job.company_name}
                                            {invoiceCounts[job.id] ? ` (${invoiceCounts[job.id]} invoice${invoiceCounts[job.id] > 1 ? "s" : ""})` : ""}
                                        </option>
                                    ))}
                                </select>
                                {customer?.gstin && <small>Customer GSTIN: {customer.gstin}</small>}
                            </div>

                            <div className="vf-form-group">
                                <label htmlFor="invoice_number">Invoice number</label>
                                <input
                                    id="invoice_number"
                                    value={form.invoice_number}
                                    onChange={(event) => setField("invoice_number", event.target.value)}
                                    placeholder="Auto-generated"
                                />
                            </div>

                            <div className="vf-form-group">
                                <label htmlFor="invoice_date">Invoice date</label>
                                <input id="invoice_date" type="date" value={form.invoice_date} onChange={(event) => setField("invoice_date", event.target.value)} required />
                            </div>

                            <div className="vf-form-group">
                                <label htmlFor="due_date">Due date</label>
                                <input id="due_date" type="date" value={form.due_date} min={form.invoice_date} onChange={(event) => setField("due_date", event.target.value)} />
                            </div>
                        </div>

                        {!isEditMode && form.job_id && (
                            <div className="vf-form-row">
                                <div className="vf-form-group">
                                    <label htmlFor="percent">Bill % of quotation</label>
                                    <input
                                        id="percent"
                                        type="number"
                                        min="1"
                                        max="100"
                                        step="1"
                                        value={percent}
                                        onChange={(event) => handlePercent(event.target.value)}
                                    />
                                    <small>
                                        {billing
                                            ? `Quotation total ₹${billing.quoteTotal.toLocaleString("en-IN")} · already billed ₹${billing.billed.toLocaleString("en-IN")} (${billing.count} invoice${billing.count === 1 ? "" : "s"}) · remaining ₹${billing.remaining.toLocaleString("en-IN")}`
                                            : "Use less than 100 for an advance or milestone invoice."}
                                    </small>
                                </div>
                                <div className="vf-form-group">
                                    <label htmlFor="milestone_label">Milestone label</label>
                                    <input
                                        id="milestone_label"
                                        value={form.milestone_label}
                                        onChange={(event) => setField("milestone_label", event.target.value)}
                                        placeholder="e.g. Advance 30%"
                                        maxLength={120}
                                    />
                                </div>
                            </div>
                        )}

                        {company?.gst_registered && (
                            <div className="vf-form-row">
                                <div className="vf-form-group">
                                    <label htmlFor="place_of_supply">Place of supply</label>
                                    <select id="place_of_supply" value={form.place_of_supply} onChange={(event) => setField("place_of_supply", event.target.value)}>
                                        <option value="">
                                            {customer?.state_code ? "Customer's state" : "Same as my state"}
                                        </option>
                                        {states.map((state) => (
                                            <option key={state.code} value={state.code}>
                                                {state.code} — {state.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="vf-form-group">
                                    <label htmlFor="reverse_charge">Reverse charge</label>
                                    <select id="reverse_charge" value={form.reverse_charge ? "yes" : "no"} onChange={(event) => setField("reverse_charge", event.target.value === "yes")}>
                                        <option value="no">No</option>
                                        <option value="yes">Yes</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="quotation-form-section">
                        <div className="quotation-section-heading">
                            <h3>Items / services</h3>
                            <p>Amounts are recalculated by the server when you save.</p>
                        </div>
                        <LineItemsEditor
                            items={items}
                            onChange={setItems}
                            adjustment={form.adjustment}
                            onAdjustmentChange={(value) => setField("adjustment", value)}
                            supplyType={supplyType}
                            roundOff={company?.round_off_enabled !== false}
                            catalog={catalog}
                        />
                    </div>

                    <div className="quotation-form-section">
                        <div className="quotation-section-heading">
                            <h3>Notes &amp; terms</h3>
                        </div>
                        <div className="vf-form-group">
                            <label htmlFor="notes">Notes</label>
                            <textarea id="notes" value={form.notes} onChange={(event) => setField("notes", event.target.value)} rows="3" />
                        </div>
                        <div className="vf-form-group">
                            <label htmlFor="terms_conditions">Terms &amp; conditions</label>
                            <textarea id="terms_conditions" value={form.terms_conditions} onChange={(event) => setField("terms_conditions", event.target.value)} rows="5" />
                        </div>
                    </div>

                    <div className="vf-form-actions">
                        <Button variant="secondary" onClick={() => navigate("/invoices")}>Cancel</Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? "Saving…" : isEditMode ? "Update invoice" : "Create invoice"}
                        </Button>
                    </div>
                </form>
            </div>
        </MainLayout>
    );
}

export default CreateInvoice;
