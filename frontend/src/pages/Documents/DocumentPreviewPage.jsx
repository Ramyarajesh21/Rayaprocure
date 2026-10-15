import "../Quotations/Quotations.css";
import "../Invoices/Invoices.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";

import api from "../../services/api";
import { loadCompany } from "../../services/company";

import MainLayout from "../../layouts/MainLayout";
import Button from "../../components/Button";
import AttachmentsPanel from "../../components/AttachmentsPanel";
import DocumentRenderer from "../../components/DocumentRenderer";
import SendDocumentModal from "../../components/SendDocumentModal";
import { useToast } from "../../components/Toast/ToastContext";

import { downloadElementPdf } from "../../utils/pdf";
import { errorMessage } from "../../utils/format";

const CONFIG = {
    quotation: {
        endpoint: (id) => `/quotations/${id}`,
        listPath: "/quotations",
        editPath: (id) => `/quotations/${id}/edit`,
        eyebrow: "QUOTATION PREVIEW",
        numberField: "quotation_number",
        filePrefix: "Quotation",
    },
    invoice: {
        endpoint: (id) => `/invoices/${id}`,
        listPath: "/invoices",
        editPath: (id) => `/invoices/create?edit=${id}`,
        eyebrow: "INVOICE PREVIEW",
        numberField: "invoice_number",
        filePrefix: "Invoice",
    },
};

