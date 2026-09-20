import "./Quotations.css";

import { useEffect, useState } from "react";
import api from "../../services/api";

import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import Button from "../../components/Button";
import SearchBar from "../../components/SearchBar";
import StatusBadge from "../../components/StatusBadge";
import DataTable from "../../components/DataTable";
import Modal from "../../components/Modal";

import { useToast } from "../../components/Toast/ToastContext";

function Quotations() {
    const [quotations, setQuotations] = useState([]);
    const [rfqs, setRfqs] = useState([]);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");

    const [showForm, setShowForm] = useState(false);
    const [showView, setShowView] = useState(false);

    const [editingQuotationId, setEditingQuotationId] = useState(null);
    const [selectedQuotation, setSelectedQuotation] = useState(null);

    const [formData, setFormData] = useState({
        rfq_id: "",
        description: "",
        amount: "",
        status: "Draft",
    });

    const { showToast } = useToast();

    useEffect(() => {
        fetchQuotations();
        fetchRfqs();
    }, []);

    const fetchQuotations = async () => {
        try {
            const response = await api.get("/quotations");
            setQuotations(response.data);
        } catch (error) {
            console.error("Failed to fetch quotations:", error);

            showToast(
                "Unable to load quotations. Please try again.",
                "error"
            );
        }
    };

    const fetchRfqs = async () => {
        try {
            const response = await api.get("/rfqs");
            setRfqs(response.data);
        } catch (error) {
            console.error("Failed to fetch RFQs:", error);

            showToast(
                "Unable to load RFQs. Please try again.",
                "error"
            );
        }
    };

    const handleInputChange = (event) => {
        const { name, value } = event.target;

        setFormData((previous) => ({
            ...previous,
            [name]: value,
        }));
    };

    const resetForm = () => {
        setFormData({
            rfq_id: "",
            description: "",
            amount: "",
            status: "Draft",
        });

        setEditingQuotationId(null);
    };

    const openCreateForm = () => {
        resetForm();
        setShowForm(true);
    };

    const openEditForm = (quotation) => {
        setFormData({
            rfq_id: quotation.rfq_id,
            description: quotation.description,
            amount: quotation.amount,
            status: quotation.status,
        });

        setEditingQuotationId(quotation.id);
        setShowForm(true);
    };

    const openViewModal = (quotation) => {
        setSelectedQuotation(quotation);
        setShowView(true);
    };

    const closeForm = () => {
        setShowForm(false);
        resetForm();
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        if (
            !formData.rfq_id ||
            !formData.description ||
            !formData.amount
        ) {
            showToast(
                "Please fill all required fields.",
                "error"
            );
            return;
        }

        try {
            const payload = {
                rfq_id: Number(formData.rfq_id),
                description: formData.description,
                amount: Number(formData.amount),
                status: formData.status,
            };

            if (editingQuotationId) {
                await api.put(
                    `/quotations/${editingQuotationId}`,
                    payload
                );

                showToast(
                    "Quotation updated successfully.",
                    "success"
                );
            } else {
                await api.post("/quotations", payload);

                showToast(
                    "Quotation created successfully.",
                    "success"
                );
            }

            closeForm();
            fetchQuotations();
            fetchRfqs();
        } catch (error) {
            console.error("Quotation save error:", error);

            showToast(
                error.response?.data?.message ||
                "Unable to save quotation. Please try again.",
                "error"
            );
        }
    };

    const handleDelete = async (quotationId) => {
        const confirmed = window.confirm(
            "Are you sure you want to delete this quotation?"
        );

        if (!confirmed) {
            return;
        }

        try {
            await api.delete(`/quotations/${quotationId}`);

            showToast(
                "Quotation deleted successfully.",
                "success"
            );

            fetchQuotations();
            fetchRfqs();
        } catch (error) {
            console.error("Quotation delete error:", error);

            showToast(
                error.response?.data?.message ||
                "Unable to delete quotation. Please try again.",
                "error"
            );
        }
    };

    const filteredQuotations = quotations.filter((quotation) => {
        const searchText = search.toLowerCase();

        const matchesSearch =
            quotation.rfq_number
                ?.toLowerCase()
                .includes(searchText) ||
            quotation.company_name
                ?.toLowerCase()
                .includes(searchText) ||
            quotation.description
                ?.toLowerCase()
                .includes(searchText);

        const matchesStatus =
            statusFilter === "All" ||
            quotation.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    const columns = [
        {
            key: "rfq_number",
            label: "RFQ Number",
        },
        {
            key: "company_name",
            label: "Customer",
        },
        {
            key: "description",
            label: "Description",
        },
        {
            key: "amount",
            label: "Amount",
            render: (quotation) =>
                `₹${Number(quotation.amount).toLocaleString("en-IN")}`,
        },
        {
            key: "status",
            label: "Status",
            render: (quotation) => (
                <StatusBadge status={quotation.status} />
            ),
        },
        {
            key: "actions",
            label: "Actions",
            render: (quotation) => (
                <div className="vf-table-actions">
                    <button
                        type="button"
                        className="vf-action-button vf-action-view"
                        onClick={() =>
                            openViewModal(quotation)
                        }
                    >
                        View
                    </button>

                    <button
                        type="button"
                        className="vf-action-button vf-action-edit"
                        onClick={() =>
                            openEditForm(quotation)
                        }
                    >
                        Edit
                    </button>

                    <button
                        type="button"
                        className="vf-action-button vf-action-delete"
                        onClick={() =>
                            handleDelete(quotation.id)
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
            <div className="quotations-page">
                <PageHeader
                    eyebrow="QUOTATIONS"
                    title="Quotations"
                    description="Create, manage and track customer quotations."
                    action={
                        <Button onClick={openCreateForm}>
                            + Create Quotation
                        </Button>
                    }
                />

                <div className="vf-page-toolbar">
                    <SearchBar
                        value={search}
                        onChange={setSearch}
                        placeholder="Search quotations..."
                    />

                    <select
                        className="vf-filter-select"
                        value={statusFilter}
                        onChange={(event) =>
                            setStatusFilter(event.target.value)
                        }
                    >
                        <option value="All">All Status</option>
                        <option value="Draft">Draft</option>
                        <option value="Sent">Sent</option>
                        <option value="Approved">Approved</option>
                    </select>
                </div>

                <DataTable
                    columns={columns}
                    data={filteredQuotations}
                    emptyMessage="No quotations found."
                />

                {showForm && (
                    <Modal
                        title={
                            editingQuotationId
                                ? "Edit Quotation"
                                : "Create Quotation"
                        }
                        onClose={closeForm}
                    >
                        <form
                            className="vf-form"
                            onSubmit={handleSubmit}
                        >
                            <div className="vf-form-group">
                                <label>Select RFQ</label>

                                <select
                                    name="rfq_id"
                                    value={formData.rfq_id}
                                    onChange={handleInputChange}
                                    required
                                >
                                    <option value="">
                                        Select RFQ
                                    </option>

                                    {rfqs.map((rfq) => (
                                        <option
                                            key={rfq.id}
                                            value={rfq.id}
                                        >
                                            {rfq.rfq_number} —{" "}
                                            {rfq.company_name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="vf-form-group">
                                <label>Description</label>

                                <textarea
                                    name="description"
                                    value={formData.description}
                                    onChange={handleInputChange}
                                    placeholder="Enter quotation description"
                                    rows="4"
                                    required
                                />
                            </div>

                            <div className="vf-form-row">
                                <div className="vf-form-group">
                                    <label>Amount</label>

                                    <input
                                        type="number"
                                        name="amount"
                                        value={formData.amount}
                                        onChange={handleInputChange}
                                        placeholder="Enter amount"
                                        min="0"
                                        step="0.01"
                                        required
                                    />
                                </div>

                                <div className="vf-form-group">
                                    <label>Status</label>

                                    <select
                                        name="status"
                                        value={formData.status}
                                        onChange={handleInputChange}
                                    >
                                        <option value="Draft">
                                            Draft
                                        </option>
                                        <option value="Sent">
                                            Sent
                                        </option>
                                        <option value="Approved">
                                            Approved
                                        </option>
                                    </select>
                                </div>
                            </div>

                            <div className="vf-form-actions">
                                <Button
                                    variant="secondary"
                                    type="button"
                                    onClick={closeForm}
                                >
                                    Cancel
                                </Button>

                                <Button type="submit">
                                    {editingQuotationId
                                        ? "Update Quotation"
                                        : "Save Quotation"}
                                </Button>
                            </div>
                        </form>
                    </Modal>
                )}

                {showView && selectedQuotation && (
                    <Modal
                        title="Quotation Details"
                        onClose={() => {
                            setShowView(false);
                            setSelectedQuotation(null);
                        }}
                    >
                        <div className="vf-view-details">
                            <div className="vf-view-item">
                                <span>RFQ Number</span>
                                <strong>
                                    {selectedQuotation.rfq_number}
                                </strong>
                            </div>

                            <div className="vf-view-item">
                                <span>Customer</span>
                                <strong>
                                    {selectedQuotation.company_name}
                                </strong>
                            </div>

                            <div className="vf-view-item">
                                <span>Amount</span>
                                <strong>
                                    ₹{Number(
                                        selectedQuotation.amount
                                    ).toLocaleString("en-IN")}
                                </strong>
                            </div>

                            <div className="vf-view-item">
                                <span>Status</span>
                                <StatusBadge
                                    status={selectedQuotation.status}
                                />
                            </div>

                            <div className="vf-view-item vf-view-full">
                                <span>Description</span>
                                <p>
                                    {selectedQuotation.description}
                                </p>
                            </div>
                        </div>
                    </Modal>
                )}
            </div>
        </MainLayout>
    );
}

export default Quotations;