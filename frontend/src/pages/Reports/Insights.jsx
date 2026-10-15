import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Button from "../../components/Button";
import { useToast } from "../../components/Toast/ToastContext";
import api from "../../services/api";
import { errorMessage, formatDate, formatMoney } from "../../utils/format";

const STATUS_ORDER = ["Draft", "Sent", "Accepted", "Rejected", "Expired"];

function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

// Receivables aging, quotation win rate, revenue by customer and the GST register.
function Insights() {
    const { showToast } = useToast();
    const [range, setRange] = useState({ from: "", to: "" });
    const [aging, setAging] = useState(null);
    const [funnel, setFunnel] = useState(null);
    const [revenue, setRevenue] = useState([]);
    const [gst, setGst] = useState([]);

    const params = useCallback(() => {
        const query = {};
        if (range.from) query.from = range.from;
        if (range.to) query.to = range.to;
        return query;
    }, [range]);

    useEffect(() => {
        const query = params();
        Promise.all([
            api.get("/reports/aging"),
            api.get("/reports/quotation-funnel", { params: query }),
            api.get("/reports/revenue-by-customer", { params: query }),
            api.get("/reports/gst-summary", { params: query }),
        ])
            .then(([agingResponse, funnelResponse, revenueResponse, gstResponse]) => {
                setAging(agingResponse.data);
                setFunnel(funnelResponse.data);
                setRevenue(revenueResponse.data);
                setGst(gstResponse.data);
            })
            .catch((error) => showToast(errorMessage(error, "Unable to load report insights."), "error"));
    }, [params, showToast]);

    const exportCsv = async (path, filename) => {
        try {
            const response = await api.get(path, { params: params(), responseType: "blob" });
            download(response.data, filename);
        } catch (error) {
            showToast(errorMessage(error, "Unable to export."), "error");
        }
    };

    const maxBucket = Math.max(1, ...(aging?.buckets || []).map((bucket) => bucket.amount));

    return (
        <div className="pf-page" style={{ marginTop: 28, maxWidth: "none" }}>
            <div className="pf-card">
                <h3>Filter</h3>
                <div className="pf-grid">
                    <label className="pf-field"><span>From</span>
                        <input type="date" value={range.from} onChange={(event) => setRange({ ...range, from: event.target.value })} />
                    </label>
                    <label className="pf-field"><span>To</span>
                        <input type="date" value={range.to} onChange={(event) => setRange({ ...range, to: event.target.value })} />
                    </label>
                </div>
                <p className="pf-help">Applies to quotations, revenue and GST. Receivables aging always shows what is unpaid today.</p>
            </div>

            <div className="pf-card">
                <h3>Receivables aging — ₹{formatMoney(aging?.total_outstanding)} outstanding</h3>
                {aging?.buckets.map((bucket) => (
                    <div key={bucket.key} style={{ display: "grid", gridTemplateColumns: "110px 1fr 130px", gap: 10, alignItems: "center", fontSize: 13 }}>
                        <span>{bucket.label}</span>
                        <div style={{ background: "var(--color-surface-soft)", borderRadius: 6, height: 14 }}>
                            <div
                                style={{
                                    width: `${(bucket.amount / maxBucket) * 100}%`,
                                    height: "100%",
                                    borderRadius: 6,
                                    background: bucket.key === "not_due" ? "var(--color-success)" : bucket.key === "d90_plus" ? "var(--color-danger)" : "var(--color-warning)",
                                }}
                            />
                        </div>
                        <span style={{ textAlign: "right" }}>₹{formatMoney(bucket.amount)} ({bucket.count})</span>
                    </div>
                ))}

                {aging?.overdue.length > 0 && (
                    <div className="pf-scroll">
                        <table className="pf-table">
                            <thead><tr><th>Invoice</th><th>Customer</th><th>Due</th><th>Days late</th><th style={{ textAlign: "right" }}>Balance</th></tr></thead>
                            <tbody>
                                {aging.overdue.map((row) => (
                                    <tr key={row.id}>
                                        <td><Link className="pf-link" to={`/invoices/${row.id}/preview`}>{row.invoice_number}</Link></td>
                                        <td>{row.company_name}</td>
                                        <td>{formatDate(row.due_date)}</td>
                                        <td><span className={`pf-pill ${row.days_overdue > 60 ? "bad" : "warn"}`}>{row.days_overdue}</span></td>
                                        <td style={{ textAlign: "right" }}>₹{formatMoney(row.balance)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="pf-actions">
                    <Button variant="secondary" onClick={() => exportCsv("/reports/export/aging", "receivables-aging.csv")}>Export aging (CSV)</Button>
                </div>
            </div>

            <div className="pf-card">
                <h3>Quotation win rate {funnel?.win_rate != null ? `— ${funnel.win_rate}%` : ""}</h3>
                <p>Win rate = accepted ÷ (accepted + rejected + expired). Open pipeline: ₹{formatMoney(funnel?.open_value)}.</p>
                <div className="pf-scroll">
                    <table className="pf-table">
                        <thead><tr><th>Status</th><th>Quotations</th><th style={{ textAlign: "right" }}>Value</th></tr></thead>
                        <tbody>
                            {STATUS_ORDER.map((status) => (
                                <tr key={status}>
                                    <td>{status}</td>
                                    <td>{funnel?.by_status[status]?.count ?? 0}</td>
                                    <td style={{ textAlign: "right" }}>₹{formatMoney(funnel?.by_status[status]?.value)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="pf-card">
                <h3>Revenue by customer</h3>
                {revenue.length === 0 ? (
                    <p>No invoices in this period.</p>
                ) : (
                    <div className="pf-scroll">
                        <table className="pf-table">
                            <thead><tr><th>Customer</th><th>Invoices</th><th style={{ textAlign: "right" }}>Invoiced</th><th style={{ textAlign: "right" }}>Outstanding</th></tr></thead>
                            <tbody>
                                {revenue.map((row) => (
                                    <tr key={row.id}>
                                        <td>{row.company_name}</td>
                                        <td>{row.invoices}</td>
                                        <td style={{ textAlign: "right" }}>₹{formatMoney(row.invoiced)}</td>
                                        <td style={{ textAlign: "right" }}>₹{formatMoney(row.outstanding)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <div className="pf-card">
                <h3>GST summary (outward supplies)</h3>
                {gst.length === 0 ? (
                    <p>No invoices in this period.</p>
                ) : (
                    <div className="pf-scroll">
                        <table className="pf-table">
                            <thead>
                                <tr><th>Month</th><th>Invoices</th><th style={{ textAlign: "right" }}>Taxable</th><th style={{ textAlign: "right" }}>CGST</th><th style={{ textAlign: "right" }}>SGST</th><th style={{ textAlign: "right" }}>IGST</th><th style={{ textAlign: "right" }}>Total</th></tr>
                            </thead>
                            <tbody>
                                {gst.map((row) => (
                                    <tr key={row.month}>
                                        <td>{row.month}</td>
                                        <td>{row.invoices}</td>
                                        <td style={{ textAlign: "right" }}>{formatMoney(row.taxable)}</td>
                                        <td style={{ textAlign: "right" }}>{formatMoney(row.cgst)}</td>
                                        <td style={{ textAlign: "right" }}>{formatMoney(row.sgst)}</td>
                                        <td style={{ textAlign: "right" }}>{formatMoney(row.igst)}</td>
                                        <td style={{ textAlign: "right" }}>{formatMoney(row.total)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                <div className="pf-actions">
                    <Button onClick={() => exportCsv("/reports/export/sales-register", "gst-sales-register.csv")}>Export GST sales register (CSV)</Button>
                </div>
                <p className="pf-help">Give the register to your accountant for GSTR-1 / GSTR-3B filing. It lists every invoice with GSTIN, place of supply and tax split.</p>
            </div>
        </div>
    );
}

export default Insights;
