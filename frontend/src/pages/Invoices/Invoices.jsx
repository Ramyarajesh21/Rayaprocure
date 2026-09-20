import { useEffect, useState } from "react";

import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import Button from "../../components/Button";
import SearchBar from "../../components/SearchBar";
import DataTable from "../../components/DataTable";
import StatusBadge from "../../components/StatusBadge";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast/ToastContext";

import api from "../../services/api";
import "./Invoices.css";

function Invoices() {

    const [invoices, setInvoices] = useState([]);
    const [jobs, setJobs] = useState([]);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");

    const [showModal, setShowModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);

    const [editingInvoiceId, setEditingInvoiceId] = useState(null);
    const [selectedInvoice, setSelectedInvoice] = useState(null);

    const [formData, setFormData] = useState({
        job_id: "",
        invoice_number: "",
        amount: "",
        status: "Submitted",
    });

    const { showToast } = useToast();

    useEffect(() => {
        fetchInvoices();
        fetchJobs();
    }, []);

    const fetchInvoices = async () => {
        try {
            const response = await api.get("/invoices");
            setInvoices(response.data);
        } catch (error) {
            console.error(
                "Error fetching invoices:",
                error
            );

            showToast(
                "Unable to load invoices. Please try again.",
                "error"
            );
        }
    };

    const fetchJobs = async () => {
        try {
            const response = await api.get("/jobs");
            setJobs(response.data);
        } catch (error) {
            console.error(
                "Error fetching jobs:",
                error
            );

            showToast(
                "Unable to load jobs. Please try again.",
                "error"
            );
        }
    };

    const handleChange = (event) => {
        const { name, value } = event.target;

        setFormData((previous) => ({
            ...previous,
            [name]: value,
        }));
    };

    const openAddModal = () => {

        setEditingInvoiceId(null);

        setFormData({
            job_id: "",
            invoice_number: "",
            amount: "",
            status: "Submitted",
        });

        setShowModal(true);
    };

    const openEditModal = (invoice) => {

        setEditingInvoiceId(invoice.id);

        setFormData({
            job_id: invoice.job_id,
            invoice_number: invoice.invoice_number,
            amount: invoice.amount,
            status: invoice.status,
        });

        setShowModal(true);
    };

    const closeModal = () => {

        setShowModal(false);
        setEditingInvoiceId(null);

        setFormData({
            job_id: "",
            invoice_number: "",
            amount: "",
            status: "Submitted",
        });
    };

    const openViewModal = (invoice) => {
        setSelectedInvoice(invoice);
        setShowViewModal(true);
    };

    const closeViewModal = () => {
        setShowViewModal(false);
        setSelectedInvoice(null);
    };

    const handleSaveInvoice = async (event) => {

        event.preventDefault();

        const invoiceNumber =
            formData.invoice_number.trim();

        const amount = Number(formData.amount);

        if (!formData.job_id) {
            showToast(
                "Please select a job.",
                "error"
            );
            return;
        }

        if (!invoiceNumber) {
            showToast(
                "Please enter an invoice number.",
                "error"
            );
            return;
        }

        if (!formData.amount || amount <= 0) {
            showToast(
                "Please enter a valid invoice amount.",
                "error"
            );
            return;
        }

        const payload = {
            job_id: Number(formData.job_id),
            invoice_number: invoiceNumber,
            amount: amount,
            status: formData.status,
        };

        try {

            if (editingInvoiceId) {

                await api.put(
                    `/invoices/${editingInvoiceId}`,
                    payload
                );

                showToast(
                    "Invoice updated successfully.",
                    "success"
                );

            } else {

                await api.post(
                    "/invoices",
                    payload
                );

                showToast(
                    "Invoice created successfully.",
                    "success"
                );
            }

            closeModal();

            await fetchInvoices();
            await fetchJobs();

        } catch (error) {

            console.error(
                "Error saving invoice:",
                error
            );

            const message =
                error.response?.data?.message ||
                "Unable to save invoice. Please try again.";

            showToast(message, "error");
        }
    };

    const handleDeleteInvoice = async (id) => {

        const confirmed = window.confirm(
            "Are you sure you want to delete this invoice?"
        );

        if (!confirmed) {
            return;
        }

        try {

            await api.delete(`/invoices/${id}`);

            showToast(
                "Invoice deleted successfully.",
                "success"
            );

            await fetchInvoices();

        } catch (error) {

            console.error(
                "Error deleting invoice:",
                error
            );

            const message =
                error.response?.data?.message ||
                "Unable to delete invoice. Please try again.";

            showToast(message, "error");
        }
    };

    /*
     * Only jobs that do not already have an invoice
     * can be selected for a new invoice.
     *
     * During edit, the current invoice's job remains
     * available.
     */
    const availableJobs = jobs.filter((job) => {

        const hasInvoice = invoices.some(
            (invoice) =>
                Number(invoice.job_id) ===
                Number(job.id) &&
                Number(invoice.id) !==
                Number(editingInvoiceId)
        );

        return !hasInvoice;
    });

    const filteredInvoices = invoices.filter((invoice) => {

        const searchText = search.toLowerCase();

        const matchesSearch =
            invoice.invoice_number
                ?.toLowerCase()
                .includes(searchText) ||
            invoice.job_name
                ?.toLowerCase()
                .includes(searchText) ||
            invoice.company_name
                ?.toLowerCase()
                .includes(searchText);

        const matchesStatus =
            statusFilter === "All" ||
            invoice.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    const columns = [
        {
            key: "invoice_number",
            label: "Invoice",
        },
        {
            key: "job_name",
            label: "Job",
        },
        {
            key: "amount",
            label: "Amount",
            render: (row) =>
                `₹${Number(
                    row.amount
                ).toLocaleString("en-IN")}`,
        },
        {
            key: "status",
            label: "Status",
            render: (row) => (
                <StatusBadge status={row.status} />
            ),
        },
        {
            key: "actions",
            label: "Actions",
            render: (row) => (
                <div className="vf-table-actions">

                    <button
                        type="button"
                        className="vf-action-button vf-action-view"
                        onClick={() =>
                            openViewModal(row)
                        }
                    >
                        View
                    </button>

                    <button
                        type="button"
                        className="vf-action-button vf-action-edit"
                        onClick={() =>
                            openEditModal(row)
                        }
                    >
                        Edit
                    </button>

                    <button
                        type="button"
                        className="vf-action-button vf-action-delete"
                        onClick={() =>
                            handleDeleteInvoice(row.id)
                        }
                    >
                        Delete
                    </button>

                </div>
            ),
        },
    ];

    return (
        <MainLayout>

            <div className="invoices-page">

                <PageHeader
                    eyebrow="INVOICES"
                    title="Invoices"
                    description="Manage invoices raised against completed and ongoing jobs."
                    action={
                        <Button
                            variant="gold"
                            onClick={openAddModal}
                        >
                            + Add Invoice
                        </Button>
                    }
                />

                <div className="vf-page-toolbar">

                    <SearchBar
                        value={search}
                        onChange={setSearch}
                        placeholder="Search invoices..."
                    />

                    <select
                        value={statusFilter}
                        onChange={(event) =>
                            setStatusFilter(
                                event.target.value
                            )
                        }
                        className="vf-filter-select"
                    >
                        <option value="All">
                            All Status
                        </option>

                        <option value="Submitted">
                            Submitted
                        </option>

                        <option value="Approved">
                            Approved
                        </option>
                    </select>

                </div>

                <DataTable
                    columns={columns}
                    data={filteredInvoices}
                    emptyMessage="No invoices found."
                />

            </div>

            {/* ADD / EDIT INVOICE */}

            {showModal && (
                <Modal
                    title={
                        editingInvoiceId
                            ? "Edit Invoice"
                            : "Add Invoice"
                    }
                    onClose={closeModal}
                >

                    <form
                        className="vf-form"
                        onSubmit={handleSaveInvoice}
                    >

                        <div className="vf-form-field">

                            <label>
                                Job
                            </label>

                            <select
                                name="job_id"
                                value={formData.job_id}
                                onChange={handleChange}
                                required
                            >

                                <option value="">
                                    Select Job
                                </option>

                                {availableJobs.map(
                                    (job) => (
                                        <option
                                            key={job.id}
                                            value={job.id}
                                        >
                                            {job.job_name}
                                        </option>
                                    )
                                )}

                            </select>

                        </div>

                        <div className="vf-form-field">

                            <label>
                                Invoice Number
                            </label>

                            <input
                                type="text"
                                name="invoice_number"
                                value={
                                    formData.invoice_number
                                }
                                onChange={handleChange}
                                placeholder="Enter invoice number"
                                required
                            />

                        </div>

                        <div className="vf-form-field">

                            <label>
                                Amount
                            </label>

                            <input
                                type="number"
                                name="amount"
                                value={formData.amount}
                                onChange={handleChange}
                                placeholder="Enter invoice amount"
                                min="0"
                                step="0.01"
                                required
                            />

                        </div>

                        <div className="vf-form-field">

                            <label>
                                Status
                            </label>

                            <select
                                name="status"
                                value={formData.status}
                                onChange={handleChange}
                            >

                                <option value="Submitted">
                                    Submitted
                                </option>

                                <option value="Approved">
                                    Approved
                                </option>

                            </select>

                        </div>

                        <div className="vf-form-actions">

                            <Button
                                variant="secondary"
                                type="button"
                                onClick={closeModal}
                            >
                                Cancel
                            </Button>

                            <Button
                                variant="gold"
                                type="submit"
                            >
                                {editingInvoiceId
                                    ? "Update Invoice"
                                    : "Save Invoice"}
                            </Button>

                        </div>

                    </form>

                </Modal>
            )}

            {/* VIEW INVOICE */}

            {showViewModal && selectedInvoice && (
                <Modal
                    title="Invoice Details"
                    onClose={closeViewModal}
                >

                    <div className="vf-detail-list">

                        <div>
                            <span>
                                Invoice Number
                            </span>

                            <strong>
                                {
                                    selectedInvoice.invoice_number
                                }
                            </strong>
                        </div>

                        <div>
                            <span>
                                Job
                            </span>

                            <strong>
                                {
                                    selectedInvoice.job_name
                                }
                            </strong>
                        </div>

                        <div>
                            <span>
                                Amount
                            </span>

                            <strong>
                                ₹{Number(
                                    selectedInvoice.amount
                                ).toLocaleString(
                                    "en-IN"
                                )}
                            </strong>
                        </div>

                        <div>
                            <span>
                                Status
                            </span>

                            <StatusBadge
                                status={
                                    selectedInvoice.status
                                }
                            />
                        </div>

                    </div>

                </Modal>
            )}

        </MainLayout>
    );
}

export default Invoices;