// Shared preview screen for quotations and invoices: render with the company's
// template, download/print the PDF, e-mail it, and take the next workflow step.
function DocumentPreviewPage({ docType }) {
    const config = CONFIG[docType];
    const navigate = useNavigate();
    const { quotationId, invoiceId } = useParams();
    const id = docType === "quotation" ? quotationId : invoiceId;
    const [searchParams] = useSearchParams();
    const { showToast } = useToast();

    const sheetRef = useRef(null);
    const autoDownloaded = useRef(false);

    const [document, setDocument] = useState(null);
    const [company, setCompany] = useState(null);
    const [template, setTemplate] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [showSend, setShowSend] = useState(false);

    const load = useCallback(async () => {
        try {
            const [documentResponse, companyData, templateResponse] = await Promise.all([
                api.get(config.endpoint(id)),
                loadCompany(true),
                api.get(`/api/templates/default/${docType}`),
            ]);
            setDocument(documentResponse.data);
            setCompany(companyData);
            setTemplate(templateResponse.data);
        } catch (error) {
            showToast(errorMessage(error, "Unable to load the document."), "error");
            setDocument(null);
        } finally {
            setLoading(false);
        }
    }, [config, id, docType, showToast]);

    useEffect(() => {
        load();
    }, [load]);

    const number = document?.[config.numberField] || "";
    const filename = `${config.filePrefix}-${number || id}.pdf`;

    const download = useCallback(async () => {
        if (!sheetRef.current) return;
        try {
            setBusy(true);
            await downloadElementPdf(sheetRef.current, filename);
        } catch {
            showToast("Unable to create the PDF.", "error");
        } finally {
            setBusy(false);
        }
    }, [filename, showToast]);

    // ?download=true is used by the list pages for one-click PDF download.
    useEffect(() => {
        if (document && company && searchParams.get("download") === "true" && !autoDownloaded.current) {
            autoDownloaded.current = true;
            const timer = setTimeout(download, 700);
            return () => clearTimeout(timer);
        }
        return undefined;
    }, [document, company, searchParams, download]);

    const act = async (request, success) => {
        try {
            setBusy(true);
            await request();
            showToast(success, "success");
            await load();
        } catch (error) {
            showToast(errorMessage(error, "That action could not be completed."), "error");
        } finally {
            setBusy(false);
        }
    };

    if (loading) {
        return (
            <MainLayout>
                <div className="quotation-preview-page">
                    <div className="quotation-preview-loading">
                        <div className="quotation-preview-loading-spinner" />
                        <span>Preparing {docType}…</span>
                    </div>
                </div>
            </MainLayout>
        );
    }

    if (!document || !company) {
        return (
            <MainLayout>
                <div className="quotation-preview-page">
                    <div className="quotation-preview-error">
                        <div className="quotation-preview-error-icon">!</div>
                        <h2>{config.filePrefix} not found</h2>
                        <p>The requested {docType} could not be loaded.</p>
                        <Button onClick={() => navigate(config.listPath)}>Back</Button>
                    </div>
                </div>
            </MainLayout>
        );
    }

    const status = document.status || "Draft";
    const undecided = docType === "quotation" && !["Accepted", "Rejected", "Revised"].includes(status);
    const canRevise = docType === "quotation" && status !== "Revised";

    const revise = async () => {
        if (!window.confirm("Create a new revision? The current version is kept and marked Revised.")) return;
        try {
            setBusy(true);
            const { data } = await api.post(`/quotations/${id}/revise`);
            showToast(data.message, "success");
            navigate(`/quotations/${data.id}/edit`);
        } catch (error) {
            showToast(errorMessage(error, "Unable to create a revision."), "error");
        } finally {
            setBusy(false);
        }
    };

    return (
        <MainLayout>
            <div className="quotation-preview-page">
                <div className="quotation-preview-toolbar">
                    <div className="quotation-preview-heading">
                        <span className="quotation-preview-eyebrow">{config.eyebrow}</span>
                        <div className="quotation-preview-title-row">
                            <h1>{number}</h1>
                            <span className={`quotation-status-badge quotation-status-${status.toLowerCase()}`}>{status}</span>
                            {docType === "invoice" && (
                                <span className="quotation-status-badge quotation-status-sent">{document.payment_status}</span>
                            )}
                        </div>
                    </div>

                    <div className="quotation-preview-actions">
                        <Button variant="secondary" onClick={() => navigate(config.listPath)}>← Back</Button>
                        <Button variant="secondary" onClick={() => navigate(config.editPath(id))}>✏ Edit</Button>
                        {canRevise && (
                            <Button variant="secondary" disabled={busy} onClick={revise}>⟳ Revise</Button>
                        )}

                        {undecided && (
                            <>
                                <Button
                                    disabled={busy}
                                    onClick={() =>
                                        window.confirm("Mark this quotation as accepted?") &&
                                        act(() => api.post(`/quotations/${id}/decision`, { decision: "Accepted" }), "Quotation accepted.")
                                    }
                                >
                                    Accept
                                </Button>
                                <Button
                                    variant="secondary"
                                    disabled={busy}
                                    onClick={() =>
                                        window.confirm("Mark this quotation as rejected?") &&
                                        act(() => api.post(`/quotations/${id}/decision`, { decision: "Rejected" }), "Quotation rejected.")
                                    }
                                >
                                    Reject
                                </Button>
                            </>
                        )}

                        {docType === "invoice" && status !== "Approved" && (
                            <Button
                                disabled={busy}
                                onClick={() =>
                                    window.confirm("Approve this invoice?") &&
                                    act(() => api.post(`/invoices/${id}/approve`), "Invoice approved.")
                                }
                            >
                                Approve
                            </Button>
                        )}

                        <Button onClick={download} disabled={busy}>{busy ? "Working…" : "⬇ Download PDF"}</Button>
                        <button type="button" className="quotation-send-button" onClick={() => window.print()}>🖨 Print</button>
                        <button type="button" className="quotation-send-button" onClick={() => setShowSend(true)}>✉ Email</button>
                    </div>
                </div>

                {docType === "quotation" && document.revised_by_id && (
                    <div className="doc-supersede">
                        This version was replaced by{" "}
                        <a href={`/quotations/${document.revised_by_id}/preview`}>{document.revised_by_number}</a>.
                    </div>
                )}

                {docType === "quotation" && document.responded_by_name && (
                    <div className="doc-response-note">
                        {status} by <strong>{document.responded_by_name}</strong> via the customer link
                        {document.response_note ? ` — “${document.response_note}”` : ""}.
                    </div>
                )}

                <div className="quotation-document-wrapper">
                    <DocumentRenderer ref={sheetRef} docType={docType} document={document} company={company} template={template} />
                </div>

                <AttachmentsPanel entityType={docType} entityId={document.id} />
            </div>

            {showSend && (
                <SendDocumentModal
                    docType={docType}
                    document={document}
                    getElement={() => sheetRef.current}
                    onClose={() => setShowSend(false)}
                    onSent={load}
                />
            )}
        </MainLayout>
    );
}

export default DocumentPreviewPage;
