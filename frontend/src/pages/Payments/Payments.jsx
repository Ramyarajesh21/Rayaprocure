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

import "./Payments.css";

function Payments() {

    const [payments, setPayments] = useState([]);
    const [invoices, setInvoices] = useState([]);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");

    const [showModal, setShowModal] = useState(false);
    const [showViewModal, setShowViewModal] = useState(false);

    const [editingPaymentId, setEditingPaymentId] = useState(null);
    const [selectedPayment, setSelectedPayment] = useState(null);

    const [formData, setFormData] = useState({
        invoice_id: "",
        payment_date: "",
        amount: "",
        status: "Pending",
    });

    const { showToast } = useToast();

    useEffect(() => {
        fetchPayments();
        fetchInvoices();
    }, []);

    const fetchPayments = async () => {
        try {
            const response = await api.get("/payments");
            setPayments(response.data);
        } catch (error) {
            console.error("Error fetching payments:", error);

            showToast(
                "Unable to load payments. Please try again.",
                "error"
            );
        }
    };

    const fetchInvoices = async () => {
        try {
            const response = await api.get("/invoices");
            setInvoices(response.data);
        } catch (error) {
            console.error("Error fetching invoices:", error);

            showToast(
                "Unable to load invoices. Please try again.",
                "error"
            );
        }
    };

    const handleChange = (event) => {
        const { name, value } = event.target;

        setFormData({
            ...formData,
            [name]: value,
        });
    };

    const openAddModal = () => {

        setEditingPaymentId(null);

        setFormData({
            invoice_id: "",
            payment_date: "",
            amount: "",
            status: "Pending",
        });

        setShowModal(true);
    };

    const openEditModal = (payment) => {

        setEditingPaymentId(payment.id);

        setFormData({
            invoice_id: payment.invoice_id,
            payment_date: payment.payment_date
                ? payment.payment_date.substring(0, 10)
                : "",
            amount: payment.amount,
            status: payment.status,
        });

        setShowModal(true);
    };

    const openViewModal = (payment) => {
        setSelectedPayment(payment);
        setShowViewModal(true);
    };

    const handleSavePayment = async (event) => {

        event.preventDefault();

        if (!formData.invoice_id) {
            showToast(
                "Please select an invoice.",
                "error"
            );
            return;
        }

        if (!formData.payment_date) {
            showToast(
                "Please select payment date.",
                "error"
            );
            return;
        }

        if (
            formData.amount === "" ||
            Number(formData.amount) <= 0
        ) {
            showToast(
                "Payment amount must be greater than 0.",
                "error"
            );
            return;
        }

        try {

            if (editingPaymentId) {

                await api.put(
                    `/payments/${editingPaymentId}`,
                    formData
                );

                showToast(
                    "Payment updated successfully.",
                    "success"
                );

            } else {

                await api.post(
                    "/payments",
                    formData
                );

                showToast(
                    "Payment created successfully.",
                    "success"
                );
            }

            setShowModal(false);
            setEditingPaymentId(null);

            await fetchPayments();
            await fetchInvoices();

        } catch (error) {

            const message =
                error.response?.data?.message ||
                "Unable to save payment. Please try again.";

            showToast(message, "error");
        }
    };

    const handleDeletePayment = async (id) => {

        const confirmed = window.confirm(
            "Are you sure you want to delete this payment?"
        );

        if (!confirmed) {
            return;
        }

        try {

            await api.delete(`/payments/${id}`);

            setPayments((currentPayments) =>
                currentPayments.filter(
                    (payment) => payment.id !== id
                )
            );

            showToast(
                "Payment deleted successfully.",
                "success"
            );

        } catch (error) {

            const message =
                error.response?.data?.message ||
                "Unable to delete payment. Please try again.";

            showToast(message, "error");
        }
    };

    const filteredPayments = payments.filter((payment) => {

        const matchesSearch =
            `${payment.invoice_number || ""} ${payment.job_name || ""}`
                .toLowerCase()
                .includes(search.toLowerCase());

        const matchesStatus =
            statusFilter === "All" ||
            payment.status === statusFilter;

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
            key: "payment_date",
            label: "Payment Date",
            render: (row) =>
                row.payment_date
                    ? new Date(row.payment_date).toLocaleDateString(
                          "en-IN"
                      )
                    : "-",
        },
        {
            key: "amount",
            label: "Amount",
            render: (row) =>
                `₹${Number(row.amount).toLocaleString("en-IN")}`,
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
                        onClick={() => openViewModal(row)}
                    >
                        View
                    </button>

                    <button
                        type="button"
                        className="vf-action-button vf-action-edit"
                        onClick={() => openEditModal(row)}
                    >
                        Edit
                    </button>

                    <button
                        type="button"
                        className="vf-action-button vf-action-delete"
                        onClick={() => handleDeletePayment(row.id)}
                    >
                        Delete
                    </button>

                </div>
            ),
        },
    ];

    return (
        <MainLayout>

            <div className="payments-page">

                <PageHeader
                    eyebrow="PAYMENTS"
                    title="Payments"
                    description="Track payments received against customer invoices."
                    action={
                        <Button
                            variant="gold"
                            onClick={openAddModal}
                        >
                            + Add Payment
                        </Button>
                    }
                />

                <div className="vf-page-toolbar">

                    <SearchBar
                        value={search}
                        onChange={setSearch}
                        placeholder="Search payments..."
                    />

                    <select
                        value={statusFilter}
                        onChange={(event) =>
                            setStatusFilter(event.target.value)
                        }
                        className="vf-filter-select"
                    >
                        <option value="All">All Status</option>
                        <option value="Pending">Pending</option>
                        <option value="Received">Received</option>
                    </select>

                </div>

                <DataTable
                    columns={columns}
                    data={filteredPayments}
                    emptyMessage="No payments found."
                />

            </div>

            {showModal && (
                <Modal
                    title={
                        editingPaymentId
                            ? "Edit Payment"
                            : "Add Payment"
                    }
                    onClose={() => setShowModal(false)}
                >

                    <form
                        className="vf-form"
                        onSubmit={handleSavePayment}
                    >

                        <div className="vf-form-field">

                            <label>Invoice</label>

                            <select
                                name="invoice_id"
                                value={formData.invoice_id}
                                onChange={handleChange}
                                required
                            >
                                <option value="">
                                    Select Invoice
                                </option>

                                {invoices.map((invoice) => (
                                    <option
                                        key={invoice.id}
                                        value={invoice.id}
                                    >
                                        {invoice.invoice_number}
                                    </option>
                                ))}

                            </select>

                        </div>

                        <div className="vf-form-field">

                            <label>Payment Date</label>

                            <input
                                type="date"
                                name="payment_date"
                                value={formData.payment_date}
                                onChange={handleChange}
                                required
                            />

                        </div>

                        <div className="vf-form-field">

                            <label>Amount</label>

                            <input
                                type="number"
                                name="amount"
                                value={formData.amount}
                                onChange={handleChange}
                                placeholder="Enter payment amount"
                                min="0.01"
                                step="0.01"
                                required
                            />

                        </div>

                        <div className="vf-form-field">

                            <label>Status</label>

                            <select
                                name="status"
                                value={formData.status}
                                onChange={handleChange}
                            >
                                <option value="Pending">
                                    Pending
                                </option>

                                <option value="Received">
                                    Received
                                </option>
                            </select>

                        </div>

                        <div className="vf-form-actions">

                            <Button
                                variant="secondary"
                                type="button"
                                onClick={() => setShowModal(false)}
                            >
                                Cancel
                            </Button>

                            <Button
                                variant="gold"
                                type="submit"
                            >
                                {editingPaymentId
                                    ? "Update Payment"
                                    : "Save Payment"}
                            </Button>

                        </div>

                    </form>

                </Modal>
            )}

            {showViewModal && selectedPayment && (
                <Modal
                    title="Payment Details"
                    onClose={() => setShowViewModal(false)}
                >

                    <div className="vf-detail-list">

                        <div>
                            <span>Invoice Number</span>
                            <strong>
                                {selectedPayment.invoice_number}
                            </strong>
                        </div>

                        <div>
                            <span>Job</span>
                            <strong>
                                {selectedPayment.job_name}
                            </strong>
                        </div>

                        <div>
                            <span>Payment Date</span>
                            <strong>
                                {selectedPayment.payment_date
                                    ? new Date(
                                          selectedPayment.payment_date
                                      ).toLocaleDateString("en-IN")
                                    : "-"}
                            </strong>
                        </div>

                        <div>
                            <span>Amount</span>
                            <strong>
                                ₹{Number(
                                    selectedPayment.amount
                                ).toLocaleString("en-IN")}
                            </strong>
                        </div>

                        <div>
                            <span>Status</span>
                            <StatusBadge
                                status={selectedPayment.status}
                            />
                        </div>

                    </div>

                </Modal>
            )}

        </MainLayout>
    );
}

export default Payments;