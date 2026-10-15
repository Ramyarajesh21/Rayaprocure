import { useCallback, useEffect, useState } from "react";

import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import Button from "../../components/Button";
import { useToast } from "../../components/Toast/ToastContext";

import api from "../../services/api";
import { errorMessage } from "../../utils/format";

const TABS = ["Email (SMTP)", "Payment & quote reminders", "Reminder activity"];

const PRESETS = [
    { label: "Gmail / Google Workspace", host: "smtp.gmail.com", port: 587, security: "starttls", note: "Use an App Password (Google Account → Security → 2-Step Verification → App passwords)." },
    { label: "Microsoft 365 / Outlook", host: "smtp.office365.com", port: 587, security: "starttls", note: "SMTP AUTH must be enabled for the mailbox." },
    { label: "Zoho Mail (India)", host: "smtp.zoho.in", port: 587, security: "starttls", note: "Use an application-specific password." },
    { label: "Zoho Mail (Global)", host: "smtp.zoho.com", port: 587, security: "starttls", note: "Use an application-specific password." },
    { label: "Brevo (Sendinblue)", host: "smtp-relay.brevo.com", port: 587, security: "starttls", note: "Use your SMTP key as the password." },
    { label: "Amazon SES (Mumbai)", host: "email-smtp.ap-south-1.amazonaws.com", port: 587, security: "starttls", note: "Use your SES SMTP credentials." },
];

function Field({ label, hint, wide, children }) {
    return (
        <label className={`pf-field${wide ? " pf-wide" : ""}`}>
            <span>{label}</span>
            {children}
            {hint && <small>{hint}</small>}
        </label>
    );
}

