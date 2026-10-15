import "./Quotations.css";

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import api from "../../services/api";
import { useCompany, useStates } from "../../services/company";

import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import Button from "../../components/Button";
import LineItemsEditor from "../../components/LineItemsEditor";
import { useToast } from "../../components/Toast/ToastContext";

import { addDays, errorMessage, todayISO } from "../../utils/format";
import {
    blankItem,
    determineSupply,
    itemsFromApi,
    itemsToApi,
    validateItems,
} from "../../utils/gst";

const FALLBACK_NOTES = `Please review the quoted scope, quantities, and specifications carefully before confirmation.
This quotation is subject to the availability of required materials and resources.`;

const FALLBACK_TERMS = `1. This quotation is valid until the date shown above.
2. Work or supply will be carried out according to the agreed scope and specifications.
3. Any additional work outside the agreed scope will be charged separately.
4. Delivery or work schedules will be mutually agreed with the customer.
5. Payment terms will be as mutually agreed.
6. Changes to scope, quantity, or specifications may require a revised quotation.`;

function CreateQuotation() {
    const navigate = useNavigate();
    const { quotationId } = useParams();
    const { showToast } = useToast();
    const isEditMode = Boolean(quotationId);

    const company = useCompany();
    const states = useStates();

    const [rfqs, setRfqs] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [catalog, setCatalog] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [form, setForm] = useState({
        rfq_id: "",
        quotation_date: todayISO(),
        valid_until: "",
        place_of_supply: "",
        status: "Draft",
        adjustment: "0",
        notes: "",
        terms_conditions: "",
    });
    const [items, setItems] = useState([blankItem()]);
    const [validUntilTouched, setValidUntilTouched] = useState(false);

    // Load reference data (and the quotation itself when editing).
    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const requests = [api.get("/rfqs"), api.get("/customers"), api.get("/api/catalog")];
                if (isEditMode) requests.push(api.get(`/quotations/${quotationId}`));
                const [rfqResponse, customerResponse, catalogResponse, quotationResponse] =
                    await Promise.all(requests);
                if (!active) return;

                setRfqs(rfqResponse.data || []);
                setCustomers(customerResponse.data || []);
                setCatalog((catalogResponse.data || []).filter((entry) => entry.is_active));

                if (quotationResponse) {
                    const quotation = quotationResponse.data;
                    setForm({
                        rfq_id: String(quotation.rfq_id || ""),
                        quotation_date: quotation.quotation_date || todayISO(),
                        valid_until: quotation.valid_until || "",
                        place_of_supply: quotation.place_of_supply || "",
                        status: quotation.status || "Draft",
                        adjustment: String(quotation.adjustment ?? 0),
                        notes: quotation.notes || "",
                        terms_conditions: quotation.terms_conditions || "",
                    });
                    setItems(itemsFromApi(quotation.items));
                    setValidUntilTouched(true);
                }
            } catch (error) {
                showToast(errorMessage(error, "Unable to load the quotation form."), "error");
                if (isEditMode) navigate("/quotations");
            } finally {
                if (active) setLoading(false);
            }
        };
        load();
        return () => {
            active = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quotationId]);

    // Apply company defaults once they arrive (new quotations only).
    useEffect(() => {
        if (!company || isEditMode) return;
        setForm((previous) => ({
            ...previous,
            valid_until:
                previous.valid_until || addDays(previous.quotation_date, company.quotation_valid_days || 15),
            notes: previous.notes || company.default_quotation_notes || FALLBACK_NOTES,
            terms_conditions:
                previous.terms_conditions || company.default_quotation_terms || FALLBACK_TERMS,
        }));
    }, [company, isEditMode]);

    const selectedRfq = rfqs.find((rfq) => String(rfq.id) === form.rfq_id);
    const customer = useMemo(
        () => customers.find((entry) => entry.id === selectedRfq?.customer_id),
        [customers, selectedRfq]
    );

    const supplyType = determineSupply(
        company?.gst_registered,
        company?.state_code,
        form.place_of_supply || customer?.state_code
    );

    const setField = (name, value) => setForm((previous) => ({ ...previous, [name]: value }));

    const handleChange = (event) => {
        const { name, value } = event.target;
        if (name === "quotation_date") {
            setForm((previous) => ({
                ...previous,
                quotation_date: value,
                valid_until: validUntilTouched
                    ? previous.valid_until
                    : addDays(value, company?.quotation_valid_days || 15),
            }));
            return;
        }
        if (name === "valid_until") setValidUntilTouched(true);
        setField(name, value);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!form.rfq_id) return showToast("Please select an RFQ.", "error");
        if (form.valid_until && form.valid_until < form.quotation_date) {
            return showToast("Valid-until date cannot be before the quotation date.", "error");
        }
        const problem = validateItems(items);
        if (problem) return showToast(problem, "error");

        const payload = {
            rfq_id: Number(form.rfq_id),
            quotation_date: form.quotation_date,
            valid_until: form.valid_until || undefined,
            place_of_supply: form.place_of_supply || undefined,
            status: form.status,
            adjustment: Number(form.adjustment) || 0,
            notes: form.notes.trim(),
            terms_conditions: form.terms_conditions.trim(),
            items: itemsToApi(items),
        };

        try {
            setSaving(true);
            const response = isEditMode
                ? await api.put(`/quotations/${quotationId}`, payload)
                : await api.post("/quotations", payload);
            showToast(response.data?.message || "Quotation saved.", "success");
            navigate(response.data?.id ? `/quotations/${response.data.id}/preview` : "/quotations");
        } catch (error) {
            showToast(errorMessage(error, "Unable to save the quotation."), "error");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <MainLayout>
                <div className="quotations-page">
                    <PageHeader eyebrow="QUOTATIONS" title="Quotation" description="Loading…" />
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="quotations-page">
                <PageHeader
                    eyebrow="QUOTATIONS"
                    title={isEditMode ? "Edit Quotation" : "Create Quotation"}
                    description="Prepare a GST-ready quotation for your customer."
                />

                <form className="vf-form quotation-create-form" onSubmit={handleSubmit}>
                    <div className="quotation-form-section">
                        <div className="quotation-section-heading">
                            <h3>Quotation information</h3>
                            <p>Select the RFQ, dates, and place of supply.</p>
                        </div>

                        <div className="vf-form-row">
                            <div className="vf-form-group">
                                <label htmlFor="rfq_id">Customer / RFQ</label>
                                <select id="rfq_id" name="rfq_id" value={form.rfq_id} onChange={handleChange} required>
                                    <option value="">Select RFQ / customer</option>
                                    {rfqs.map((rfq) => (
                                        <option key={rfq.id} value={rfq.id}>
                                            {rfq.rfq_number} — {rfq.company_name}
                                        </option>
                                    ))}
                                </select>
                                {customer?.gstin && <small>Customer GSTIN: {customer.gstin}</small>}
                            </div>

                            <div className="vf-form-group">
                                <label htmlFor="quotation_date">Quotation date</label>
                                <input id="quotation_date" type="date" name="quotation_date" value={form.quotation_date} onChange={handleChange} required />
                            </div>

                            <div className="vf-form-group">
                                <label htmlFor="valid_until">Valid until</label>
                                <input id="valid_until" type="date" name="valid_until" value={form.valid_until} min={form.quotation_date} onChange={handleChange} />
                            </div>

                            <div className="vf-form-group">
                                <label htmlFor="status">Status</label>
                                <select id="status" name="status" value={form.status} onChange={handleChange}>
                                    {["Draft", "Sent", "Accepted", "Rejected", "Expired"].map((status) => (
                                        <option key={status} value={status}>{status}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {company?.gst_registered && (
                            <div className="vf-form-row">
                                <div className="vf-form-group">
                                    <label htmlFor="place_of_supply">Place of supply</label>
                                    <select
                                        id="place_of_supply"
                                        name="place_of_supply"
                                        value={form.place_of_supply}
                                        onChange={handleChange}
                                    >
                                        <option value="">
                                            {customer?.state_code
                                                ? `Customer's state (${states.find((s) => s.code === customer.state_code)?.name || customer.state_code})`
                                                : "Same as my state"}
                                        </option>
                                        {states.map((state) => (
                                            <option key={state.code} value={state.code}>
                                                {state.code} — {state.name}
                                            </option>
                                        ))}
                                    </select>
                                    <small>Decides CGST + SGST (same state) or IGST (other state).</small>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="quotation-form-section">
                        <div className="quotation-section-heading">
                            <h3>Items / services</h3>
                            <p>Pick a saved item from your catalog or type your own.</p>
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
                            <p>Defaults come from your company settings.</p>
                        </div>
                        <div className="vf-form-group">
                            <label htmlFor="notes">Notes</label>
                            <textarea id="notes" name="notes" value={form.notes} onChange={handleChange} rows="4" />
                        </div>
                        <div className="vf-form-group">
                            <label htmlFor="terms_conditions">Terms &amp; conditions</label>
                            <textarea id="terms_conditions" name="terms_conditions" value={form.terms_conditions} onChange={handleChange} rows="6" />
                        </div>
                    </div>

                    <div className="vf-form-actions">
                        <Button variant="secondary" onClick={() => navigate("/quotations")}>Cancel</Button>
                        <Button type="submit" disabled={saving}>
                            {saving ? "Saving…" : isEditMode ? "Update quotation" : "Create quotation"}
                        </Button>
                    </div>
                </form>
            </div>
        </MainLayout>
    );
}

export default CreateQuotation;
