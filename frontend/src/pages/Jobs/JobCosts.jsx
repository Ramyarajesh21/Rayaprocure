import { useCallback, useEffect, useState } from "react";
import api from "../../services/api";
import Button from "../../components/Button";
import { useToast } from "../../components/Toast/ToastContext";
import { errorMessage, formatDate, formatMoney, todayISO } from "../../utils/format";

// Costs recorded against a job, with the resulting margin.
function JobCosts({ job, onChanged }) {
    const { showToast } = useToast();
    const [costs, setCosts] = useState([]);
    const [form, setForm] = useState({ description: "", amount: "", cost_date: todayISO() });
    const [summary, setSummary] = useState(job);

    const load = useCallback(async () => {
        try {
            const [costResponse, jobResponse] = await Promise.all([
                api.get(`/jobs/${job.id}/costs`),
                api.get(`/jobs/${job.id}`),
            ]);
            setCosts(costResponse.data);
            setSummary(jobResponse.data);
            onChanged?.();
        } catch (error) {
            showToast(errorMessage(error, "Unable to load job costs."), "error");
        }
    }, [job.id, onChanged, showToast]);

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [job.id]);

    const add = async (event) => {
        event.preventDefault();
        try {
            await api.post(`/jobs/${job.id}/costs`, { ...form, amount: Number(form.amount) });
            setForm({ description: "", amount: "", cost_date: todayISO() });
            load();
        } catch (error) {
            showToast(errorMessage(error, "Unable to add the cost."), "error");
        }
    };

    const remove = async (cost) => {
        try {
            await api.delete(`/jobs/costs/${cost.id}`);
            load();
        } catch (error) {
            showToast(errorMessage(error, "Unable to remove the cost."), "error");
        }
    };

    const marginBad = summary.margin < 0;

    return (
        <div className="pf-card" style={{ marginTop: 16, boxShadow: "none" }}>
            <h3>Costs &amp; margin</h3>
            <div className="pf-grid">
                <div className="pf-field"><span>Job value (excl. GST)</span><strong>₹{formatMoney(summary.job_value)}</strong></div>
                <div className="pf-field"><span>Costs so far</span><strong>₹{formatMoney(summary.costs_total)}</strong></div>
                <div className="pf-field">
                    <span>Margin</span>
                    <strong style={{ color: marginBad ? "var(--color-danger)" : "var(--color-success)" }}>
                        ₹{formatMoney(summary.margin)}{summary.margin_percent != null ? ` (${summary.margin_percent}%)` : ""}
                    </strong>
                </div>
                <div className="pf-field"><span>Billed (excl. GST)</span><strong>₹{formatMoney(summary.billed_taxable)} · {summary.invoice_count} invoice(s)</strong></div>
            </div>

            {costs.length > 0 && (
                <div className="pf-scroll">
                    <table className="pf-table">
                        <tbody>
                            {costs.map((cost) => (
                                <tr key={cost.id}>
                                    <td>{formatDate(cost.cost_date)}</td>
                                    <td>{cost.description}</td>
                                    <td style={{ textAlign: "right" }}>₹{formatMoney(cost.amount)}</td>
                                    <td style={{ textAlign: "right" }}><button type="button" className="pf-link danger" onClick={() => remove(cost)}>Remove</button></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <form className="pf-grid" onSubmit={add}>
                <label className="pf-field"><span>Cost</span>
                    <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="e.g. Materials" required />
                </label>
                <label className="pf-field"><span>Amount (₹)</span>
                    <input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
                </label>
                <label className="pf-field"><span>Date</span>
                    <input type="date" value={form.cost_date} onChange={(event) => setForm({ ...form, cost_date: event.target.value })} required />
                </label>
                <div className="pf-field"><span>&nbsp;</span><Button type="submit">Add cost</Button></div>
            </form>
        </div>
    );
}

export default JobCosts;
