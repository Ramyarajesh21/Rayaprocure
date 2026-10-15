import DOMPurify from "dompurify";
import { formatDate, formatMoney } from "./format";

// ---------------------------------------------------------------------------
// Layout options (the "no code" way to match an existing format)
// ---------------------------------------------------------------------------
export const DEFAULT_LABELS = {
    quotation: {
        title: "QUOTATION",
        number: "Quotation No.",
        date: "Date",
        secondDate: "Valid Until",
        billTo: "Quotation For",
        shipTo: "Ship To",
        placeOfSupply: "Place of Supply",
        item: "Description",
        hsn: "HSN/SAC",
        qty: "Qty",
        unit: "Unit",
        rate: "Rate",
        discount: "Disc %",
        taxable: "Taxable",
        gst: "GST %",
        amount: "Amount",
        bank: "Bank Details",
        terms: "Terms & Conditions",
        notes: "Notes",
        signatory: "Authorised Signatory",
        words: "Amount in words",
    },
    invoice: {
        title: "TAX INVOICE",
        number: "Invoice No.",
        date: "Invoice Date",
        secondDate: "Due Date",
        billTo: "Bill To",
        shipTo: "Ship To",
        placeOfSupply: "Place of Supply",
        item: "Description",
        hsn: "HSN/SAC",
        qty: "Qty",
        unit: "Unit",
        rate: "Rate",
        discount: "Disc %",
        taxable: "Taxable",
        gst: "GST %",
        amount: "Amount",
        bank: "Bank Details",
        terms: "Terms & Conditions",
        notes: "Notes",
        signatory: "Authorised Signatory",
        words: "Amount in words",
    },
};

export const DEFAULT_LAYOUT = {
    accent: "",
    font: "Arial, Helvetica, sans-serif",
    fontSize: 12,
    logoPosition: "left",
    showLogo: true,
    headerText: "",
    footerText: "",
    labels: {},
    columns: { serial: true, hsn: true, unit: true, discount: false, taxable: false, gst: true },
    sections: {
        placeOfSupply: true,
        shipTo: false,
        bankDetails: true,
        amountInWords: true,
        terms: true,
        notes: true,
        signature: true,
        gstBreakup: true,
    },
    customFields: [],
};

export function mergeLayout(layout) {
    const base = DEFAULT_LAYOUT;
    return {
        ...base,
        ...(layout || {}),
        labels: { ...(layout?.labels || {}) },
        columns: { ...base.columns, ...(layout?.columns || {}) },
        sections: { ...base.sections, ...(layout?.sections || {}) },
        customFields: Array.isArray(layout?.customFields) ? layout.customFields : [],
    };
}

export function labelsFor(docType, layout) {
    return { ...DEFAULT_LABELS[docType], ...(layout?.labels || {}) };
}

// ---------------------------------------------------------------------------
// Custom HTML templates: {{placeholders}}, {{#items}}…{{/items}}, {{#if x}}…{{/if}}
// ---------------------------------------------------------------------------
const escapeHtml = (value) =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

const FILTERS = {
    money: (value) => formatMoney(value),
    date: (value) => formatDate(value),
    upper: (value) => String(value ?? "").toUpperCase(),
    lines: (value) => String(value ?? "").split("\n").map(escapeHtml).join("<br>"),
};

// Flat, customer-friendly data available to templates.
export function buildContext(docType, document, company) {
    const isInvoice = docType === "invoice";
    return {
        doc_type: docType,
        title: DEFAULT_LABELS[docType].title,
        number: isInvoice ? document.invoice_number : document.quotation_number,
        date: isInvoice ? document.invoice_date : document.quotation_date,
        second_date: isInvoice ? document.due_date : document.valid_until,
        due_date: document.due_date,
        valid_until: document.valid_until,
        status: document.status,
        place_of_supply: document.place_of_supply_name || "",
        supply_type: document.supply_type,
        taxable_value: document.taxable_value,
        cgst_total: document.cgst_total,
        sgst_total: document.sgst_total,
        igst_total: document.igst_total,
        total_tax: document.total_tax,
        adjustment: document.adjustment,
        round_off: document.round_off,
        grand_total: document.grand_total,
        amount_in_words: document.amount_in_words,
        notes: document.notes,
        terms: document.terms_conditions,
        irn: document.irn,
        customer: {
            name: document.company_name,
            contact: document.contact_person || document.contact_name,
            address: document.address,
            shipping_address: document.shipping_address,
            gstin: document.customer_gstin,
            phone: document.phone,
            email: document.email,
        },
        company: {
            ...company,
            name: company.company_name,
            logo: company.logo_url,
        },
        items: (document.items || []).map((item, index) => ({ ...item, serial: index + 1 })),
        has_tax: document.supply_type !== "none",
        is_intra: document.supply_type === "intra",
        is_inter: document.supply_type === "inter",
    };
}

