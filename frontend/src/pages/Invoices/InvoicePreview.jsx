import "./Invoices.css";
import "../Quotations/Quotations.css";

import { useEffect, useRef, useState } from "react";
import {
    useNavigate,
    useParams,
} from "react-router-dom";

import html2canvas from "html2canvas";
import jsPDF from "jspdf";

import api from "../../services/api";

import MainLayout from "../../layouts/MainLayout";
import Button from "../../components/Button";

import { useToast } from "../../components/Toast/ToastContext";


function formatDate(dateString) {
    if (!dateString) {
        return "-";
    }

    let date;

    if (dateString instanceof Date) {
        date = dateString;
    } else if (typeof dateString === "string") {
        const value = dateString.trim();

        if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            date = new Date(`${value}T00:00:00`);
        } else {
            date = new Date(value);
        }
    } else {
        date = new Date(dateString);
    }

    if (Number.isNaN(date.getTime())) {
        return "-";
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}


function formatMoney(value) {
    return Number(value || 0).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}


function getStatusClass(status) {
    const normalizedStatus = String(
        status || "Submitted"
    ).toLowerCase();

    if (normalizedStatus === "approved") {
        return "status-accepted";
    }

    return "status-draft";
}


function InvoicePreview() {
    const navigate = useNavigate();

    const { invoiceId } = useParams();

    const { showToast } = useToast();

    const invoiceRef = useRef(null);

    const [invoice, setInvoice] = useState(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const [sending, setSending] = useState(false);


    // =====================================================
    // LOAD INVOICE
    // =====================================================

    useEffect(() => {
        const loadInvoice = async () => {
            try {
                setLoading(true);

                /*
                 * =================================================
                 * EXISTING SAVED INVOICE
                 * =================================================
                 */

                if (invoiceId) {
                    const response = await api.get(
                        `/invoices/${invoiceId}`
                    );

                    setInvoice(response.data);

                    return;
                }


                /*
                 * =================================================
                 * NEW INVOICE PREVIEW
                 *
                 * CreateInvoice stores preview data in
                 * sessionStorage before navigating here.
                 * =================================================
                 */

                const storedPreview =
                    sessionStorage.getItem(
                        "rayaprocure_invoice_preview"
                    );

                if (storedPreview) {
                    const parsedInvoice =
                        JSON.parse(storedPreview);

                    setInvoice(parsedInvoice);

                    return;
                }

                setInvoice(null);

            } catch (error) {
                console.error(
                    "Error loading invoice preview:",
                    error
                );

                showToast(
                    error.response?.data?.message ||
                        "Unable to load invoice preview.",
                    "error"
                );

                setInvoice(null);

            } finally {
                setLoading(false);
            }
        };

        loadInvoice();
    }, [invoiceId, showToast]);


    // =====================================================
    // BACK
    // =====================================================

    const handleBack = () => {
        navigate("/invoices");
    };


    // =====================================================
    // EDIT
    // =====================================================

    const handleEdit = () => {
        if (!invoice?.id) {
            showToast(
                "Save the invoice before editing it.",
                "error"
            );

            return;
        }

        navigate(
            `/invoices/create?edit=${invoice.id}`
        );
    };


    // =====================================================
    // DOWNLOAD PDF
    //
    // Same PDF generation method as QuotationPreview.
    // The exact visible A4 document is captured.
    // =====================================================

    const handleDownloadPDF = async () => {
        if (!invoiceRef.current || !invoice) {
            return;
        }

        try {
            setDownloading(true);

            const element = invoiceRef.current;

            const canvas = await html2canvas(
                element,
                {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: "#ffffff",
                    logging: false,
                }
            );

            const pdf = new jsPDF(
                "p",
                "mm",
                "a4"
            );

            const pageWidth =
                pdf.internal.pageSize.getWidth();

            const pageHeight =
                pdf.internal.pageSize.getHeight();

            const pxPerMm =
                canvas.width / pageWidth;

            const pageHeightPx =
                Math.floor(
                    pageHeight * pxPerMm
                );

            let offsetY = 0;
            let pageNumber = 0;

            while (offsetY < canvas.height) {
                const sliceHeight = Math.min(
                    pageHeightPx,
                    canvas.height - offsetY
                );

                const pageCanvas =
                    document.createElement("canvas");

                pageCanvas.width =
                    canvas.width;

                pageCanvas.height =
                    sliceHeight;

                const pageContext =
                    pageCanvas.getContext("2d");

                pageContext.fillStyle =
                    "#ffffff";

                pageContext.fillRect(
                    0,
                    0,
                    pageCanvas.width,
                    pageCanvas.height
                );

                pageContext.drawImage(
                    canvas,
                    0,
                    offsetY,
                    canvas.width,
                    sliceHeight,
                    0,
                    0,
                    canvas.width,
                    sliceHeight
                );

                const pageImage =
                    pageCanvas.toDataURL(
                        "image/png"
                    );

                const imageHeight =
                    sliceHeight / pxPerMm;

                if (pageNumber > 0) {
                    pdf.addPage();
                }

                pdf.addImage(
                    pageImage,
                    "PNG",
                    0,
                    0,
                    pageWidth,
                    imageHeight
                );

                offsetY += sliceHeight;
                pageNumber += 1;
            }

            const invoiceNumber =
                invoice.invoice_number ||
                `INV-${String(
                    invoice.id || "Preview"
                ).padStart(5, "0")}`;

            pdf.save(
                `${invoiceNumber}.pdf`
            );

            showToast(
                "Invoice PDF downloaded successfully.",
                "success"
            );

        } catch (error) {
            console.error(
                "Invoice PDF download error:",
                error
            );

            showToast(
                "Unable to download invoice PDF.",
                "error"
            );

        } finally {
            setDownloading(false);
        }
    };


    // =====================================================
    // SEND
    // =====================================================

    const handleSend = async () => {
        if (!invoice) {
            return;
        }

        try {
            setSending(true);

            const email =
                invoice.email ||
                invoice.customer?.email ||
                "";

            if (!email) {
                showToast(
                    "Customer email address is not available.",
                    "error"
                );

                return;
            }

            const invoiceNumber =
                invoice.invoice_number ||
                "";

            const subject =
                `Invoice ${invoiceNumber} - RayaProcure`;

            const body =
                `Dear ${
                    invoice.contact_name ||
                    invoice.customer?.contact_name ||
                    "Customer"
                },

Please find invoice ${
                    invoiceNumber
                } from RayaProcure.

Amount: ₹${formatMoney(
                    invoice.amount
                )}

Due Date: ${
                    formatDate(
                        invoice.due_date
                    )
                }

Payment Status: ${
                    invoice.payment_status ||
                    "Pending"
                }

Regards,
RayaProcure`;

            window.location.href =
                `mailto:${email}?subject=${encodeURIComponent(
                    subject
                )}&body=${encodeURIComponent(
                    body
                )}`;

            showToast(
                "Email composer opened.",
                "success"
            );

        } catch (error) {
            console.error(
                "Send invoice error:",
                error
            );

            showToast(
                "Unable to send invoice.",
                "error"
            );

        } finally {
            setSending(false);
        }
    };


    // =====================================================
    // LOADING
    // =====================================================

    if (loading) {
        return (
            <MainLayout>
                <div className="quotation-preview-page">

                    <div className="quotation-preview-loading">

                        <div className="quotation-preview-loading-spinner" />

                        <span>
                            Preparing invoice...
                        </span>

                    </div>

                </div>
            </MainLayout>
        );
    }


    // =====================================================
    // NOT FOUND
    // =====================================================

    if (!invoice) {
        return (
            <MainLayout>
                <div className="quotation-preview-page">

                    <div className="quotation-preview-error">

                        <div className="quotation-preview-error-icon">
                            !
                        </div>

                        <h2>
                            Invoice not found
                        </h2>

                        <p>
                            The requested invoice could not
                            be loaded.
                        </p>

                        <Button
                            onClick={() =>
                                navigate(
                                    "/invoices"
                                )
                            }
                        >
                            Back to Invoices
                        </Button>

                    </div>

                </div>
            </MainLayout>
        );
    }


    // =====================================================
    // DERIVED DATA
    // =====================================================

    const amount =
        Number(
            invoice.amount || 0
        );

    const subtotal =
        invoice.subtotal !== undefined &&
        invoice.subtotal !== null
            ? Number(invoice.subtotal)
            : amount;

    const adjustment =
        invoice.adjustment !== undefined &&
        invoice.adjustment !== null
            ? Number(invoice.adjustment)
            : 0;

    const paymentStatus =
        invoice.payment_status ||
        "Pending";

    const invoiceStatus =
        invoice.status ||
        "Submitted";

    const statusClass =
        getStatusClass(
            invoiceStatus
        );

    const invoiceNumber =
        invoice.invoice_number ||
        `INV-${String(
            invoice.id || "Preview"
        ).padStart(5, "0")}`;

    const description =
        invoice.description ||
        invoice.job_name ||
        invoice.job?.job_name ||
        invoice.quotation?.description ||
        "Work / Service";

    const quantity =
        invoice.quantity ||
        1;

    const unit =
        invoice.unit ||
        "Job";

    const rate =
        invoice.rate !== undefined &&
        invoice.rate !== null
            ? Number(invoice.rate)
            : amount;

    const customer =
        invoice.customer ||
        {};

    const companyName =
        invoice.company_name ||
        customer.company_name ||
        "Customer Company";

    const contactName =
        invoice.contact_name ||
        customer.contact_name ||
        "";

    const phone =
        invoice.phone ||
        customer.phone ||
        "";

    const email =
        invoice.email ||
        customer.email ||
        "";

    const jobName =
        invoice.job_name ||
        invoice.job?.job_name ||
        "";

    const quotationNumber =
        invoice.quotation_number ||
        invoice.quotation?.quotation_number ||
        "";

    const rfqNumber =
        invoice.rfq_number ||
        invoice.rfq?.rfq_number ||
        "";


    // =====================================================
    // PAGE
    // =====================================================

    return (
        <MainLayout>

            <div className="quotation-preview-page">

                {/* =================================================
                    PREVIEW TOOLBAR
                ================================================= */}

                <div className="quotation-preview-toolbar">

                    <div className="quotation-preview-heading">

                        <span className="quotation-preview-eyebrow">
                            INVOICE PREVIEW
                        </span>

                        <div className="quotation-preview-title-row">

                            <h1>
                                {invoiceNumber}
                            </h1>

                            <span
                                className={`quotation-preview-status ${statusClass}`}
                            >
                                {invoiceStatus}
                            </span>

                        </div>

                    </div>


                    <div className="quotation-preview-actions">

                        <Button
                            variant="secondary"
                            onClick={handleBack}
                        >
                            ← Back
                        </Button>


                        <Button
                            variant="secondary"
                            onClick={handleEdit}
                            disabled={!invoice.id}
                        >
                            ✏ Edit
                        </Button>


                        <Button
                            onClick={
                                handleDownloadPDF
                            }
                            disabled={
                                downloading
                            }
                        >
                            {downloading
                                ? "Preparing PDF..."
                                : "⬇ Download PDF"}
                        </Button>


                        <button
                            type="button"
                            className="quotation-send-button"
                            onClick={handleSend}
                            disabled={sending}
                        >
                            {sending
                                ? "Opening..."
                                : "✉ Send"}
                        </button>

                    </div>

                </div>


                {/* =================================================
                    PREMIUM A4 INVOICE DOCUMENT
                    SAME STRUCTURE AS QUOTATION PREVIEW
                ================================================= */}

                <div className="quotation-document-wrapper">

                    <div
                        className="quotation-document"
                        ref={invoiceRef}
                    >

                        {/* =================================================
                            TOP ACCENT
                        ================================================= */}

                        <div className="quotation-document-top-accent" />


                        {/* =================================================
                            DOCUMENT HEADER
                        ================================================= */}

                        <header className="quotation-document-header">

                            <div className="quotation-brand-row">

                                <div className="quotation-brand-mark">
                                    RP
                                </div>

                                <div className="quotation-brand-content">

                                    <div className="quotation-brand">
                                        RayaProcure
                                    </div>

                                    <div className="quotation-brand-subtitle">
                                        Vendor Work Order &amp;
                                        Job Management System
                                    </div>

                                </div>

                            </div>


                            <div className="quotation-title-block">

                                <div className="quotation-main-title">
                                    TAX INVOICE
                                </div>

                                <div className="quotation-document-gold-line" />

                                <div className="quotation-number">
                                    {invoiceNumber}
                                </div>

                            </div>

                        </header>


                        {/* =================================================
                            INVOICE DETAILS + BILL TO
                        ================================================= */}

                        <section className="quotation-top-details">

                            {/* -----------------------------------------
                                INVOICE DETAILS
                            ----------------------------------------- */}

                            <div className="quotation-meta-box">

                                <div className="quotation-card-heading">

                                    <span className="quotation-card-icon">
                                        ◈
                                    </span>

                                    INVOICE DETAILS

                                </div>


                                <div className="quotation-meta-list">

                                    <div className="quotation-meta-row">

                                        <span>
                                            INVOICE DATE
                                        </span>

                                        <strong>
                                            {formatDate(
                                                invoice.invoice_date
                                            )}
                                        </strong>

                                    </div>


                                    <div className="quotation-meta-row">

                                        <span>
                                            DUE DATE
                                        </span>

                                        <strong>
                                            {formatDate(
                                                invoice.due_date
                                            )}
                                        </strong>

                                    </div>


                                    <div className="quotation-meta-row">

                                        <span>
                                            JOB
                                        </span>

                                        <strong>
                                            {jobName || "-"}
                                        </strong>

                                    </div>


                                    <div className="quotation-meta-row">

                                        <span>
                                            STATUS
                                        </span>

                                        <strong
                                            className={`quotation-document-status ${statusClass}`}
                                        >
                                            {invoiceStatus}
                                        </strong>

                                    </div>

                                </div>

                            </div>


                            {/* -----------------------------------------
                                BILL TO
                            ----------------------------------------- */}

                            <div className="quotation-bill-box">

                                <div className="quotation-section-label">
                                    BILL TO
                                </div>

                                <div className="quotation-bill-content">

                                    <h3>
                                        {companyName}
                                    </h3>


                                    {contactName && (
                                        <p>
                                            <strong>
                                                Contact
                                            </strong>
                                            {" · "}
                                            {contactName}
                                        </p>
                                    )}


                                    {phone && (
                                        <p>
                                            <strong>
                                                Phone
                                            </strong>
                                            {" · "}
                                            {phone}
                                        </p>
                                    )}


                                    {email && (
                                        <p>
                                            <strong>
                                                Email
                                            </strong>
                                            {" · "}
                                            {email}
                                        </p>
                                    )}


                                    {(quotationNumber ||
                                        rfqNumber) && (

                                        <div className="quotation-bill-contact">

                                            {quotationNumber && (
                                                <span>
                                                    <strong>
                                                        Quotation
                                                    </strong>
                                                    {" · "}
                                                    {quotationNumber}
                                                </span>
                                            )}

                                            {rfqNumber && (
                                                <span>
                                                    <strong>
                                                        RFQ
                                                    </strong>
                                                    {" · "}
                                                    {rfqNumber}
                                                </span>
                                            )}

                                        </div>

                                    )}

                                </div>

                            </div>

                        </section>


                        {/* =================================================
                            INVOICE ITEMS
                        ================================================= */}

                        <section className="quotation-items-section">

                            <div className="quotation-items-heading">

                                <div>

                                    <div className="quotation-section-label">
                                        INVOICE ITEMS
                                    </div>

                                    <div className="quotation-items-caption">
                                        Work / services supplied
                                    </div>

                                </div>


                                <div className="quotation-items-count">
                                    01 ITEM
                                </div>

                            </div>


                            <table className="quotation-document-table">

                                <thead>

                                    <tr>

                                        <th className="quotation-sno">
                                            #
                                        </th>

                                        <th className="quotation-description-column">
                                            Description
                                        </th>

                                        <th className="quotation-qty">
                                            Qty
                                        </th>

                                        <th className="quotation-unit">
                                            Unit
                                        </th>

                                        <th className="quotation-rate">
                                            Rate
                                        </th>

                                        <th className="quotation-amount">
                                            Amount
                                        </th>

                                    </tr>

                                </thead>


                                <tbody>

                                    <tr>

                                        <td className="quotation-sno">
                                            01
                                        </td>


                                        <td className="quotation-description-cell">

                                            <strong>
                                                {description}
                                            </strong>

                                        </td>


                                        <td className="quotation-qty">
                                            {quantity}
                                        </td>


                                        <td className="quotation-unit">
                                            {unit}
                                        </td>


                                        <td className="quotation-rate">
                                            ₹
                                            {formatMoney(
                                                rate
                                            )}
                                        </td>


                                        <td className="quotation-amount">
                                            ₹
                                            {formatMoney(
                                                amount
                                            )}
                                        </td>

                                    </tr>

                                </tbody>

                            </table>

                        </section>


                        {/* =================================================
                            TOTALS
                        ================================================= */}

                        <section className="quotation-document-totals">

                            <div className="quotation-document-total-row">

                                <span>
                                    Subtotal
                                </span>

                                <strong>
                                    ₹
                                    {formatMoney(
                                        subtotal
                                    )}
                                </strong>

                            </div>


                            <div className="quotation-document-total-row">

                                <span>
                                    Adjustment
                                </span>

                                <strong>
                                    ₹
                                    {formatMoney(
                                        adjustment
                                    )}
                                </strong>

                            </div>


                            <div className="quotation-document-grand-total">

                                <div>

                                    <span>
                                        GRAND TOTAL
                                    </span>

                                    <small>
                                        Amount payable
                                    </small>

                                </div>

                                <strong>
                                    ₹
                                    {formatMoney(
                                        amount
                                    )}
                                </strong>

                            </div>

                        </section>


                        {/* =================================================
                            PAYMENT DETAILS
                        ================================================= */}

                        <section className="quotation-document-section">

                            <div className="quotation-document-section-heading">

                                <span className="quotation-section-number">
                                    01
                                </span>

                                <h3>
                                    Payment Details
                                </h3>

                            </div>


                            <div className="quotation-document-text">

                                <strong>
                                    Payment Status
                                </strong>

                                {" · "}

                                {paymentStatus}

                            </div>

                        </section>


                        {/* =================================================
                            NOTES + TERMS
                        ================================================= */}

                        <div className="quotation-document-bottom-grid">

                            {/* -----------------------------------------
                                NOTES
                            ----------------------------------------- */}

                            {invoice.notes && (

                                <section className="quotation-document-section">

                                    <div className="quotation-document-section-heading">

                                        <span className="quotation-section-number">
                                            02
                                        </span>

                                        <h3>
                                            Notes
                                        </h3>

                                    </div>


                                    <div className="quotation-document-text">
                                        {invoice.notes}
                                    </div>

                                </section>

                            )}


                            {/* -----------------------------------------
                                TERMS
                            ----------------------------------------- */}

                            {invoice.terms_conditions && (

                                <section className="quotation-document-section">

                                    <div className="quotation-document-section-heading">

                                        <span className="quotation-section-number">
                                            03
                                        </span>

                                        <h3>
                                            Terms &amp; Conditions
                                        </h3>

                                    </div>


                                    <div className="quotation-document-text quotation-terms">
                                        {invoice.terms_conditions}
                                    </div>

                                </section>

                            )}

                        </div>


                        {/* =================================================
                            SIGNATURE
                        ================================================= */}

                        <section className="quotation-signature-section">

                            <div className="quotation-signature-box">

                                <div className="quotation-signature-label">
                                    AUTHORIZED SIGNATORY
                                </div>

                                <div className="quotation-signature-space" />

                                <div className="quotation-signature-line" />

                                <strong>
                                    Authorized Signatory
                                </strong>

                                <span>
                                    For RayaProcure
                                </span>

                            </div>

                        </section>


                        {/* =================================================
                            FOOTER
                        ================================================= */}

                        <footer className="quotation-document-footer">

                            <div className="quotation-footer-left">

                                <strong className="quotation-footer-brand">
                                    RayaProcure
                                </strong>

                                <span>
                                    Professional Vendor &amp;
                                    Work Order Management
                                </span>

                            </div>


                            <div className="quotation-footer-right">

                                <span>
                                    {invoiceNumber}
                                </span>

                                <span className="quotation-footer-separator">
                                    •
                                </span>

                                <span>
                                    Thank you for your business.
                                </span>

                            </div>

                        </footer>

                    </div>

                </div>

            </div>

        </MainLayout>
    );
}


export default InvoicePreview;