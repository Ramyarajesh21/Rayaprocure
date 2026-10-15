import { useCallback, useEffect, useMemo, useState } from "react";

import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import Button from "../../components/Button";
import DocumentRenderer from "../../components/DocumentRenderer";
import { useToast } from "../../components/Toast/ToastContext";

import api from "../../services/api";
import { loadCompany } from "../../services/company";
import { errorMessage, todayISO } from "../../utils/format";
import {
    DEFAULT_LABELS,
    PLACEHOLDER_HELP,
    mergeLayout,
} from "../../utils/template";

const FONTS = [
    ["Arial, Helvetica, sans-serif", "Arial"],
    ["'Times New Roman', Times, serif", "Times New Roman"],
    ["Georgia, serif", "Georgia"],
    ["'Trebuchet MS', sans-serif", "Trebuchet"],
    ["Verdana, sans-serif", "Verdana"],
    ["'Courier New', monospace", "Courier"],
];

const COLUMN_LABELS = {
    serial: "Serial number (#)",
    hsn: "HSN/SAC",
    unit: "Unit",
    discount: "Discount % (when used)",
    taxable: "Taxable value",
    gst: "GST rate %",
};

const SECTION_LABELS = {
    placeOfSupply: "Place of supply",
    shipTo: "Ship-to address",
    bankDetails: "Bank & UPI details",
    amountInWords: "Amount in words",
    terms: "Terms & conditions",
    notes: "Notes",
    signature: "Signature block",
    gstBreakup: "CGST / SGST / IGST totals",
};

const STARTER_HTML = `<div style="font-family: Arial, sans-serif; font-size: 12px;">
  <table style="width:100%; border-bottom: 2px solid #333; margin-bottom: 10px;">
    <tr>
      <td>
        <h1 style="margin:0">{{company.name}}</h1>
        <div>{{company.address | lines}}</div>
        {{#if company.gstin}}<div>GSTIN: {{company.gstin}}</div>{{/if}}
      </td>
      <td style="text-align:right">
        <h2 style="margin:0">{{title}}</h2>
        <div>No: {{number}}</div>
        <div>Date: {{date | date}}</div>
        {{#if second_date}}<div>Due / Valid: {{second_date | date}}</div>{{/if}}
      </td>
    </tr>
  </table>

  <strong>To:</strong> {{customer.name}}<br>
  {{customer.address | lines}}<br>
  {{#if customer.gstin}}GSTIN: {{customer.gstin}}{{/if}}

  <table style="width:100%; border-collapse: collapse; margin-top: 12px;" border="1" cellpadding="5">
    <tr style="background:#eee">
      <th>#</th><th>Description</th><th>HSN</th><th>Qty</th><th>Rate</th><th>Amount</th>
    </tr>
    {{#items}}
    <tr>
      <td>{{serial}}</td><td>{{description}}</td><td>{{hsn_sac}}</td>
      <td style="text-align:right">{{quantity}} {{unit}}</td>
      <td style="text-align:right">{{rate | money}}</td>
      <td style="text-align:right">{{taxable_amount | money}}</td>
    </tr>
    {{/items}}
  </table>

  <table style="margin-left:auto; margin-top:8px;">
    <tr><td>Taxable value</td><td style="text-align:right">{{taxable_value | money}}</td></tr>
    {{#if is_intra}}
    <tr><td>CGST</td><td style="text-align:right">{{cgst_total | money}}</td></tr>
    <tr><td>SGST</td><td style="text-align:right">{{sgst_total | money}}</td></tr>
    {{/if}}
    {{#if is_inter}}<tr><td>IGST</td><td style="text-align:right">{{igst_total | money}}</td></tr>{{/if}}
    <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>{{grand_total | money}}</strong></td></tr>
  </table>
  <p>{{amount_in_words}}</p>
  <p>{{terms | lines}}</p>
</div>`;

