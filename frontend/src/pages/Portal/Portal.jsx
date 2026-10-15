import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import api from "../../services/api";
import DocumentRenderer from "../../components/DocumentRenderer";
import { downloadElementPdf } from "../../utils/pdf";
import { errorMessage } from "../../utils/format";

// Public customer page: view a shared quotation/invoice and respond, without logging in.
function Portal() {
    const { token } = useParams();
    const sheetRef = useRef(null);

    const [state, setState] = useState({ status: "loading" });
    const [choice, setChoice] = useState(null);
    const [name, setName] = useState("");
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [result, setResult] = useState(null);

    const load = () =>
        api
            .get(`/api/public/${token}`)
            .then(({ data }) => setState({ status: "ready", ...data }))
            .catch((error) =>
                setState({ status: "error", message: errorMessage(error, "This link is invalid or has expired.") })
            );

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    if (state.status === "loading") {
        return <div className="portal"><div className="portal-empty">Loading…</div></div>;
    }

    if (state.status === "error") {
        return (
            <div className="portal">
                <div className="portal-empty">
                    <h2>Link unavailable</h2>
                    <p>{state.message}</p>
                    <p>Please contact the sender for a new link.</p>
                </div>
            </div>
        );
    }

    const { type, document, company, template, canRespond } = state;
    const number = document.invoice_number || document.quotation_number;
    const accent = company.brand_color || "#1f4e79";

    const download = async () => {
        setBusy(true);
        try {
            await downloadElementPdf(sheetRef.current, `${type === "invoice" ? "Invoice" : "Quotation"}-${number}.pdf`);
        } finally {
            setBusy(false);
        }
    };

    const respond = async (event) => {
        event.preventDefault();
        setBusy(true);
        try {
            const { data } = await api.post(`/api/public/${token}/respond`, { decision: choice, name, note });
            setResult({ ok: true, message: data.message });
            setChoice(null);
            await load();
        } catch (error) {
            setResult({ ok: false, message: errorMessage(error, "Unable to record your response.") });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="portal" style={{ "--portal-accent": accent }}>
            <div className="portal-bar">
                <h1>{company.company_name} · {type === "invoice" ? "Invoice" : "Quotation"} {number}</h1>
                <div className="portal-actions">
                    <button type="button" className="portal-btn" onClick={() => window.print()}>Print</button>
                    <button type="button" className="portal-btn primary" onClick={download} disabled={busy}>Download PDF</button>
                </div>
            </div>

            {result && <div className={`portal-notice${result.ok ? "" : " bad"}`}>{result.message}</div>}

            {type === "quotation" && !canRespond && !result && ["Accepted", "Rejected"].includes(document.status) && (
                <div className="portal-notice">This quotation has been {document.status.toLowerCase()}.</div>
            )}
            {type === "quotation" && document.status === "Revised" && (
                <div className="portal-notice bad">
                    This quotation has been replaced by a newer version. Please contact us for the latest one.
                </div>
            )}
            {type === "quotation" && document.status === "Expired" && (
                <div className="portal-notice bad">This quotation has expired. Please contact us for an updated one.</div>
            )}
            {type === "invoice" && (
                <div className={`portal-notice${document.payment_status === "Paid" ? "" : " bad"}`}>
                    {document.payment_status === "Paid"
                        ? "This invoice is fully paid. Thank you!"
                        : `Payment status: ${document.payment_status}. Balance due ₹${Number(document.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}.`}
                </div>
            )}

            {canRespond && (
                <div className="portal-respond">
                    {!choice ? (
                        <>
                            <strong>Would you like to go ahead with this quotation?</strong>
                            <div className="portal-actions">
                                <button type="button" className="portal-btn primary" onClick={() => setChoice("Accepted")}>Accept quotation</button>
                                <button type="button" className="portal-btn danger" onClick={() => setChoice("Rejected")}>Decline</button>
                            </div>
                        </>
                    ) : (
                        <form onSubmit={respond} style={{ display: "grid", gap: 10 }}>
                            <strong>{choice === "Accepted" ? "Confirm acceptance" : "Confirm decline"}</strong>
                            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your full name" required minLength={2} />
                            <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Comments (optional)" rows="3" maxLength={500} />
                            <div className="portal-actions">
                                <button type="submit" className={`portal-btn ${choice === "Accepted" ? "primary" : "danger"}`} disabled={busy}>
                                    {busy ? "Sending…" : choice === "Accepted" ? "Accept" : "Decline"}
                                </button>
                                <button type="button" className="portal-btn" onClick={() => setChoice(null)}>Back</button>
                            </div>
                        </form>
                    )}
                </div>
            )}

            <DocumentRenderer ref={sheetRef} docType={type} document={document} company={company} template={template} />
        </div>
    );
}

export default Portal;
