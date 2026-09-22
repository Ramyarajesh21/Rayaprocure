import "./Quotations.css";

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";

import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import Button from "../../components/Button";
import SearchBar from "../../components/SearchBar";
import StatusBadge from "../../components/StatusBadge";
import DataTable from "../../components/DataTable";

import { useToast } from "../../components/Toast/ToastContext";


function Quotations() {

    const navigate = useNavigate();

    const [quotations, setQuotations] = useState([]);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");

    const { showToast } = useToast();


    useEffect(() => {
        fetchQuotations();
    }, []);


    // =====================================================
    // FETCH QUOTATIONS
    // =====================================================

    const fetchQuotations = async () => {

        try {

            const response = await api.get("/quotations");

            setQuotations(response.data);

        } catch (error) {

            console.error(
                "Failed to fetch quotations:",
                error
            );

            showToast(
                "Unable to load quotations. Please try again.",
                "error"
            );
        }
    };


    // =====================================================
    // CREATE
    // =====================================================

    const openCreateQuotation = () => {

        navigate("/quotations/create");
    };


    // =====================================================
    // PREVIEW
    // =====================================================

    const openPreview = (quotation) => {

        navigate(
            `/quotations/${quotation.id}/preview`
        );
    };


    // =====================================================
    // EDIT
    // =====================================================

    const openEdit = (quotation) => {

        navigate(
            `/quotations/${quotation.id}/edit`
        );
    };


    // =====================================================
    // DOWNLOAD
    // =====================================================

    const downloadQuotation = (quotation) => {

        navigate(
            `/quotations/${quotation.id}/preview?download=true`
        );
    };


    // =====================================================
    // DELETE
    // =====================================================

    const handleDelete = async (quotationId) => {

        const confirmed = window.confirm(
            "Are you sure you want to delete this quotation?"
        );

        if (!confirmed) {
            return;
        }


        try {

            await api.delete(
                `/quotations/${quotationId}`
            );

            showToast(
                "Quotation deleted successfully.",
                "success"
            );

            fetchQuotations();

        } catch (error) {

            console.error(
                "Quotation delete error:",
                error
            );

            showToast(
                error.response?.data?.message ||
                "Unable to delete quotation. Please try again.",
                "error"
            );
        }
    };


    // =====================================================
    // FILTER
    // =====================================================

    const filteredQuotations = quotations.filter(
        (quotation) => {

            const searchText =
                search.toLowerCase();


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


            return (
                matchesSearch &&
                matchesStatus
            );
        }
    );


    // =====================================================
    // TABLE COLUMNS
    // =====================================================

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
                `₹${Number(
                    quotation.amount
                ).toLocaleString("en-IN")}`,
        },


        {
            key: "status",
            label: "Status",

            render: (quotation) => (
                <StatusBadge
                    status={quotation.status}
                />
            ),
        },


        {
            key: "actions",
            label: "Actions",

            render: (quotation) => (

                <div className="vf-table-actions">

                    {/* PREVIEW */}

                    <button
                        type="button"
                        className="vf-action-button vf-action-view"
                        title="Preview quotation"
                        onClick={() =>
                            openPreview(
                                quotation
                            )
                        }
                    >
                        👁 Preview
                    </button>


                    {/* DELETE */}

                    <button
                        type="button"
                        className="vf-action-button vf-action-delete"
                        title="Delete quotation"
                        onClick={() =>
                            handleDelete(
                                quotation.id
                            )
                        }
                    >
                        🗑 Delete
                    </button>

                </div>
            ),
        },

    ];


    // =====================================================
    // PAGE
    // =====================================================

    return (

        <MainLayout>

            <div className="quotations-page">

                <PageHeader
                    eyebrow="QUOTATIONS"
                    title="Quotations"
                    description="Create, manage and track customer quotations."

                    action={

                        <Button
                            onClick={
                                openCreateQuotation
                            }
                        >
                            + Create Quotation
                        </Button>

                    }
                />


                {/* =================================================
                    TOOLBAR
                ================================================= */}

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
                            setStatusFilter(
                                event.target.value
                            )
                        }
                    >

                        <option value="All">
                            All Status
                        </option>

                        <option value="Draft">
                            Draft
                        </option>

                        <option value="Sent">
                            Sent
                        </option>

                        <option value="Accepted">
                            Accepted
                        </option>

                        <option value="Rejected">
                            Rejected
                        </option>

                        <option value="Expired">
                            Expired
                        </option>

                    </select>

                </div>


                {/* =================================================
                    TABLE
                ================================================= */}

                <DataTable
                    columns={columns}
                    data={filteredQuotations}
                    emptyMessage="No quotations found."
                />

            </div>

        </MainLayout>
    );
}


export default Quotations;