function sampleDocument() {
    const items = [
        { id: 1, description: "Site survey and design", hsn_sac: "998313", quantity: 1, unit: "Job", rate: 12000, discount_percent: 0, gst_rate: 18, taxable_amount: 12000, cgst_amount: 1080, sgst_amount: 1080, igst_amount: 0, total_amount: 14160 },
        { id: 2, description: "Supply of control panels", hsn_sac: "8537", quantity: 4, unit: "Nos", rate: 8500, discount_percent: 0, gst_rate: 18, taxable_amount: 34000, cgst_amount: 3060, sgst_amount: 3060, igst_amount: 0, total_amount: 40120 },
        { id: 3, description: "Installation labour", hsn_sac: "9954", quantity: 3, unit: "Days", rate: 2500, discount_percent: 0, gst_rate: 18, taxable_amount: 7500, cgst_amount: 675, sgst_amount: 675, igst_amount: 0, total_amount: 8850 },
    ];
    return {
        id: 0,
        quotation_number: "QTN-0001",
        invoice_number: "INV-0001",
        quotation_date: todayISO(),
        invoice_date: todayISO(),
        valid_until: todayISO(),
        due_date: todayISO(),
        status: "Draft",
        company_name: "Sample Customer Pvt Ltd",
        contact_person: "Ravi Kumar",
        address: "12, Industrial Estate\nCoimbatore, Tamil Nadu 641001",
        customer_gstin: "33ABCDE1234F1Z5",
        phone: "+91 98765 43210",
        email: "accounts@samplecustomer.in",
        place_of_supply_name: "Tamil Nadu",
        supply_type: "intra",
        taxable_value: 53500,
        subtotal: 53500,
        cgst_total: 4815,
        sgst_total: 4815,
        igst_total: 0,
        total_tax: 9630,
        adjustment: 0,
        round_off: 0,
        grand_total: 63130,
        paid_amount: 0,
        balance: 63130,
        amount_in_words: "Indian Rupees Sixty-Three Thousand One Hundred Thirty Only",
        notes: "Thank you for your business.",
        terms_conditions: "1. Payment within 15 days.\n2. Goods once sold will not be taken back.",
        items,
    };
}

const emptyTemplate = (docType) => ({
    id: null,
    name: "",
    doc_type: docType,
    is_default: false,
    layout: mergeLayout({}),
    custom_html: "",
    custom_css: "",
});

function Toggle({ label, checked, onChange }) {
    return (
        <label className="pf-check">
            <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
            {label}
        </label>
    );
}