function lookup(scope, path) {
    return path.split(".").reduce((value, key) => (value == null ? value : value[key]), scope);
}

function resolveValue(expression, scope) {
    const [path, ...filters] = expression.split("|").map((part) => part.trim());
    let value = lookup(scope, path);
    let raw = false;
    filters.forEach((name) => {
        if (FILTERS[name]) {
            value = FILTERS[name](value);
            raw = name === "lines";
        }
    });
    return raw ? String(value ?? "") : escapeHtml(value);
}

function render(template, scope, depth = 0) {
    if (depth > 6) return "";

    // Loops: {{#items}} ... {{/items}}
    let output = template.replace(/\{\{#([\w.]+)\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, path, inner) => {
        const list = lookup(scope, path);
        if (!Array.isArray(list)) return "";
        return list.map((entry) => render(inner, { ...scope, ...entry, this: entry }, depth + 1)).join("");
    });

    // Conditionals: {{#if path}} ... {{/if}}
    output = output.replace(/\{\{#if ([\w.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, path, inner) => {
        const value = lookup(scope, path);
        const truthy = Array.isArray(value) ? value.length > 0 : Boolean(value) && Number(value) !== 0;
        return truthy ? render(inner, scope, depth + 1) : "";
    });

    return output.replace(/\{\{\s*([^#/}][^}]*?)\s*\}\}/g, (_, expression) => resolveValue(expression, scope));
}

export function sanitizeHtml(html) {
    return DOMPurify.sanitize(html, {
        FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "link", "meta", "base", "style"],
        FORBID_ATTR: ["srcdoc", "formaction"],
    });
}

// Prefix every selector so customer CSS cannot restyle the rest of the app.
export function scopeCss(css, scope) {
    if (!css) return "";
    const cleaned = css
        .replace(/@import[^;]+;/gi, "")
        .replace(/expression\s*\(/gi, "(")
        .replace(/javascript:/gi, "");
    return cleaned.replace(/(^|})\s*([^@{}][^{}]*)\{/g, (match, brace, selectors) => {
        const scoped = selectors
            .split(",")
            .map((selector) => `${scope} ${selector.trim().replace(/^(html|body)\b\s*/i, "")}`.trim())
            .join(", ");
        return `${brace}\n${scoped} {`;
    });
}

export function renderCustomTemplate(html, docType, document, company) {
    const context = buildContext(docType, document, company);
    return sanitizeHtml(render(html, context));
}

// Placeholder reference shown in the template editor.
export const PLACEHOLDER_HELP = [
    ["{{title}}", "Document title, e.g. TAX INVOICE"],
    ["{{number}}", "Invoice / quotation number"],
    ["{{date | date}}", "Document date (formatted)"],
    ["{{second_date | date}}", "Due date (invoice) or valid until (quotation)"],
    ["{{customer.name}}", "Customer name; also customer.address, customer.gstin, customer.contact, customer.phone, customer.email"],
    ["{{company.name}}", "Your company; also company.address, company.gstin, company.pan, company.phone, company.email, company.logo"],
    ["{{place_of_supply}}", "State of supply"],
    ["{{#items}} … {{/items}}", "Repeat for each line: serial, description, hsn_sac, quantity, unit, rate, discount_percent, gst_rate, taxable_amount, total_amount"],
    ["{{taxable_value | money}}", "Also cgst_total, sgst_total, igst_total, total_tax, round_off, adjustment, grand_total"],
    ["{{amount_in_words}}", "Grand total in words"],
    ["{{terms | lines}} / {{notes | lines}}", "Multi-line text"],
    ["{{#if is_intra}} … {{/if}}", "Conditional blocks: has_tax, is_intra, is_inter, irn"],
];
