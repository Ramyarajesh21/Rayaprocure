import { forwardRef, useEffect, useId, useMemo, useRef, useState } from "react";
import { formatDate, formatMoney } from "../utils/format";
import {
    labelsFor,
    mergeLayout,
    renderCustomTemplate,
    scopeCss,
} from "../utils/template";
import "./DocumentRenderer.css";

const money = (value) => formatMoney(value);

const A4_WIDTH_PX = 794; // 210mm at 96dpi

function StandardDocument({ docType, document, company, layout }) {
    const labels = labelsFor(docType, layout);
    const isInvoice = docType === "invoice";
    const accent = layout.accent || company.brand_color || "#1f4e79";
    const showTax = document.supply_type !== "none";
    const columns = layout.columns;
    const sections = layout.sections;
    const number = isInvoice ? document.invoice_number : document.quotation_number;
    const firstDate = isInvoice ? document.invoice_date : document.quotation_date;
    const secondDate = isInvoice ? document.due_date : document.valid_until;

    const items = document.items || [];
    const hasDiscount = columns.discount && items.some((item) => Number(item.discount_percent) > 0);

    const hasBank = sections.bankDetails && (company.bank_account_no || company.upi_id);

    return (
        <div
            className="doc-page"
            style={{ "--doc-accent": accent, fontFamily: layout.font, fontSize: `${layout.fontSize}px` }}
        >
            {layout.headerText && <div className="doc-banner">{layout.headerText}</div>}

            <header className={`doc-head doc-logo-${layout.logoPosition}`}>
                <div className="doc-company">
                    {layout.showLogo && company.logo_url && (
                        <img className="doc-logo" src={company.logo_url} alt="" crossOrigin="anonymous" />
                    )}
                    <div>
                        <h1>{company.company_name}</h1>
                        {company.address && <p className="doc-pre">{company.address}</p>}
                        <p>
                            {[company.phone, company.email].filter(Boolean).join("  |  ")}
                        </p>
                        {company.gstin && <p><strong>GSTIN:</strong> {company.gstin}</p>}
                        {company.pan && <p><strong>PAN:</strong> {company.pan}</p>}
                    </div>
                </div>
                <div className="doc-title-block">
                    <h2>{labels.title}</h2>
                    <table>
                        <tbody>
                            <tr><td>{labels.number}</td><td>{number}</td></tr>
                            <tr><td>{labels.date}</td><td>{formatDate(firstDate)}</td></tr>
                            {secondDate && <tr><td>{labels.secondDate}</td><td>{formatDate(secondDate)}</td></tr>}
                            {isInvoice && document.milestone_label && (
                                <tr><td>Milestone</td><td>{document.milestone_label}</td></tr>
                            )}
                            {layout.customFields.map((field, index) => (
                                <tr key={index}><td>{field.label}</td><td>{field.value}</td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </header>

            <section className="doc-parties">
                <div>
                    <h3>{labels.billTo}</h3>
                    <strong>{document.company_name}</strong>
                    {document.contact_person && <p>Attn: {document.contact_person}</p>}
                    {document.address && <p className="doc-pre">{document.address}</p>}
                    {document.customer_gstin && <p><strong>GSTIN:</strong> {document.customer_gstin}</p>}
                    {document.phone && <p>{document.phone}</p>}
                    {document.email && <p>{document.email}</p>}
                </div>
                {sections.shipTo && document.shipping_address && (
                    <div>
                        <h3>{labels.shipTo}</h3>
                        <p className="doc-pre">{document.shipping_address}</p>
                    </div>
                )}
                {sections.placeOfSupply && document.place_of_supply_name && showTax && (
                    <div>
                        <h3>{labels.placeOfSupply}</h3>
                        <strong>{document.place_of_supply_name}</strong>
                        {document.reverse_charge ? <p>Reverse charge: Yes</p> : null}
                    </div>
                )}
            </section>

            <table className="doc-items">
                <thead>
                    <tr>
                        {columns.serial && <th className="c">#</th>}
                        <th>{labels.item}</th>
                        {columns.hsn && <th>{labels.hsn}</th>}
                        <th className="r">{labels.qty}</th>
                        {columns.unit && <th>{labels.unit}</th>}
                        <th className="r">{labels.rate}</th>
                        {hasDiscount && <th className="r">{labels.discount}</th>}
                        {(columns.taxable || showTax) && <th className="r">{labels.taxable}</th>}
                        {columns.gst && showTax && <th className="r">{labels.gst}</th>}
                        <th className="r">{labels.amount}</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, index) => (
                        <tr key={item.id || index}>
                            {columns.serial && <td className="c">{index + 1}</td>}
                            <td>{item.description}</td>
                            {columns.hsn && <td>{item.hsn_sac}</td>}
                            <td className="r">{Number(item.quantity)}</td>
                            {columns.unit && <td>{item.unit}</td>}
                            <td className="r">{money(item.rate)}</td>
                            {hasDiscount && <td className="r">{Number(item.discount_percent)}</td>}
                            {(columns.taxable || showTax) && <td className="r">{money(item.taxable_amount)}</td>}
                            {columns.gst && showTax && <td className="r">{Number(item.gst_rate)}%</td>}
                            <td className="r">{money(showTax ? item.total_amount : item.taxable_amount)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <section className="doc-summary">
                <div className="doc-summary-left">
                    {sections.amountInWords && document.amount_in_words && (
                        <p><strong>{labels.words}:</strong> {document.amount_in_words}</p>
                    )}
                    {hasBank && (
                        <div className="doc-bank">
                            <h3>{labels.bank}</h3>
                            {company.bank_name && <p>{company.bank_name}{company.bank_branch ? `, ${company.bank_branch}` : ""}</p>}
                            {company.bank_account_name && <p>A/c name: {company.bank_account_name}</p>}
                            {company.bank_account_no && <p>A/c no: {company.bank_account_no}</p>}
                            {company.bank_ifsc && <p>IFSC: {company.bank_ifsc}</p>}
                            {company.upi_id && <p>UPI: {company.upi_id}</p>}
                        </div>
                    )}
                    {isInvoice && document.irn && <p className="doc-irn"><strong>IRN:</strong> {document.irn}</p>}
                </div>

                <table className="doc-totals">
                    <tbody>
                        <tr><td>{showTax ? "Taxable value" : "Sub total"}</td><td>{money(document.taxable_value || document.subtotal)}</td></tr>
                        {showTax && sections.gstBreakup && document.supply_type === "intra" && (
                            <>
                                <tr><td>CGST</td><td>{money(document.cgst_total)}</td></tr>
                                <tr><td>SGST</td><td>{money(document.sgst_total)}</td></tr>
                            </>
                        )}
                        {showTax && sections.gstBreakup && document.supply_type === "inter" && (
                            <tr><td>IGST</td><td>{money(document.igst_total)}</td></tr>
                        )}
                        {Number(document.adjustment) !== 0 && <tr><td>Adjustment</td><td>{money(document.adjustment)}</td></tr>}
                        {Number(document.round_off) !== 0 && <tr><td>Round off</td><td>{money(document.round_off)}</td></tr>}
                        <tr className="doc-grand"><td>Total</td><td>₹{money(document.grand_total)}</td></tr>
                        {isInvoice && Number(document.paid_amount) > 0 && (
                            <>
                                <tr><td>Paid</td><td>{money(document.paid_amount)}</td></tr>
                                <tr><td><strong>Balance due</strong></td><td><strong>₹{money(document.balance)}</strong></td></tr>
                            </>
                        )}
                    </tbody>
                </table>
            </section>

            {sections.notes && document.notes && (
                <section className="doc-block">
                    <h3>{labels.notes}</h3>
                    <p className="doc-pre">{document.notes}</p>
                </section>
            )}
            {sections.terms && document.terms_conditions && (
                <section className="doc-block">
                    <h3>{labels.terms}</h3>
                    <p className="doc-pre">{document.terms_conditions}</p>
                </section>
            )}

            {sections.signature && (
                <div className="doc-signature">
                    <span>For {company.company_name}</span>
                    {company.signature_url && <img src={company.signature_url} alt="" crossOrigin="anonymous" />}
                    <strong>{company.authorised_signatory || labels.signatory}</strong>
                </div>
            )}

            {layout.footerText && <footer className="doc-footer">{layout.footerText}</footer>}
        </div>
    );
}

// Renders a quotation/invoice with the company's chosen template.
const DocumentRenderer = forwardRef(function DocumentRenderer(
    { docType, document, company, template },
    ref
) {
    const scope = `doc-scope-${useId().replace(/:/g, "")}`;
    const layout = useMemo(() => mergeLayout(template?.layout), [template]);
    const customHtml = template?.custom_html;

    const html = useMemo(
        () => (customHtml ? renderCustomTemplate(customHtml, docType, document, company) : ""),
        [customHtml, docType, document, company]
    );
    const css = useMemo(
        () => (customHtml ? scopeCss(template?.custom_css, `.${scope}`) : ""),
        [customHtml, template, scope]
    );

    // Shrink the fixed-width A4 sheet to fit narrow screens (phones, side panels).
    const fitRef = useRef(null);
    const pageRef = useRef(null);
    const [fit, setFit] = useState({ scale: 1, height: null });

    useEffect(() => {
        const box = fitRef.current;
        const page = pageRef.current;
        if (!box || !page || typeof ResizeObserver === "undefined") return undefined;

        const measure = () => {
            const available = box.parentElement?.clientWidth || A4_WIDTH_PX;
            const scale = Math.min(1, available / A4_WIDTH_PX);
            setFit({ scale, height: scale < 1 ? page.offsetHeight * scale : null });
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(box.parentElement);
        observer.observe(page);
        return () => observer.disconnect();
    }, [document, company, template]);

    if (!document || !company) return null;

    const scaled = fit.scale < 1;

    return (
        <div ref={ref} className={`doc-root ${scope}`}>
            <div
                ref={fitRef}
                className="doc-fit"
                data-doc-fit
                style={scaled ? { height: fit.height, width: A4_WIDTH_PX * fit.scale } : undefined}
            >
                <div
                    ref={pageRef}
                    className="doc-fit-inner"
                    style={scaled ? { transform: `scale(${fit.scale})`, transformOrigin: "top left", width: A4_WIDTH_PX } : undefined}
                >
                    {customHtml ? (
                        <>
                            {css && <style>{css}</style>}
                            <div className="doc-page doc-custom" dangerouslySetInnerHTML={{ __html: html }} />
                        </>
                    ) : (
                        <StandardDocument docType={docType} document={document} company={company} layout={layout} />
                    )}
                </div>
            </div>
        </div>
    );
});

export default DocumentRenderer;
