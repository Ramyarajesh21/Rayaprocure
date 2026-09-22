import "./Quotations.css";

import { useEffect, useRef, useState } from "react";
import {
    useNavigate,
    useParams,
    useSearchParams,
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
    const normalizedStatus = String(status || "Draft").toLowerCase();

    if (normalizedStatus === "sent") {
        return "status-sent";
    }

    if (normalizedStatus === "accepted") {
        return "status-accepted";
    }

    if (normalizedStatus === "rejected") {
        return "status-rejected";
    }

    if (normalizedStatus === "expired") {
        return "status-expired";
    }

    return "status-draft";
}


function QuotationPreview() {
    const navigate = useNavigate();
    const { quotationId } = useParams();

    const [searchParams] = useSearchParams();

    const quotationRef = useRef(null);
    const autoDownloadStarted = useRef(false);

    const { showToast } = useToast();

    const [quotation, setQuotation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);


    // =====================================================
    // DIRECT DOWNLOAD CHECK
    // =====================================================

    const autoDownload =
        searchParams.get("download") === "true";


    // =====================================================
    // FETCH QUOTATION
    // =====================================================

    useEffect(() => {
        fetchQuotation();
    }, [quotationId]);


    const fetchQuotation = async () => {
        try {
            setLoading(true);

            const response = await api.get(
                `/quotations/${quotationId}`
            );

            setQuotation(response.data);
        } catch (error) {
            console.error(
                "Failed to load quotation:",
                error
            );

            showToast(
                error.response?.data?.message ||
                    "Unable to load quotation.",
                "error"
            );
        } finally {
            setLoading(false);
        }
    };


    // =====================================================
    // DOWNLOAD PDF
    // =====================================================

    const handleDownloadPDF = async () => {
        if (!quotationRef.current || !quotation) {
            return;
        }

        try {
            setDownloading(true);

            const element = quotationRef.current;

            /*
             * IMPORTANT:
             * The quotation-document element is the exact
             * element displayed in the premium A4 preview.
             *
             * html2canvas therefore captures the same design
             * that the user sees on screen.
             */

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

            const quotationNumber =
                quotation.quotation_number ||
                `quotation-${quotation.id}`;

            pdf.save(
                `${quotationNumber}.pdf`
            );

            showToast(
                "Quotation PDF downloaded successfully.",
                "success"
            );
        } catch (error) {
            console.error(
                "Quotation PDF download error:",
                error
            );

            showToast(
                "Unable to download quotation PDF.",
                "error"
            );
        } finally {
            setDownloading(false);
        }
    };


    // =====================================================
    // AUTO DOWNLOAD
    // =====================================================

    useEffect(() => {
        if (
            !quotation ||
            !autoDownload ||
            autoDownloadStarted.current
        ) {
            return;
        }

        autoDownloadStarted.current = true;

        const timer = setTimeout(() => {
            handleDownloadPDF();
        }, 700);

        return () => clearTimeout(timer);
    }, [
        quotation,
        autoDownload,
    ]);


    // =====================================================
    // EDIT
    // =====================================================

    const handleEdit = () => {
        navigate(
            `/quotations/${quotationId}/edit`
        );
    };


    // =====================================================
    // SEND - FUTURE
    // =====================================================

    const handleSend = () => {
        showToast(
            "Send quotation functionality will be added in a future enhancement.",
            "info"
        );
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
                            Preparing quotation...
                        </span>
                    </div>
                </div>
            </MainLayout>
        );
    }


    // =====================================================
    // NOT FOUND
    // =====================================================

    if (!quotation) {
        return (
            <MainLayout>
                <div className="quotation-preview-page">
                    <div className="quotation-preview-error">
                        <div className="quotation-preview-error-icon">
                            !
                        </div>

                        <h2>
                            Quotation not found
                        </h2>

                        <p>
                            The requested quotation could not
                            be loaded.
                        </p>

                        <Button
                            onClick={() =>
                                navigate(
                                    "/quotations"
                                )
                            }
                        >
                            Back to Quotations
                        </Button>
                    </div>
                </div>
            </MainLayout>
        );
    }


    // =====================================================
    // QUOTATION DATA
    // =====================================================

    const items = quotation.items || [];

    const subtotal = Number(
        quotation.subtotal || 0
    );

    const adjustment = Number(
        quotation.adjustment || 0
    );

    const grandTotal = Number(
        quotation.grand_total ||
            quotation.amount ||
            0
    );

    const quotationStatus =
        quotation.status || "Draft";

    const statusClass =
        getStatusClass(
            quotationStatus
        );

    const quotationNumber =
        quotation.quotation_number ||
        `RPQ-${String(
            quotation.id
        ).padStart(5, "0")}`;


    // =====================================================
    // PREMIUM PREVIEW
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
                            QUOTATION PREVIEW
                        </span>

                        <div className="quotation-preview-title-row">

                            <h1>
                                {quotationNumber}
                            </h1>

                            <span
                                className={`quotation-preview-status ${statusClass}`}
                            >
                                {quotationStatus}
                            </span>

                        </div>

                    </div>


                    <div className="quotation-preview-actions">

                        <Button
                            variant="secondary"
                            onClick={() =>
                                navigate(
                                    "/quotations"
                                )
                            }
                        >
                            ← Back
                        </Button>

                        <Button
                            variant="secondary"
                            onClick={handleEdit}
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
                        >
                            ✉ Send
                        </button>

                    </div>

                </div>


                {/* =================================================
                    PREMIUM A4 DOCUMENT
                ================================================= */}

                <div className="quotation-document-wrapper">

                    <div
                        className="quotation-document"
                        ref={quotationRef}
                    >

                        {/* =================================================
                            PREMIUM TOP BAR
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
                                    QUOTATION
                                </div>

                                <div className="quotation-document-gold-line" />

                                <div className="quotation-number">
                                    {quotationNumber}
                                </div>

                            </div>

                        </header>


                        {/* =================================================
                            QUOTATION DETAILS + BILL TO
                        ================================================= */}

                        <section className="quotation-top-details">

                            {/* -----------------------------------------
                                QUOTATION DETAILS
                            ----------------------------------------- */}

                            <div className="quotation-meta-box">

                                <div className="quotation-card-heading">

                                    <span className="quotation-card-icon">
                                        ◈
                                    </span>

                                    QUOTATION DETAILS

                                </div>


                                <div className="quotation-meta-list">

                                    <div className="quotation-meta-row">

                                        <span>
                                            QUOTATION DATE
                                        </span>

                                        <strong>
                                            {formatDate(
                                                quotation.quotation_date
                                            )}
                                        </strong>

                                    </div>


                                    <div className="quotation-meta-row">

                                        <span>
                                            VALID UNTIL
                                        </span>

                                        <strong>
                                            {formatDate(
                                                quotation.valid_until
                                            )}
                                        </strong>

                                    </div>


                                    <div className="quotation-meta-row">

                                        <span>
                                            RFQ NUMBER
                                        </span>

                                        <strong>
                                            {quotation.rfq_number ||
                                                "-"}
                                        </strong>

                                    </div>


                                    <div className="quotation-meta-row">

                                        <span>
                                            STATUS
                                        </span>

                                        <strong
                                            className={`quotation-document-status ${statusClass}`}
                                        >
                                            {quotationStatus}
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
                                        {quotation.company_name ||
                                            "-"}
                                    </h3>


                                    {quotation.address && (
                                        <p>
                                            {quotation.address}
                                        </p>
                                    )}


                                    <div className="quotation-bill-contact">

                                        {quotation.contact_person && (
                                            <span>
                                                <strong>
                                                    Contact
                                                </strong>

                                                {" · "}

                                                {quotation.contact_person}
                                            </span>
                                        )}


                                        {quotation.phone && (
                                            <span>
                                                <strong>
                                                    Phone
                                                </strong>

                                                {" · "}

                                                {quotation.phone}
                                            </span>
                                        )}


                                        {quotation.email && (
                                            <span>
                                                <strong>
                                                    Email
                                                </strong>

                                                {" · "}

                                                {quotation.email}
                                            </span>
                                        )}

                                    </div>

                                </div>

                            </div>

                        </section>


                        {/* =================================================
                            ITEMS
                        ================================================= */}

                        <section className="quotation-items-section">

                            <div className="quotation-items-heading">

                                <div>

                                    <div className="quotation-section-label">
                                        QUOTATION ITEMS
                                    </div>

                                    <div className="quotation-items-caption">
                                        Scope of supply / services
                                    </div>

                                </div>


                                <div className="quotation-items-count">
                                    {items.length}{" "}
                                    {items.length === 1
                                        ? "ITEM"
                                        : "ITEMS"}
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

                                    {items.length > 0 ? (
                                        items.map(
                                            (
                                                item,
                                                index
                                            ) => {

                                                const itemAmount =
                                                    Number(
                                                        item.amount ??
                                                        (
                                                            Number(
                                                                item.quantity
                                                            ) *
                                                            Number(
                                                                item.rate
                                                            )
                                                        )
                                                    );

                                                return (
                                                    <tr
                                                        key={
                                                            item.id ||
                                                            index
                                                        }
                                                    >

                                                        <td className="quotation-sno">
                                                            {String(
                                                                index + 1
                                                            ).padStart(
                                                                2,
                                                                "0"
                                                            )}
                                                        </td>


                                                        <td className="quotation-description-cell">

                                                            <strong>
                                                                {item.description ||
                                                                    "-"}
                                                            </strong>

                                                        </td>


                                                        <td className="quotation-qty">
                                                            {item.quantity ??
                                                                "-"}
                                                        </td>


                                                        <td className="quotation-unit">
                                                            {item.unit ||
                                                                "-"}
                                                        </td>


                                                        <td className="quotation-rate">
                                                            ₹
                                                            {formatMoney(
                                                                item.rate
                                                            )}
                                                        </td>


                                                        <td className="quotation-amount">
                                                            ₹
                                                            {formatMoney(
                                                                itemAmount
                                                            )}
                                                        </td>

                                                    </tr>
                                                );
                                            }
                                        )
                                    ) : (
                                        <tr>
                                            <td
                                                colSpan="6"
                                                className="quotation-empty-items"
                                            >
                                                No quotation items
                                                available.
                                            </td>
                                        </tr>
                                    )}

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
                                        Total quotation value
                                    </small>

                                </div>

                                <strong>
                                    ₹
                                    {formatMoney(
                                        grandTotal
                                    )}
                                </strong>

                            </div>

                        </section>


                        {/* =================================================
                            NOTES + TERMS
                        ================================================= */}

                        <div className="quotation-document-bottom-grid">

                            {/* -----------------------------------------
                                NOTES
                            ----------------------------------------- */}

                            {quotation.notes && (
                                <section className="quotation-document-section">

                                    <div className="quotation-document-section-heading">

                                        <span className="quotation-section-number">
                                            01
                                        </span>

                                        <h3>
                                            Notes
                                        </h3>

                                    </div>


                                    <div className="quotation-document-text">
                                        {quotation.notes}
                                    </div>

                                </section>
                            )}


                            {/* -----------------------------------------
                                TERMS
                            ----------------------------------------- */}

                            {quotation.terms_conditions && (
                                <section className="quotation-document-section">

                                    <div className="quotation-document-section-heading">

                                        <span className="quotation-section-number">
                                            02
                                        </span>

                                        <h3>
                                            Terms &amp; Conditions
                                        </h3>

                                    </div>


                                    <div className="quotation-document-text quotation-terms">
                                        {quotation.terms_conditions}
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
                                    {quotationNumber}
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


export default QuotationPreview;