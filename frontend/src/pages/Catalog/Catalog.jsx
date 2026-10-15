import { useCallback, useEffect, useState } from "react";

import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import Button from "../../components/Button";
import Modal from "../../components/Modal";
import SearchBar from "../../components/SearchBar";
import { useToast } from "../../components/Toast/ToastContext";

import api from "../../services/api";
import { GST_RATES } from "../../utils/gst";
import { errorMessage, formatMoney } from "../../utils/format";

const EMPTY = { name: "", description: "", hsn_sac: "", unit: "Nos", rate: "", gst_rate: "18", is_active: true };

function Catalog() {
    const { showToast } = useToast();
    const [items, setItems] = useState([]);
    const [search, setSearch] = useState("");
    const [editing, setEditing] = useState(null);
    const [form, setForm] = useState(EMPTY);
    const [saving, setSaving] = useState(false);

    const load = useCallback(() => {
        api.get("/api/catalog")
            .then(({ data }) => setItems(data))
            .catch(() => showToast("Unable to load the catalog.", "error"));
    }, [showToast]);

    useEffect(() => {
        load();
    }, [load]);

    const openForm = (item) => {
        setEditing(item ? item.id : "new");
        setForm(item ? { ...item, rate: String(item.rate), gst_rate: String(item.gst_rate) } : EMPTY);
    };

    const save = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            const payload = { ...form, rate: Number(form.rate) || 0, gst_rate: Number(form.gst_rate) };
            if (editing === "new") await api.post("/api/catalog", payload);
            else await api.put(`/api/catalog/${editing}`, payload);
            showToast("Item saved.", "success");
            setEditing(null);
            load();
        } catch (error) {
            showToast(errorMessage(error, "Unable to save the item."), "error");
        } finally {
            setSaving(false);
        }
    };

    const remove = async (item) => {
        if (!window.confirm(`Delete "${item.name}"?`)) return;
        try {
            await api.delete(`/api/catalog/${item.id}`);
            load();
        } catch (error) {
            showToast(errorMessage(error, "Unable to delete the item."), "error");
        }
    };

    const visible = items.filter((item) =>
        `${item.name} ${item.hsn_sac} ${item.description}`.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <MainLayout>
            <div className="pf-page">
                <PageHeader
                    eyebrow="SALES"
                    title="Products & Services"
                    description="Save items once with their HSN/SAC and GST rate, then pick them on any quotation or invoice."
                    action={<Button variant="gold" onClick={() => openForm(null)}>+ Add item</Button>}
                />

                <SearchBar value={search} onChange={setSearch} placeholder="Search items or HSN/SAC…" />

                <div className="pf-card">
                    {visible.length === 0 ? (
                        <p>No items yet.</p>
                    ) : (
                        <div className="pf-scroll">
                            <table className="pf-table">
                                <thead>
                                    <tr><th>Item</th><th>HSN/SAC</th><th>Unit</th><th>Rate (₹)</th><th>GST</th><th /></tr>
                                </thead>
                                <tbody>
                                    {visible.map((item) => (
                                        <tr key={item.id}>
                                            <td>
                                                {item.name}
                                                {!item.is_active && <span className="pf-pill warn" style={{ marginLeft: 6 }}>Inactive</span>}
                                            </td>
                                            <td>{item.hsn_sac || "—"}</td>
                                            <td>{item.unit}</td>
                                            <td>{formatMoney(item.rate)}</td>
                                            <td>{Number(item.gst_rate)}%</td>
                                            <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                                                <button type="button" className="pf-link" onClick={() => openForm(item)}>Edit</button>
                                                <button type="button" className="pf-link danger" onClick={() => remove(item)}>Delete</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {editing && (
                <Modal title={editing === "new" ? "Add item" : "Edit item"} onClose={() => setEditing(null)}>
                    <form className="customer-form" onSubmit={save}>
                        <div className="customer-form-field" style={{ gridColumn: "1 / -1" }}>
                            <label>Name</label>
                            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
                        </div>
                        <div className="customer-form-field" style={{ gridColumn: "1 / -1" }}>
                            <label>Description (optional)</label>
                            <input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
                        </div>
                        <div className="customer-form-field">
                            <label>HSN / SAC</label>
                            <input value={form.hsn_sac} onChange={(event) => setForm({ ...form, hsn_sac: event.target.value })} inputMode="numeric" maxLength={8} />
                        </div>
                        <div className="customer-form-field">
                            <label>Unit</label>
                            <input value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} />
                        </div>
                        <div className="customer-form-field">
                            <label>Rate (₹)</label>
                            <input type="number" min="0" step="0.01" value={form.rate} onChange={(event) => setForm({ ...form, rate: event.target.value })} />
                        </div>
                        <div className="customer-form-field">
                            <label>GST rate</label>
                            <select value={form.gst_rate} onChange={(event) => setForm({ ...form, gst_rate: event.target.value })}>
                                {GST_RATES.map((rate) => <option key={rate} value={rate}>{rate}%</option>)}
                            </select>
                        </div>
                        <label className="pf-check" style={{ gridColumn: "1 / -1" }}>
                            <input type="checkbox" checked={form.is_active} onChange={(event) => setForm({ ...form, is_active: event.target.checked })} />
                            Available for new documents
                        </label>
                        <div className="customer-form-actions">
                            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
                            <Button type="submit" variant="gold" disabled={saving}>{saving ? "Saving…" : "Save item"}</Button>
                        </div>
                    </form>
                </Modal>
            )}
        </MainLayout>
    );
}

export default Catalog;
