import { useEffect, useState } from "react";
import api from "../services/api";
import Modal from "./Modal";
import Button from "./Button";
import { useToast } from "./Toast/ToastContext";
import { elementToPdfBlob } from "../utils/pdf";
import { errorMessage } from "../utils/format";
import "./SendDocumentModal.css";

// Email a quotation/invoice (PDF attached + customer link) using the company's SMTP.
function SendDocumentModal({ docType, document, getElement, onClose, onSent }) {
    const { showToast } = useToast();
    const number = document.invoice_number || document.quotation_number;

    const [to, setTo] = useState(document.email || "");
    const [cc, setCc] = useState("");
    const [message, setMessage] = useState(
        `Dear ${document.contact_person || document.contact_name || "Sir/Madam"},\n\nPlease find ${docType} ${number} attached.`
    );
    const [attachPdf, setAttachPdf] = useState(true);
    const [sending, setSending] = useState(false);
    const [history, setHistory] = useState([]);
    const [link, setLink] = useState("");

    useEffect(() => {
        api.get(`/api/email/logs/${docType}/${document.id}`)
            .then(({ data }) => setHistory(data))
            .catch(() => {});
    }, [docType, document.id]);

    const send = async (event) => {
        event.preventDefault();
        setSending(true);
        try {
            const form = new FormData();
            form.append("entity_type", docType);
            form.append("entity_id", document.id);
            form.append("to", to);
            form.append("cc", cc);
            form.append("message", message);

            if (attachPdf && getElement()) {
                const blob = await elementToPdfBlob(getElement());
                form.append("pdf", blob, `${docType === "invoice" ? "Invoice" : "Quotation"}-${number}.pdf`);
            }

            const { data } = await api.post("/api/email/send", form, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            showToast(data.message || "Email sent.", "success");
            onSent?.();
            onClose();
        } catch (error) {
            showToast(errorMessage(error, "Unable to send the email."), "error");
        } finally {
            setSending(false);
        }
    };

    const copyLink = async () => {
        try {
            const { data } = await api.post("/api/email/share-link", { entity_type: docType, entity_id: document.id });
            setLink(data.url);
            await navigator.clipboard?.writeText(data.url);
            showToast("Customer link copied.", "success");
        } catch (error) {
            showToast(errorMessage(error, "Unable to create the link."), "error");
        }
    };

    return (
        <Modal title={`Email ${docType} ${number}`} onClose={onClose}>
            <form className="send-form" onSubmit={send}>
                <label>
                    To
                    <input value={to} onChange={(event) => setTo(event.target.value)} placeholder="customer@example.com, another@example.com" required />
                </label>
                <label>
                    CC
                    <input value={cc} onChange={(event) => setCc(event.target.value)} placeholder="Optional" />
                </label>
                <label>
                    Message
                    <textarea rows="5" value={message} onChange={(event) => setMessage(event.target.value)} />
                </label>
                <label className="send-check">
                    <input type="checkbox" checked={attachPdf} onChange={(event) => setAttachPdf(event.target.checked)} />
                    Attach PDF
                </label>
                <p className="send-hint">
                    The email also contains a secure link where your customer can view
                    {docType === "quotation" ? " and accept or decline the quotation." : " the invoice."}
                </p>

                {history.length > 0 && (
                    <div className="send-history">
                        <strong>Previous emails</strong>
                        {history.slice(0, 4).map((entry) => (
                            <div key={entry.id}>
                                <span className={`send-pill send-${entry.status.toLowerCase()}`}>{entry.status}</span>{" "}
                                {entry.to_email} · {new Date(entry.created_at).toLocaleString("en-IN")}
                            </div>
                        ))}
                    </div>
                )}

                {link && <input readOnly value={link} onFocus={(event) => event.target.select()} />}

                <div className="send-actions">
                    <Button variant="secondary" onClick={copyLink}>Copy customer link</Button>
                    <Button type="submit" disabled={sending}>{sending ? "Sending…" : "Send email"}</Button>
                </div>
            </form>
        </Modal>
    );
}

export default SendDocumentModal;
