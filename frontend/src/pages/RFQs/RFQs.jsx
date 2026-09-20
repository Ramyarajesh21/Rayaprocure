import { useEffect, useState } from "react";
import api from "../../services/api";

import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import Button from "../../components/Button";
import SearchBar from "../../components/SearchBar";
import StatusBadge from "../../components/StatusBadge";
import Modal from "../../components/Modal";
import DataTable from "../../components/DataTable";
import { useToast } from "../../components/Toast/ToastContext";

import "./RFQs.css";


function RFQs() {

    const { showToast } = useToast();

    const [rfqs, setRfqs] = useState([]);
    const [customers, setCustomers] = useState([]);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");

    const [showForm, setShowForm] = useState(false);
    const [showView, setShowView] = useState(false);

    const [editingId, setEditingId] = useState(null);
    const [selectedRFQ, setSelectedRFQ] = useState(null);

    const [formData, setFormData] = useState({
        customer_id: "",
        request_date: "",
        required_date: "",
        purpose: "",
        description: "",
        status: "New",
    });


    // =====================================================
    // LOAD DATA
    // =====================================================

    useEffect(() => {
        fetchRfqs();
        fetchCustomers();
    }, []);


    const fetchRfqs = async () => {

        try {

            const response = await api.get("/rfqs");

            setRfqs(response.data);

        } catch (error) {

            console.error(
                "Failed to fetch RFQs:",
                error
            );

            showToast(
                "Unable to load RFQs. Please try again.",
                "error"
            );
        }
    };


    const fetchCustomers = async () => {

        try {

            const response = await api.get("/customers");

            setCustomers(response.data);

        } catch (error) {

            console.error(
                "Failed to fetch customers:",
                error
            );

            showToast(
                "Unable to load customers. Please try again.",
                "error"
            );
        }
    };


    // =====================================================
    // FORM CHANGE
    // =====================================================

    const handleChange = (event) => {

        const { name, value } = event.target;

        setFormData((previous) => ({
            ...previous,
            [name]: value,
        }));
    };


    // =====================================================
    // OPEN CREATE
    // =====================================================

    const openCreateForm = () => {

        setEditingId(null);

        setFormData({
            customer_id: "",
            request_date: "",
            required_date: "",
            purpose: "",
            description: "",
            status: "New",
        });

        setShowForm(true);
    };


    // =====================================================
    // OPEN EDIT
    // =====================================================

    const openEditForm = (rfq) => {

        setEditingId(rfq.id);

        setFormData({
            customer_id: rfq.customer_id || "",
            request_date: rfq.request_date
                ? rfq.request_date.substring(0, 10)
                : "",
            required_date: rfq.required_date
                ? rfq.required_date.substring(0, 10)
                : "",
            purpose: rfq.purpose || "",
            description: rfq.description || "",
            status: rfq.status || "New",
        });

        setShowForm(true);
    };


    // =====================================================
    // SAVE / UPDATE RFQ
    // =====================================================

    const handleSubmit = async (event) => {

        event.preventDefault();

        if (!formData.customer_id) {

            showToast(
                "Please select a customer.",
                "error"
            );

            return;
        }

        if (!formData.request_date) {

            showToast(
                "Please select the request date.",
                "error"
            );

            return;
        }

        if (
            formData.required_date &&
            formData.required_date < formData.request_date
        ) {

            showToast(
                "Required date cannot be earlier than request date.",
                "error"
            );

            return;
        }

        try {

            const payload = {
                customer_id: Number(formData.customer_id),
                request_date: formData.request_date,
                required_date:
                    formData.required_date || null,
                purpose:
                    formData.purpose || null,
                description:
                    formData.description || null,
                status: formData.status,
            };


            if (editingId) {

                await api.put(
                    `/rfqs/${editingId}`,
                    payload
                );

                showToast(
                    "RFQ updated successfully.",
                    "success"
                );

            } else {

                await api.post(
                    "/rfqs",
                    payload
                );

                showToast(
                    "RFQ created successfully.",
                    "success"
                );
            }


            setShowForm(false);
            setEditingId(null);

            setFormData({
                customer_id: "",
                request_date: "",
                required_date: "",
                purpose: "",
                description: "",
                status: "New",
            });

            fetchRfqs();

        } catch (error) {

            console.error(
                "Failed to save RFQ:",
                error
            );

            showToast(
                error.response?.data?.message ||
                "Unable to save RFQ. Please try again.",
                "error"
            );
        }
    };


    // =====================================================
    // VIEW RFQ
    // =====================================================

    const handleView = (rfq) => {

        setSelectedRFQ(rfq);

        setShowView(true);
    };


    // =====================================================
    // DELETE RFQ
    // =====================================================

    const handleDelete = async (rfq) => {

        const confirmed = window.confirm(
            `Are you sure you want to delete ${rfq.rfq_number}?`
        );

        if (!confirmed) {
            return;
        }


        try {

            await api.delete(
                `/rfqs/${rfq.id}`
            );

            showToast(
                "RFQ deleted successfully.",
                "success"
            );

            fetchRfqs();

        } catch (error) {

            console.error(
                "Failed to delete RFQ:",
                error
            );

            showToast(
                error.response?.data?.message ||
                "Unable to delete RFQ. Please try again.",
                "error"
            );
        }
    };


    // =====================================================
    // SEARCH + FILTER
    // =====================================================

    const filteredRfqs = rfqs.filter((rfq) => {

        const searchText =
            search.toLowerCase().trim();


        const matchesSearch =
            rfq.rfq_number
                ?.toLowerCase()
                .includes(searchText) ||

            rfq.company_name
                ?.toLowerCase()
                .includes(searchText) ||

            rfq.purpose
                ?.toLowerCase()
                .includes(searchText) ||

            rfq.description
                ?.toLowerCase()
                .includes(searchText);


        const matchesStatus =
            statusFilter === "All" ||
            rfq.status === statusFilter;


        return (
            matchesSearch &&
            matchesStatus
        );
    });


    // =====================================================
    // TABLE
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
            key: "request_date",
            label: "Request Date",

            render: (row) =>
                row.request_date
                    ? new Date(
                        row.request_date
                    ).toLocaleDateString(
                        "en-IN"
                    )
                    : "-",
        },

        {
            key: "required_date",
            label: "Required Date",

            render: (row) =>
                row.required_date
                    ? new Date(
                        row.required_date
                    ).toLocaleDateString(
                        "en-IN"
                    )
                    : "-",
        },

        {
            key: "purpose",
            label: "Purpose",

            render: (row) =>
                row.purpose || "-",
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
            key: "actions",
            label: "Actions",

            render: (row) => (

                <div className="rfq-actions">

                    <button
                        type="button"
                        onClick={() =>
                            handleView(row)
                        }
                    >
                        View
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            openEditForm(row)
                        }
                    >
                        Edit
                    </button>

                    <button
                        type="button"
                        className="rfq-delete-button"
                        onClick={() =>
                            handleDelete(row)
                        }
                    >
                        Delete
                    </button>

                </div>
            ),
        },
    ];


    // =====================================================
    // RENDER
    // =====================================================

    return (

        <MainLayout>

            <PageHeader
                eyebrow="PROCUREMENT"
                title="Requests for Quotation"
                description="Manage customer RFQs and track incoming work requirements."
                action={
                    <Button
                        onClick={openCreateForm}
                    >
                        + Create RFQ
                    </Button>
                }
            />


            {/* TOOLBAR */}

            <div className="rfq-toolbar">

                <SearchBar
                    value={search}
                    onChange={setSearch}
                    placeholder="Search RFQs..."
                />


                <select
                    value={statusFilter}
                    onChange={(event) =>
                        setStatusFilter(
                            event.target.value
                        )
                    }
                    className="rfq-filter"
                >
                    <option value="All">
                        All Status
                    </option>

                    <option value="New">
                        New
                    </option>

                    <option value="Quoted">
                        Quoted
                    </option>
                </select>

            </div>


            {/* SUMMARY */}

            <div className="rfq-summary">

                <span>
                    Total RFQs:{" "}
                    <strong>
                        {filteredRfqs.length}
                    </strong>
                </span>

            </div>


            {/* TABLE */}

            <DataTable
                columns={columns}
                data={filteredRfqs}
                emptyMessage="No RFQs found."
            />


            {/* =================================================
                CREATE / EDIT MODAL
            ================================================= */}

            {showForm && (

                <Modal
                    title={
                        editingId
                            ? "Edit RFQ"
                            : "Create New RFQ"
                    }
                    onClose={() =>
                        setShowForm(false)
                    }
                >

                    <form
                        className="rfq-form"
                        onSubmit={handleSubmit}
                    >

                        <div className="rfq-form-grid">


                            {/* CUSTOMER */}

                            <div className="rfq-form-group">

                                <label>
                                    Customer
                                </label>

                                <select
                                    name="customer_id"
                                    value={
                                        formData.customer_id
                                    }
                                    onChange={
                                        handleChange
                                    }
                                    required
                                >

                                    <option value="">
                                        Select Customer
                                    </option>

                                    {customers.map(
                                        (customer) => (

                                            <option
                                                key={
                                                    customer.id
                                                }
                                                value={
                                                    customer.id
                                                }
                                            >
                                                {
                                                    customer.company_name
                                                }
                                            </option>

                                        )
                                    )}

                                </select>

                            </div>


                            {/* PURPOSE */}

                            <div className="rfq-form-group">

                                <label>
                                    Purpose
                                </label>

                                <select
                                    name="purpose"
                                    value={
                                        formData.purpose
                                    }
                                    onChange={
                                        handleChange
                                    }
                                >

                                    <option value="">
                                        Select Purpose
                                    </option>

                                    <option value="Material Supply">
                                        Material Supply
                                    </option>

                                    <option value="Manpower Supply">
                                        Manpower Supply
                                    </option>

                                    <option value="Service Work">
                                        Service Work
                                    </option>

                                    <option value="Equipment Supply">
                                        Equipment Supply
                                    </option>

                                    <option value="Other">
                                        Other
                                    </option>

                                </select>

                            </div>


                            {/* REQUEST DATE */}

                            <div className="rfq-form-group">

                                <label>
                                    Request Date
                                </label>

                                <input
                                    type="date"
                                    name="request_date"
                                    value={
                                        formData.request_date
                                    }
                                    onChange={
                                        handleChange
                                    }
                                    required
                                />

                            </div>


                            {/* REQUIRED DATE */}

                            <div className="rfq-form-group">

                                <label>
                                    Required Date
                                </label>

                                <input
                                    type="date"
                                    name="required_date"
                                    value={
                                        formData.required_date
                                    }
                                    onChange={
                                        handleChange
                                    }
                                />

                            </div>


                            {/* STATUS */}

                            <div className="rfq-form-group">

                                <label>
                                    Status
                                </label>

                                <select
                                    name="status"
                                    value={
                                        formData.status
                                    }
                                    onChange={
                                        handleChange
                                    }
                                >

                                    <option value="New">
                                        New
                                    </option>

                                    <option value="Quoted">
                                        Quoted
                                    </option>

                                </select>

                            </div>


                            {/* DESCRIPTION */}

                            <div className="rfq-form-group rfq-form-full">

                                <label>
                                    Description
                                </label>

                                <textarea
                                    name="description"
                                    value={
                                        formData.description
                                    }
                                    onChange={
                                        handleChange
                                    }
                                    rows="4"
                                    placeholder="Enter RFQ requirements..."
                                />

                            </div>

                        </div>


                        {/* FORM BUTTONS */}

                        <div className="rfq-form-actions">

                            <Button
                                variant="secondary"
                                type="button"
                                onClick={() =>
                                    setShowForm(false)
                                }
                            >
                                Cancel
                            </Button>

                            <Button type="submit">

                                {editingId
                                    ? "Update RFQ"
                                    : "Save RFQ"}

                            </Button>

                        </div>

                    </form>

                </Modal>
            )}


            {/* =================================================
                VIEW RFQ MODAL
            ================================================= */}

            {showView && selectedRFQ && (

                <Modal
                    title={`RFQ ${selectedRFQ.rfq_number}`}
                    onClose={() =>
                        setShowView(false)
                    }
                >

                    <div className="rfq-view">


                        <div className="rfq-view-header">

                            <div>

                                <span className="rfq-view-label">
                                    RFQ NUMBER
                                </span>

                                <h2>
                                    {selectedRFQ.rfq_number}
                                </h2>

                            </div>

                            <StatusBadge
                                status={
                                    selectedRFQ.status
                                }
                            />

                        </div>


                        <div className="rfq-view-grid">


                            <div className="rfq-view-item">

                                <span>
                                    Customer
                                </span>

                                <strong>
                                    {
                                        selectedRFQ.company_name ||
                                        "-"
                                    }
                                </strong>

                            </div>


                            <div className="rfq-view-item">

                                <span>
                                    Purpose
                                </span>

                                <strong>
                                    {
                                        selectedRFQ.purpose ||
                                        "-"
                                    }
                                </strong>

                            </div>


                            <div className="rfq-view-item">

                                <span>
                                    Request Date
                                </span>

                                <strong>
                                    {
                                        selectedRFQ.request_date
                                            ? new Date(
                                                selectedRFQ.request_date
                                            ).toLocaleDateString(
                                                "en-IN"
                                            )
                                            : "-"
                                    }
                                </strong>

                            </div>


                            <div className="rfq-view-item">

                                <span>
                                    Required Date
                                </span>

                                <strong>
                                    {
                                        selectedRFQ.required_date
                                            ? new Date(
                                                selectedRFQ.required_date
                                            ).toLocaleDateString(
                                                "en-IN"
                                            )
                                            : "-"
                                    }
                                </strong>

                            </div>


                            <div className="rfq-view-item rfq-view-full">

                                <span>
                                    Description
                                </span>

                                <p>
                                    {
                                        selectedRFQ.description ||
                                        "No description provided."
                                    }
                                </p>

                            </div>

                        </div>


                        <div className="rfq-view-actions">

                            <Button
                                variant="secondary"
                                onClick={() =>
                                    setShowView(false)
                                }
                            >
                                Close
                            </Button>

                            <Button
                                onClick={() => {

                                    setShowView(false);

                                    openEditForm(
                                        selectedRFQ
                                    );

                                }}
                            >
                                Edit RFQ
                            </Button>

                        </div>

                    </div>

                </Modal>
            )}

        </MainLayout>
    );
}


export default RFQs;