import { useEffect, useState } from "react";
import api from "../../services/api";
import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import SearchBar from "../../components/SearchBar";
import DataTable from "../../components/DataTable";
import StatusBadge from "../../components/StatusBadge";
import Button from "../../components/Button";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import "./Jobs.css";

function Jobs() {
    const [jobs, setJobs] = useState([]);
    const [quotations, setQuotations] = useState([]);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");

    const [loading, setLoading] = useState(true);

    const [showForm, setShowForm] = useState(false);
    const [showView, setShowView] = useState(false);

    const [editingJobId, setEditingJobId] = useState(null);
    const [selectedJob, setSelectedJob] = useState(null);

    const [formData, setFormData] = useState({
        quotation_id: "",
        job_name: "",
        start_date: "",
        status: "Ongoing",
    });

    const { showToast } = useToast();

    const fetchJobs = async () => {
        try {
            const response = await api.get("/jobs");
            setJobs(response.data);
        } catch (error) {
            console.error("Error fetching jobs:", error);

            showToast(
                "Unable to load jobs. Please try again.",
                "error"
            );
        } finally {
            setLoading(false);
        }
    };

    const fetchQuotations = async () => {
        try {
            const response = await api.get("/quotations");
            setQuotations(response.data);
        } catch (error) {
            console.error("Error fetching quotations:", error);

            showToast(
                "Unable to load quotations. Please try again.",
                "error"
            );
        }
    };

    useEffect(() => {
        fetchJobs();
        fetchQuotations();
    }, []);

    const handleInputChange = (event) => {
        const { name, value } = event.target;

        setFormData((previous) => ({
            ...previous,
            [name]: value,
        }));
    };

    const openCreateForm = () => {
        setEditingJobId(null);

        setFormData({
            quotation_id: "",
            job_name: "",
            start_date: "",
            status: "Ongoing",
        });

        setShowForm(true);
    };

    const openEditForm = (job) => {
        setEditingJobId(job.id);

        setFormData({
            quotation_id: job.quotation_id,
            job_name: job.job_name,
            start_date: job.start_date
                ? job.start_date.substring(0, 10)
                : "",
            status: job.status,
        });

        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        setEditingJobId(null);

        setFormData({
            quotation_id: "",
            job_name: "",
            start_date: "",
            status: "Ongoing",
        });
    };

    const handleSubmit = async (event) => {
        event.preventDefault();

        const jobName = formData.job_name.trim();

        if (!formData.quotation_id) {
            showToast(
                "Please select a quotation.",
                "error"
            );
            return;
        }

        if (!jobName) {
            showToast(
                "Please enter a job name.",
                "error"
            );
            return;
        }

        if (!formData.start_date) {
            showToast(
                "Please select the start date.",
                "error"
            );
            return;
        }

        const payload = {
            quotation_id: Number(formData.quotation_id),
            job_name: jobName,
            start_date: formData.start_date,
            status: formData.status,
        };

        try {
            if (editingJobId) {
                await api.put(
                    `/jobs/${editingJobId}`,
                    payload
                );

                showToast(
                    "Job updated successfully.",
                    "success"
                );
            } else {
                await api.post(
                    "/jobs",
                    payload
                );

                showToast(
                    "Job created successfully.",
                    "success"
                );
            }

            closeForm();

            await fetchJobs();
            await fetchQuotations();

        } catch (error) {
            console.error(
                "Error saving job:",
                error
            );

            showToast(
                error.response?.data?.message ||
                "Unable to save job. Please try again.",
                "error"
            );
        }
    };

    const handleView = (job) => {
        setSelectedJob(job);
        setShowView(true);
    };

    const closeView = () => {
        setShowView(false);
        setSelectedJob(null);
    };

    const handleDelete = async (jobId) => {
        const confirmed = window.confirm(
            "Are you sure you want to delete this job?"
        );

        if (!confirmed) {
            return;
        }

        try {
            await api.delete(`/jobs/${jobId}`);

            showToast(
                "Job deleted successfully.",
                "success"
            );

            await fetchJobs();

        } catch (error) {
            console.error(
                "Error deleting job:",
                error
            );

            showToast(
                error.response?.data?.message ||
                "Unable to delete job. Please try again.",
                "error"
            );
        }
    };

    const filteredJobs = jobs.filter((job) => {
        const searchText = search.toLowerCase();

        const matchesSearch =
            job.job_name
                ?.toLowerCase()
                .includes(searchText) ||
            job.company_name
                ?.toLowerCase()
                .includes(searchText) ||
            job.rfq_number
                ?.toLowerCase()
                .includes(searchText);

        const matchesStatus =
            statusFilter === "All" ||
            job.status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    /*
     * Only Accepted quotations can move
     * into the Job stage.
     *
     * During Edit, the quotation already connected
     * to the current job is also included.
     */
    const availableQuotations = quotations.filter(
        (quotation) =>
            quotation.status === "Accepted" ||
            Number(quotation.id) ===
                Number(formData.quotation_id)
    );

    const columns = [
        {
            key: "job_name",
            label: "Job",
        },
        {
            key: "company_name",
            label: "Customer",
        },
        {
            key: "rfq_number",
            label: "RFQ",
        },
        {
            key: "start_date",
            label: "Start Date",
            render: (job) =>
                job.start_date
                    ? new Date(
                          job.start_date
                      ).toLocaleDateString("en-IN")
                    : "—",
        },
        {
            key: "status",
            label: "Status",
            render: (job) => (
                <StatusBadge status={job.status} />
            ),
        },
        {
            key: "actions",
            label: "Actions",
            render: (job) => (
                <div className="vf-table-actions">
                    <button
                        type="button"
                        className="vf-action-button vf-action-view"
                        onClick={() =>
                            handleView(job)
                        }
                    >
                        View
                    </button>

                    <button
                        type="button"
                        className="vf-action-button vf-action-edit"
                        onClick={() =>
                            openEditForm(job)
                        }
                    >
                        Edit
                    </button>

                    <button
                        type="button"
                        className="vf-action-button vf-action-delete"
                        onClick={() =>
                            handleDelete(job.id)
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
            <div className="jobs-page">

                <PageHeader
                    eyebrow="OPERATIONS"
                    title="Jobs"
                    description="Manage and track ongoing and completed vendor jobs."
                    action={
                        <Button
                            variant="primary"
                            onClick={openCreateForm}
                        >
                            + Create Job
                        </Button>
                    }
                />

                <div className="vf-page-toolbar">

                    <SearchBar
                        value={search}
                        onChange={setSearch}
                        placeholder="Search jobs..."
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

                        <option value="Ongoing">
                            Ongoing
                        </option>

                        <option value="Completed">
                            Completed
                        </option>
                    </select>

                </div>

                {loading ? (
                    <div className="vf-table-empty">
                        Loading jobs...
                    </div>
                ) : (
                    <DataTable
                        columns={columns}
                        data={filteredJobs}
                        emptyMessage="No jobs found."
                    />
                )}

                {/* CREATE / EDIT MODAL */}

                {showForm && (
                    <Modal
                        title={
                            editingJobId
                                ? "Edit Job"
                                : "Create Job"
                        }
                        onClose={closeForm}
                    >
                        <form
                            className="vf-form"
                            onSubmit={handleSubmit}
                        >

                            <div className="vf-form-group">

                                <label>
                                    Quotation
                                </label>

                                <select
                                    name="quotation_id"
                                    value={
                                        formData.quotation_id
                                    }
                                    onChange={
                                        handleInputChange
                                    }
                                    required
                                >
                                    <option value="">
                                        Select Quotation
                                    </option>

                                    {availableQuotations.map(
                                        (quotation) => (
                                            <option
                                                key={
                                                    quotation.id
                                                }
                                                value={
                                                    quotation.id
                                                }
                                            >
                                                {
                                                    quotation.rfq_number
                                                }{" "}
                                                -{" "}
                                                {
                                                    quotation.company_name
                                                }{" "}
                                                -{" "}
                                                {
                                                    quotation.status
                                                }
                                            </option>
                                        )
                                    )}
                                </select>

                            </div>

                            <div className="vf-form-group">

                                <label>
                                    Job Name
                                </label>

                                <input
                                    type="text"
                                    name="job_name"
                                    value={
                                        formData.job_name
                                    }
                                    onChange={
                                        handleInputChange
                                    }
                                    placeholder="Enter job name"
                                    required
                                />

                            </div>

                            <div className="vf-form-row">

                                <div className="vf-form-group">

                                    <label>
                                        Start Date
                                    </label>

                                    <input
                                        type="date"
                                        name="start_date"
                                        value={
                                            formData.start_date
                                        }
                                        onChange={
                                            handleInputChange
                                        }
                                        required
                                    />

                                </div>

                                <div className="vf-form-group">

                                    <label>
                                        Status
                                    </label>

                                    <select
                                        name="status"
                                        value={
                                            formData.status
                                        }
                                        onChange={
                                            handleInputChange
                                        }
                                    >
                                        <option value="Ongoing">
                                            Ongoing
                                        </option>

                                        <option value="Completed">
                                            Completed
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

                                <Button
                                    variant="primary"
                                    type="submit"
                                >
                                    {editingJobId
                                        ? "Update Job"
                                        : "Create Job"}
                                </Button>

                            </div>

                        </form>
                    </Modal>
                )}

                {/* VIEW MODAL */}

                {showView && selectedJob && (
                    <Modal
                        title="Job Details"
                        onClose={closeView}
                    >
                        <div className="vf-view-details">

                            <div className="vf-view-item">
                                <span>Job Name</span>
                                <strong>
                                    {selectedJob.job_name}
                                </strong>
                            </div>

                            <div className="vf-view-item">
                                <span>Customer</span>
                                <strong>
                                    {selectedJob.company_name}
                                </strong>
                            </div>

                            <div className="vf-view-item">
                                <span>RFQ Number</span>
                                <strong>
                                    {selectedJob.rfq_number}
                                </strong>
                            </div>

                            <div className="vf-view-item">
                                <span>Quotation</span>
                                <strong>
                                    {
                                        selectedJob.quotation_description
                                    }
                                </strong>
                            </div>

                            <div className="vf-view-item">
                                <span>Start Date</span>
                                <strong>
                                    {selectedJob.start_date
                                        ? new Date(
                                              selectedJob.start_date
                                          ).toLocaleDateString(
                                              "en-IN"
                                          )
                                        : "—"}
                                </strong>
                            </div>

                            <div className="vf-view-item">
                                <span>Status</span>
                                <strong>
                                    <StatusBadge
                                        status={
                                            selectedJob.status
                                        }
                                    />
                                </strong>
                            </div>

                        </div>
                    </Modal>
                )}

            </div>
        </MainLayout>
    );
}

export default Jobs;