function EmailReminders() {
    const { showToast } = useToast();
    const [tab, setTab] = useState(TABS[0]);

    const [email, setEmail] = useState({
        smtpHost: "", smtpPort: 587, smtpUser: "", smtpPassword: "", security: "starttls",
        fromEmail: "", fromName: "", replyTo: "", signature: "",
    });
    const [hasPassword, setHasPassword] = useState(false);
    const [lastTest, setLastTest] = useState(null);
    const [testTo, setTestTo] = useState("");

    const [reminders, setReminders] = useState({
        enabled: false, invoiceBeforeDueDays: "3", invoiceOverdueDays: "1,7,14,30",
        quoteFollowupDays: "3,7", quoteExpiryNoticeDays: "2", copyOwner: true,
    });
    const [logs, setLogs] = useState([]);
    const [busy, setBusy] = useState(false);

    const loadLogs = useCallback(() => {
        api.get("/api/reminders/logs").then(({ data }) => setLogs(data)).catch(() => {});
    }, []);

    useEffect(() => {
        api.get("/api/email/settings")
            .then(({ data }) => {
                setEmail((previous) => ({ ...previous, ...data, smtpPassword: "" }));
                setHasPassword(data.hasPassword);
                setLastTest(data.lastTestStatus ? { status: data.lastTestStatus, at: data.lastTestAt } : null);
            })
            .catch(() => {});
        api.get("/api/reminders/settings").then(({ data }) => setReminders(data)).catch(() => {});
        loadLogs();
    }, [loadLogs]);

    const setE = (key) => (event) => setEmail((previous) => ({ ...previous, [key]: event.target.value }));
    const setR = (key) => (event) => setReminders((previous) => ({ ...previous, [key]: event.target.value }));

    const applyPreset = (event) => {
        const preset = PRESETS[Number(event.target.value)];
        if (preset) setEmail((previous) => ({ ...previous, smtpHost: preset.host, smtpPort: preset.port, security: preset.security }));
    };

    const run = async (task) => {
        setBusy(true);
        try {
            await task();
        } catch (error) {
            showToast(errorMessage(error, "Something went wrong."), "error");
        } finally {
            setBusy(false);
        }
    };

    const saveEmail = (event) => {
        event.preventDefault();
        run(async () => {
            await api.put("/api/email/settings", { ...email, smtpPort: Number(email.smtpPort) });
            if (email.smtpPassword) setHasPassword(true);
            setEmail((previous) => ({ ...previous, smtpPassword: "" }));
            showToast("Email settings saved. Send a test email to confirm.", "success");
        });
    };

    const sendTest = () =>
        run(async () => {
            try {
                const { data } = await api.post("/api/email/test", { to: testTo });
                setLastTest({ status: "OK", at: new Date().toISOString() });
                showToast(data.message, "success");
            } catch (error) {
                setLastTest({ status: "Failed", at: new Date().toISOString() });
                throw error;
            }
        });

    const saveReminders = (event) => {
        event.preventDefault();
        run(async () => {
            await api.put("/api/reminders/settings", reminders);
            showToast("Reminder settings saved.", "success");
        });
    };

    const runNow = () =>
        run(async () => {
            const { data } = await api.post("/api/reminders/run");
            const parts = [`${data.sent} sent`, `${data.skipped} skipped`];
            if (data.expired) parts.push(`${data.expired} quotation(s) expired`);
            showToast(`Reminders run: ${parts.join(", ")}.`, data.failed || data.errors?.length ? "error" : "success");
            if (data.errors?.length) showToast(data.errors[0], "error");
            loadLogs();
        });

    return (
        <MainLayout>
            <div className="pf-page">
                <PageHeader
                    eyebrow="AUTOMATION"
                    title="Email & Reminders"
                    description="Send documents from your own email address and get paid faster with automatic reminders."
                />

                <div className="pf-tabs" role="tablist">
                    {TABS.map((name) => (
                        <button key={name} type="button" role="tab" className={`pf-tab${tab === name ? " active" : ""}`} onClick={() => setTab(name)}>
                            {name}
                        </button>
                    ))}
                </div>

                {tab === TABS[0] && (
                    <form className="pf-card" onSubmit={saveEmail}>
                        <h3>Outgoing email (SMTP)</h3>
                        <p>Quotations, invoices and reminders are sent from this account, so replies reach you and copies land in your Sent folder.</p>

                        <div className="pf-grid">
                            <Field label="Provider preset" hint="Optional. Fills the server, port and security for you.">
                                <select defaultValue="" onChange={applyPreset}>
                                    <option value="">Choose a provider…</option>
                                    {PRESETS.map((preset, index) => <option key={preset.label} value={index}>{preset.label}</option>)}
                                </select>
                            </Field>
                            <Field label="SMTP server"><input value={email.smtpHost} onChange={setE("smtpHost")} placeholder="smtp.example.com" required /></Field>
                            <Field label="Port"><input type="number" value={email.smtpPort} onChange={setE("smtpPort")} required /></Field>
                            <Field label="Security">
                                <select value={email.security} onChange={setE("security")}>
                                    <option value="starttls">STARTTLS (port 587)</option>
                                    <option value="ssl">SSL/TLS (port 465)</option>
                                    <option value="none">None (not recommended)</option>
                                </select>
                            </Field>
                            <Field label="Username"><input value={email.smtpUser} onChange={setE("smtpUser")} autoComplete="off" /></Field>
                            <Field label="Password" hint={hasPassword ? "A password is saved. Leave blank to keep it." : "Stored encrypted."}>
                                <input type="password" value={email.smtpPassword} onChange={setE("smtpPassword")} autoComplete="new-password" placeholder={hasPassword ? "••••••••" : ""} />
                            </Field>
                            <Field label="From email"><input type="email" value={email.fromEmail} onChange={setE("fromEmail")} required /></Field>
                            <Field label="From name"><input value={email.fromName} onChange={setE("fromName")} placeholder="Your company" /></Field>
                            <Field label="Reply-to (optional)"><input type="email" value={email.replyTo} onChange={setE("replyTo")} /></Field>
                            <Field label="Email signature" wide><textarea rows="3" value={email.signature} onChange={setE("signature")} /></Field>
                        </div>

                        <div className="pf-actions">
                            <Button type="submit" disabled={busy}>Save email settings</Button>
                        </div>

                        <h3>Send a test email</h3>
                        <div className="pf-grid">
                            <Field label="Send test to"><input type="email" value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="you@example.com" /></Field>
                            <div className="pf-field">
                                <span>&nbsp;</span>
                                <Button variant="secondary" onClick={sendTest} disabled={busy || !testTo}>Send test email</Button>
                                {lastTest && (
                                    <small>
                                        Last test: <span className={`pf-pill ${lastTest.status === "OK" ? "ok" : "bad"}`}>{lastTest.status}</span>
                                    </small>
                                )}
                            </div>
                        </div>
                    </form>
                )}

                {tab === TABS[1] && (
                    <form className="pf-card" onSubmit={saveReminders}>
                        <h3>Automatic reminders</h3>
                        <p>Once a day, customers with unpaid invoices or unanswered quotations get a polite email with a link to view the document. Each reminder is sent only once.</p>

                        <label className="pf-check">
                            <input type="checkbox" checked={reminders.enabled} onChange={(event) => setReminders({ ...reminders, enabled: event.target.checked })} />
                            Send reminders automatically
                        </label>

                        <div className="pf-grid">
                            <Field label="Before the due date (days)" hint="e.g. 3 or 7,3 — reminds this many days before">
                                <input value={reminders.invoiceBeforeDueDays} onChange={setR("invoiceBeforeDueDays")} />
                            </Field>
                            <Field label="After the due date (days)" hint="e.g. 1,7,14,30">
                                <input value={reminders.invoiceOverdueDays} onChange={setR("invoiceOverdueDays")} />
                            </Field>
                            <Field label="Quotation follow-up (days after sending)" hint="e.g. 3,7">
                                <input value={reminders.quoteFollowupDays} onChange={setR("quoteFollowupDays")} />
                            </Field>
                            <Field label="Quotation expiry notice (days before)" hint="e.g. 2">
                                <input value={reminders.quoteExpiryNoticeDays} onChange={setR("quoteExpiryNoticeDays")} />
                            </Field>
                        </div>

                        <label className="pf-check">
                            <input type="checkbox" checked={reminders.copyOwner} onChange={(event) => setReminders({ ...reminders, copyOwner: event.target.checked })} />
                            Send me a copy of every reminder
                        </label>

                        <p className="pf-help">
                            Only approved or emailed invoices with a balance are reminded. Email must be set up first. Quotations past their validity date are marked Expired automatically.
                        </p>

                        <div className="pf-actions">
                            <Button variant="secondary" onClick={runNow} disabled={busy}>Run reminders now</Button>
                            <Button type="submit" disabled={busy}>Save reminder settings</Button>
                        </div>
                    </form>
                )}

                {tab === TABS[2] && (
                    <div className="pf-card">
                        <h3>Recent reminders</h3>
                        {logs.length === 0 ? (
                            <p>No reminders have been sent yet.</p>
                        ) : (
                            <div className="pf-scroll">
                                <table className="pf-table">
                                    <thead>
                                        <tr><th>When</th><th>Document</th><th>Stage</th><th>Result</th></tr>
                                    </thead>
                                    <tbody>
                                        {logs.map((log) => (
                                            <tr key={log.id}>
                                                <td>{new Date(log.created_at).toLocaleString("en-IN")}</td>
                                                <td>{log.entity_type} {log.number}</td>
                                                <td>{log.stage}</td>
                                                <td>
                                                    <span className={`pf-pill ${log.status === "Sent" ? "ok" : log.status === "Failed" ? "bad" : ""}`}>{log.status}</span>
                                                    {log.detail ? ` ${log.detail}` : ""}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </MainLayout>
    );
}

export default EmailReminders;
