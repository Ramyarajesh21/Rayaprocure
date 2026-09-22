import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import Button from "../../components/Button";
import SearchBar from "../../components/SearchBar";
import DataTable from "../../components/DataTable";
import StatusBadge from "../../components/StatusBadge";
import { useToast } from "../../components/Toast/ToastContext";

import api from "../../services/api";
import "./Invoices.css";


function Invoices() {

    const navigate = useNavigate();

    const [invoices, setInvoices] = useState([]);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");

    const { showToast } = useToast();


    // ---------------------------------------------------------
    // LOAD INVOICES
    // ---------------------------------------------------------

    useEffect(() => {
        fetchInvoices();
    }, []);


    const fetchInvoices = async () => {

        try {

            const response = await api.get("/invoices");

            setInvoices(
                Array.isArray(response.data)
                    ? response.data
                    : []
            );

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


    // ---------------------------------------------------------
    // CREATE INVOICE
    // ---------------------------------------------------------

    const openCreateInvoice = () => {
        navigate("/invoices/create");
    };


    // ---------------------------------------------------------
    // PREVIEW INVOICE
    // ---------------------------------------------------------

    const openInvoicePreview = (invoice) => {

        if (!invoice?.id) {

            showToast(
                "Unable to open invoice preview.",
                "error"
            );

            return;
        }

        navigate(
            `/invoices/${invoice.id}/preview`
        );
    };


    // ---------------------------------------------------------
    // DELETE INVOICE
    // ---------------------------------------------------------

    const handleDeleteInvoice = async (id) => {

        const confirmed = window.confirm(
            "Are you sure you want to delete this invoice?"
        );

        if (!confirmed) {
            return;
        }

        try {

            await api.delete(
                `/invoices/${id}`
            );

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

            showToast(
                message,
                "error"
            );
        }
    };


    // ---------------------------------------------------------
    // FILTER INVOICES
    // ---------------------------------------------------------

    const filteredInvoices = invoices.filter(
        (invoice) => {

            const searchText =
                search.toLowerCase();

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


            return (
                matchesSearch &&
                matchesStatus
            );
        }
    );


    // ---------------------------------------------------------
    // TABLE COLUMNS
    // ---------------------------------------------------------

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
                    row.amount || 0
                ).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                })}`,
        },

        {
            key: "status",
            label: "Status",

            render: (row) => (
                <StatusBadge
                    status={row.status}
                />
            ),
        },

        {
            key: "payment_status",
            label: "Payment",

            render: (row) => (
                <StatusBadge
                    status={
                        row.payment_status ||
                        "Pending"
                    }
                />
            ),
        },

        {
            key: "actions",
            label: "Actions",

            render: (row) => (

                <div className="vf-table-actions">

                    {/* PREVIEW */}

                    <button
                        type="button"
                        className="vf-action-button vf-action-view"
                        onClick={() =>
                            openInvoicePreview(row)
                        }
                    >
                        Preview
                    </button>


                    {/* DELETE */}

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


    // ---------------------------------------------------------
    // PAGE
    // ---------------------------------------------------------

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
                            onClick={openCreateInvoice}
                        >
                            + Create Invoice
                        </Button>

                    }
                />


                {/* SEARCH + FILTER */}

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


                {/* INVOICE TABLE */}

                <DataTable
                    columns={columns}
                    data={filteredInvoices}
                    emptyMessage="No invoices found."
                />

            </div>

        </MainLayout>
    );
}


export default Invoices;