function Templates() {
    const { showToast } = useToast();
    const [docType, setDocType] = useState("invoice");
    const [templates, setTemplates] = useState([]);
    const [draft, setDraft] = useState(null);
    const [mode, setMode] = useState("layout");
    const [company, setCompany] = useState(null);
    const [saving, setSaving] = useState(false);

    const refresh = useCallback(() => {
        api.get("/api/templates", { params: { doc_type: docType } })
            .then(({ data }) => setTemplates(data))
            .catch(() => showToast("Unable to load templates.", "error"));
    }, [docType, showToast]);

    useEffect(() => {
        refresh();
        setDraft(null);
    }, [refresh]);

    useEffect(() => {
        loadCompany(true).then(setCompany).catch(() => {});
    }, []);

    const sample = useMemo(() => sampleDocument(), []);

    const open = (template) => {
        setDraft({ ...template, layout: mergeLayout(template.layout), custom_html: template.custom_html || "", custom_css: template.custom_css || "" });
        setMode(template.custom_html ? "html" : "layout");
    };

    const updateLayout = (patch) => setDraft((current) => ({ ...current, layout: { ...current.layout, ...patch } }));
    const updateNested = (key, name, value) =>
        setDraft((current) => ({ ...current, layout: { ...current.layout, [key]: { ...current.layout[key], [name]: value } } }));

    const save = async () => {
        if (!draft.name.trim()) return showToast("Give the template a name.", "error");
        setSaving(true);
        try {
            const payload = {
                name: draft.name,
                doc_type: docType,
                is_default: draft.is_default,
                layout: draft.layout,
                custom_html: mode === "html" ? draft.custom_html : "",
                custom_css: mode === "html" ? draft.custom_css : "",
            };
            if (draft.id) await api.put(`/api/templates/${draft.id}`, payload);
            else {
                const { data } = await api.post("/api/templates", payload);
                setDraft((current) => ({ ...current, id: data.id }));
            }
            showToast("Template saved.", "success");
            refresh();
        } catch (error) {
            showToast(errorMessage(error, "Unable to save the template."), "error");
        } finally {
            setSaving(false);
        }
    };

    const remove = async (template) => {
        if (!window.confirm(`Delete template "${template.name}"?`)) return;
        try {
            await api.delete(`/api/templates/${template.id}`);
            if (draft?.id === template.id) setDraft(null);
            refresh();
        } catch (error) {
            showToast(errorMessage(error, "Unable to delete the template."), "error");
        }
    };

    const makeDefault = async (template) => {
        try {
            await api.post(`/api/templates/${template.id}/default`);
            refresh();
        } catch (error) {
            showToast(errorMessage(error, "Unable to set the default."), "error");
        }
    };

    const previewTemplate = draft
        ? {
              layout: draft.layout,
              custom_html: mode === "html" ? draft.custom_html : "",
              custom_css: mode === "html" ? draft.custom_css : "",
          }
        : null;

    const labels = DEFAULT_LABELS[docType];

    return (
        <MainLayout>
            <div className="pf-page" style={{ maxWidth: "1400px" }}>
                <PageHeader
                    eyebrow="BRAND & DOCUMENTS"
                    title="Document Templates"
                    description="Make quotations and invoices look like the format your customers already know."
                    action={<Button onClick={() => { setDraft(emptyTemplate(docType)); setMode("layout"); }}>+ New template</Button>}
                />

                <div className="pf-tabs">
                    {[["invoice", "Invoice templates"], ["quotation", "Quotation templates"]].map(([key, label]) => (
                        <button key={key} type="button" className={`pf-tab${docType === key ? " active" : ""}`} onClick={() => setDocType(key)}>
                            {label}
                        </button>
                    ))}
                </div>

                <div className="pf-card">
                    <h3>Your templates</h3>
                    {templates.length === 0 ? (
                        <p>No custom templates yet — documents use the standard GST layout. Create one to change labels, columns, colours, or paste your own HTML.</p>
                    ) : (
                        <div className="pf-scroll">
                            <table className="pf-table">
                                <thead><tr><th>Name</th><th>Type</th><th /></tr></thead>
                                <tbody>
                                    {templates.map((template) => (
                                        <tr key={template.id}>
                                            <td>{template.name} {template.is_default && <span className="pf-pill ok">Default</span>}</td>
                                            <td>{template.custom_html ? "Custom HTML" : "Layout options"}</td>
                                            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                                <button type="button" className="pf-link" onClick={() => open(template)}>Edit</button>
                                                {!template.is_default && <button type="button" className="pf-link" onClick={() => makeDefault(template)}>Make default</button>}
                                                <button type="button" className="pf-link danger" onClick={() => remove(template)}>Delete</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {draft && (
                    <div className="pf-split">
                        <div className="pf-card">
                            <h3>{draft.id ? "Edit template" : "New template"}</h3>
                            <div className="pf-grid">
                                <label className="pf-field pf-wide"><span>Template name</span>
                                    <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Company letterhead format" />
                                </label>
                            </div>
                            <Toggle label="Use as the default for new documents" checked={draft.is_default} onChange={(value) => setDraft({ ...draft, is_default: value })} />

                            <div className="pf-tabs">
                                <button type="button" className={`pf-tab${mode === "layout" ? " active" : ""}`} onClick={() => setMode("layout")}>Layout options</button>
                                <button type="button" className={`pf-tab${mode === "html" ? " active" : ""}`} onClick={() => setMode("html")}>Custom HTML (advanced)</button>
                            </div>

                            {mode === "layout" && (
                                <>
                                    <div className="pf-grid">
                                        <label className="pf-field"><span>Document title</span>
                                            <input value={draft.layout.labels.title ?? labels.title} onChange={(event) => updateNested("labels", "title", event.target.value)} />
                                        </label>
                                        <label className="pf-field"><span>Accent colour</span>
                                            <input type="color" value={draft.layout.accent || company?.brand_color || "#1f4e79"} onChange={(event) => updateLayout({ accent: event.target.value })} />
                                        </label>
                                        <label className="pf-field"><span>Font</span>
                                            <select value={draft.layout.font} onChange={(event) => updateLayout({ font: event.target.value })}>
                                                {FONTS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
                                            </select>
                                        </label>
                                        <label className="pf-field"><span>Font size (px)</span>
                                            <input type="number" min="9" max="16" value={draft.layout.fontSize} onChange={(event) => updateLayout({ fontSize: Number(event.target.value) || 12 })} />
                                        </label>
                                        <label className="pf-field"><span>Logo position</span>
                                            <select value={draft.layout.logoPosition} onChange={(event) => updateLayout({ logoPosition: event.target.value })}>
                                                <option value="left">Left</option><option value="right">Right</option><option value="center">Centre</option>
                                            </select>
                                        </label>
                                        <Toggle label="Show logo" checked={draft.layout.showLogo} onChange={(value) => updateLayout({ showLogo: value })} />
                                        <label className="pf-field pf-wide"><span>Header banner text</span>
                                            <input value={draft.layout.headerText} onChange={(event) => updateLayout({ headerText: event.target.value })} placeholder="Optional line above the header" />
                                        </label>
                                        <label className="pf-field pf-wide"><span>Footer text</span>
                                            <input value={draft.layout.footerText} onChange={(event) => updateLayout({ footerText: event.target.value })} placeholder="e.g. Registered office address · CIN" />
                                        </label>
                                    </div>

                                    <h3>Table columns</h3>
                                    <div className="pf-grid">
                                        {Object.entries(COLUMN_LABELS).map(([key, label]) => (
                                            <Toggle key={key} label={label} checked={draft.layout.columns[key]} onChange={(value) => updateNested("columns", key, value)} />
                                        ))}
                                    </div>

                                    <h3>Sections</h3>
                                    <div className="pf-grid">
                                        {Object.entries(SECTION_LABELS).map(([key, label]) => (
                                            <Toggle key={key} label={label} checked={draft.layout.sections[key]} onChange={(value) => updateNested("sections", key, value)} />
                                        ))}
                                    </div>

                                    <h3>Wording</h3>
                                    <p className="pf-help">Rename any heading to match the wording your customers expect.</p>
                                    <div className="pf-grid">
                                        {Object.entries(labels).filter(([key]) => key !== "title").map(([key, fallback]) => (
                                            <label className="pf-field" key={key}><span>{fallback}</span>
                                                <input value={draft.layout.labels[key] ?? ""} placeholder={fallback} onChange={(event) => updateNested("labels", key, event.target.value)} />
                                            </label>
                                        ))}
                                    </div>

                                    <h3>Extra header fields</h3>
                                    <p className="pf-help">Fixed label/value lines such as Vendor Code or PO Number.</p>
                                    {draft.layout.customFields.map((field, index) => (
                                        <div className="pf-grid" key={index}>
                                            <input value={field.label} placeholder="Label" onChange={(event) => updateLayout({ customFields: draft.layout.customFields.map((f, i) => (i === index ? { ...f, label: event.target.value } : f)) })} />
                                            <div style={{ display: "flex", gap: 8 }}>
                                                <input style={{ flex: 1 }} value={field.value} placeholder="Value" onChange={(event) => updateLayout({ customFields: draft.layout.customFields.map((f, i) => (i === index ? { ...f, value: event.target.value } : f)) })} />
                                                <button type="button" className="pf-link danger" onClick={() => updateLayout({ customFields: draft.layout.customFields.filter((_, i) => i !== index) })}>Remove</button>
                                            </div>
                                        </div>
                                    ))}
                                    <div><button type="button" className="pf-link" onClick={() => updateLayout({ customFields: [...draft.layout.customFields, { label: "", value: "" }] })}>+ Add field</button></div>
                                </>
                            )}

                            {mode === "html" && (
                                <>
                                    <p className="pf-help">
                                        Paste HTML that copies your existing format. Use placeholders like <code>{"{{number}}"}</code> and repeat rows with <code>{"{{#items}} … {{/items}}"}</code>. Scripts, forms and frames are removed for safety.
                                    </p>
                                    <div><button type="button" className="pf-link" onClick={() => setDraft({ ...draft, custom_html: STARTER_HTML })}>Insert starter template</button></div>
                                    <label className="pf-field"><span>HTML</span>
                                        <textarea className="pf-code" rows="16" value={draft.custom_html} onChange={(event) => setDraft({ ...draft, custom_html: event.target.value })} spellCheck={false} />
                                    </label>
                                    <label className="pf-field"><span>CSS (optional)</span>
                                        <textarea className="pf-code" rows="6" value={draft.custom_css} onChange={(event) => setDraft({ ...draft, custom_css: event.target.value })} spellCheck={false} />
                                    </label>
                                    <details>
                                        <summary>Available placeholders</summary>
                                        <table className="pf-table"><tbody>
                                            {PLACEHOLDER_HELP.map(([code, help]) => (<tr key={code}><td><code>{code}</code></td><td>{help}</td></tr>))}
                                        </tbody></table>
                                    </details>
                                </>
                            )}

                            <div className="pf-actions">
                                <Button variant="secondary" onClick={() => setDraft(null)}>Close</Button>
                                <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save template"}</Button>
                            </div>
                        </div>

                        <div>
                            <h3 style={{ margin: "0 0 8px" }}>Live preview (sample data)</h3>
                            <div className="pf-preview">
                                {company && (
                                    <DocumentRenderer docType={docType} document={sample} company={company} template={previewTemplate} />
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
}

export default Templates;
