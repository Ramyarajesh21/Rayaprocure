import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import SearchBar from "../../components/SearchBar";
import DataTable from "../../components/DataTable";
import StatusBadge from "../../components/StatusBadge";
import Button from "../../components/Button";
import Modal from "../../components/Modal";
import { useToast } from "../../components/Toast/ToastContext";
import JobCosts from "./JobCosts";
import { formatMoney } from "../../utils/format";
import "./Jobs.css";

const JOB_STATUSES = ["Not Started", "Ongoing", "On Hold", "Completed"];

const EMPTY_JOB = {
    quotation_id: "",
    job_name: "",
    start_date: "",
    status: "Ongoing",
    due_date: "",
    assigned_to: "",
    notes: "",
};

function Jobs() {
    const navigate = useNavigate();
    const [team, setTeam] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [quotations, setQuotations] = useState([]);

    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("All");

    const [loading, setLoading] = useState(true);

    const [showForm, setShowForm] = useState(false);
    const [showView, setShowView] = useState(false);

    const [editingJobId, setEditingJobId] = useState(null);
    const [selectedJob, setSelectedJob] = useState(null);

    const [formData, setFormData] = useState(EMPTY_JOB);

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
        api.get("/api/users").then(({ data }) => setTeam(data.filter((user) => user.is_active))).catch(() => {});
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

        setFormData(EMPTY_JOB);

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
            due_date: job.due_date ? job.due_date.substring(0, 10) : "",
            assigned_to: job.assigned_to ? String(job.assigned_to) : "",
            notes: job.notes || "",
        });

        setShowForm(true);
    };

    const closeForm = () => {
        setShowForm(false);
        setEditingJobId(null);

        setFormData(EMPTY_JOB);
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
            due_date: formData.due_date || null,
            assigned_to: formData.assigned_to ? Number(formData.assigned_to) : null,
            notes: formData.notes.trim(),
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
            key: "assignee_name",
            label: "Assigned",
            render: (job) => job.assignee_name || "—",
        },
        {
            key: "due_date",
            label: "Due",
            render: (job) => {
                if (!job.due_date) return "—";
                const late = job.status !== "Completed" && new Date(job.due_date) < new Date(new Date().toDateString());
                return (
                    <span style={late ? { color: "var(--color-danger)", fontWeight: 700 } : undefined}>
                        {new Date(job.due_date).toLocaleDateString("en-IN")}
                    </span>
                );
            },
        },
        {
            key: "margin",
            label: "Margin",
            render: (job) => (
                <span style={{ color: job.margin < 0 ? "var(--color-danger)" : undefined }}>
                    ₹{formatMoney(job.margin)}
                </span>
            ),
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
                        className="vf-action-button vf-action-view"
                        onClick={() =>
                            navigate(`/invoices/create?job=${job.id}`)
                        }
                    >
                        Invoice
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

                        {JOB_STATUSES.map((status) => (
                            <option key={status} value={status}>
                                {status}
                            </option>
                        ))}
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
                                        {JOB_STATUSES.map((status) => (
                                            <option key={status} value={status}>
                                                {status}
                                            </option>
                                        ))}
                                    </select>

                                </div>

                            </div>

                            <div className="vf-form-row">

                                <div className="vf-form-group">
                                    <label>Due Date</label>
                                    <input
                                        type="date"
                                        name="due_date"
                                        value={formData.due_date}
                                        min={formData.start_date}
                                        onChange={handleInputChange}
                                    />
                                </div>

                                <div className="vf-form-group">
                                    <label>Assigned To</label>
                                    <select
                                        name="assigned_to"
                                        value={formData.assigned_to}
                                        onChange={handleInputChange}
                                    >
                                        <option value="">Unassigned</option>
                                        {team.map((member) => (
                                            <option key={member.id} value={member.id}>
                                                {member.name} ({member.role})
                                            </option>
                                        ))}
                                    </select>
                                </div>

                            </div>

                            <div className="vf-form-group">
                                <label>Notes</label>
                                <textarea
                                    name="notes"
                                    rows="3"
                                    value={formData.notes}
                                    onChange={handleInputChange}
                                />
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

                            <div className="vf-view-item">
                                <span>Assigned To</span>
                                <strong>{selectedJob.assignee_name || "—"}</strong>
                            </div>

                            <div className="vf-view-item">
                                <span>Due Date</span>
                                <strong>
                                    {selectedJob.due_date
                                        ? new Date(selectedJob.due_date).toLocaleDateString("en-IN")
                                        : "—"}
                                </strong>
                            </div>

                            {selectedJob.notes && (
                                <div className="vf-view-item">
                                    <span>Notes</span>
                                    <strong style={{ whiteSpace: "pre-line" }}>{selectedJob.notes}</strong>
                                </div>
                            )}

                        </div>

                        <JobCosts job={selectedJob} onChanged={fetchJobs} />
                    </Modal>
                )}

            </div>
        </MainLayout>
    );
}

export default Jobs;
