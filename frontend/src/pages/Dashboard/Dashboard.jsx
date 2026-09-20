import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import MainLayout from "../../layouts/MainLayout";
import "./Dashboard.css";

function Dashboard() {
    const navigate = useNavigate();

    const storedUser = localStorage.getItem("vendorflowUser");

    let user = {};

    try {
        user = storedUser ? JSON.parse(storedUser) : {};
    } catch (error) {
        user = {};
    }

    const userName =
        user?.name ||
        user?.username ||
        user?.role ||
        "Admin";

    const currentHour = new Date().getHours();

    let greeting = "Good morning";

    if (currentHour >= 12 && currentHour < 17) {
        greeting = "Good afternoon";
    } else if (currentHour >= 17) {
        greeting = "Good evening";
    }

    const [dashboardData, setDashboardData] = useState({
        total_jobs: 0,
        ongoing_jobs: 0,
        completed_jobs: 0,
        total_rfqs: 0,
        quotation_value: 0,
        invoice_value: 0,
        payments_received: 0,
        outstanding_amount: 0,
        recent_jobs: []
    });

    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchDashboard();
    }, []);

    const fetchDashboard = async () => {
        try {
            const response = await axios.get(
                "http://127.0.0.1:5000/dashboard"
            );

            setDashboardData(response.data);
        } catch (error) {
            console.error(
                "Error loading dashboard:",
                error
            );
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (amount) => {
        const value = Number(amount || 0);

        return `₹${value.toLocaleString("en-IN", {
            maximumFractionDigits: 0
        })}`;
    };

    const formatDate = (date) => {
        if (!date) return "—";

        const parsedDate = new Date(date);

        if (Number.isNaN(parsedDate.getTime())) {
            return "—";
        }

        return parsedDate.toLocaleDateString("en-IN", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    };

    /*
     * Use the backend total_jobs value as the main total.
     * The completed percentage is still calculated from
     * ongoing + completed jobs.
     */
    const totalJobs = Number(
        dashboardData.total_jobs || 0
    );

    const completedJobs = Number(
        dashboardData.completed_jobs || 0
    );

    const ongoingJobs = Number(
        dashboardData.ongoing_jobs || 0
    );

    const statusBasedJobs =
        ongoingJobs + completedJobs;

    const completedPercentage =
        statusBasedJobs > 0
            ? Math.round(
                  (completedJobs /
                      statusBasedJobs) *
                      100
              )
            : 0;

    const revenue = Number(
        dashboardData.invoice_value || 0
    );

    const received = Number(
        dashboardData.payments_received || 0
    );

    /*
     * Revenue represents the total invoice value.
     * Therefore the revenue bar is the full 100% reference.
     */
    const revenueBarWidth =
        revenue > 0 ? 100 : 0;

    const receivedBarWidth =
        revenue > 0
            ? Math.min(
                  (received / revenue) * 100,
                  100
              )
            : 0;

    return (
        <MainLayout>

            <div className="dashboard-page">

                {/* Page Header */}

                <div className="dashboard-header">

                    <div className="dashboard-header-content">

                        <span className="eyebrow">
                            OVERVIEW
                        </span>

                        <h1>
                            {greeting}, {userName}
                        </h1>

                        <p>
                            Here’s a quick overview of your vendor operations.
                        </p>

                    </div>

                </div>


                {/* Statistics */}

                <div className="dashboard-stats">

                    {/* RFQs */}

                    <div className="dashboard-stat-card">

                        <div className="stat-top">

                            <span>
                                RFQs
                            </span>

                            <div className="stat-icon">
                                RFQ
                            </div>

                        </div>

                        <strong>
                            {loading
                                ? "—"
                                : dashboardData.total_rfqs}
                        </strong>

                        <small>
                            Total RFQs
                        </small>

                    </div>


                    {/* Ongoing Jobs */}

                    <div className="dashboard-stat-card">

                        <div className="stat-top">

                            <span>
                                Ongoing Jobs
                            </span>

                            <div className="stat-icon">
                                JB
                            </div>

                        </div>

                        <strong>
                            {loading
                                ? "—"
                                : dashboardData.ongoing_jobs}
                        </strong>

                        <small>
                            Currently ongoing
                        </small>

                    </div>


                    {/* Revenue */}

                    <div className="dashboard-stat-card">

                        <div className="stat-top">

                            <span>
                                Revenue
                            </span>

                            <div className="stat-icon">
                                ₹
                            </div>

                        </div>

                        <strong>
                            {loading
                                ? "—"
                                : formatCurrency(
                                      dashboardData.invoice_value
                                  )}
                        </strong>

                        <small>
                            Total invoice value
                        </small>

                    </div>


                    {/* Outstanding */}

                    <div className="dashboard-stat-card">

                        <div className="stat-top">

                            <span>
                                Outstanding
                            </span>

                            <div className="stat-icon">
                                AR
                            </div>

                        </div>

                        <strong>
                            {loading
                                ? "—"
                                : formatCurrency(
                                      dashboardData.outstanding_amount
                                  )}
                        </strong>

                        <small>
                            Amount pending
                        </small>

                    </div>

                </div>


                {/* Main Dashboard Grid */}

                <div className="dashboard-main-grid">

                    {/* Job Overview */}

                    <section className="dashboard-panel">

                        <div className="panel-header">

                            <div>

                                <span className="panel-eyebrow">
                                    OPERATIONS
                                </span>

                                <h2>
                                    Job Overview
                                </h2>

                            </div>

                            <button
                                type="button"
                                className="text-button"
                                onClick={() =>
                                    navigate("/jobs")
                                }
                            >
                                View Jobs →
                            </button>

                        </div>


                        <div className="job-overview">

                            <div className="job-progress">

                                <div
                                    className="progress-ring"
                                    style={{
                                        "--progress": `${completedPercentage}%`
                                    }}
                                >

                                    <div>

                                        <strong>
                                            {loading
                                                ? "—"
                                                : `${completedPercentage}%`}
                                        </strong>

                                        <span>
                                            Completed
                                        </span>

                                    </div>

                                </div>

                            </div>


                            <div className="job-status-list">

                                {/* Ongoing */}

                                <div className="job-status">

                                    <span className="status-dot ongoing"></span>

                                    <div>

                                        <strong>
                                            Ongoing
                                        </strong>

                                        <small>
                                            {loading
                                                ? "—"
                                                : `${ongoingJobs} Jobs`}
                                        </small>

                                    </div>

                                </div>


                                {/* Completed */}

                                <div className="job-status">

                                    <span className="status-dot completed"></span>

                                    <div>

                                        <strong>
                                            Completed
                                        </strong>

                                        <small>
                                            {loading
                                                ? "—"
                                                : `${completedJobs} Jobs`}
                                        </small>

                                    </div>

                                </div>


                                {/* Total */}

                                <div className="job-status">

                                    <span className="status-dot pending"></span>

                                    <div>

                                        <strong>
                                            Total Jobs
                                        </strong>

                                        <small>
                                            {loading
                                                ? "—"
                                                : `${totalJobs} Jobs`}
                                        </small>

                                    </div>

                                </div>

                            </div>

                        </div>

                    </section>


                    {/* Financial Overview */}

                    <section className="dashboard-panel financial-panel">

                        <div className="panel-header">

                            <div>

                                <span className="panel-eyebrow">
                                    FINANCIAL
                                </span>

                                <h2>
                                    Financial Overview
                                </h2>

                            </div>

                            <span className="financial-period">
                                Overall
                            </span>

                        </div>


                        <div className="financial-values">

                            <div>

                                <span>
                                    Revenue
                                </span>

                                <strong>
                                    {loading
                                        ? "—"
                                        : formatCurrency(
                                              dashboardData.invoice_value
                                          )}
                                </strong>

                            </div>


                            <div>

                                <span>
                                    Received
                                </span>

                                <strong>
                                    {loading
                                        ? "—"
                                        : formatCurrency(
                                              dashboardData.payments_received
                                          )}
                                </strong>

                            </div>


                            <div>

                                <span>
                                    Outstanding
                                </span>

                                <strong>
                                    {loading
                                        ? "—"
                                        : formatCurrency(
                                              dashboardData.outstanding_amount
                                          )}
                                </strong>

                            </div>

                        </div>


                        <div className="financial-bar">

                            <div
                                className="revenue-bar"
                                style={{
                                    width: `${revenueBarWidth}%`
                                }}
                            ></div>

                            <div
                                className="cost-bar"
                                style={{
                                    width: `${receivedBarWidth}%`
                                }}
                            ></div>

                        </div>


                        <div className="financial-legend">

                            <span>

                                <i className="legend-revenue"></i>

                                Revenue

                            </span>


                            <span>

                                <i className="legend-cost"></i>

                                Received

                            </span>

                        </div>

                    </section>

                </div>


                {/* Recent Work Orders */}

                <section className="dashboard-panel recent-orders">

                    <div className="panel-header">

                        <div>

                            <span className="panel-eyebrow">
                                WORK ORDERS
                            </span>

                            <h2>
                                Recent Work Orders
                            </h2>

                        </div>

                        <button
                            type="button"
                            className="text-button"
                            onClick={() =>
                                navigate("/jobs")
                            }
                        >
                            View All →
                        </button>

                    </div>


                    <div className="orders-table-wrapper">

                        <table className="orders-table">

                            <thead>

                                <tr>

                                    <th>
                                        Work Order
                                    </th>

                                    <th>
                                        Customer
                                    </th>

                                    <th>
                                        Job
                                    </th>

                                    <th>
                                        Value
                                    </th>

                                    <th>
                                        Status
                                    </th>

                                </tr>

                            </thead>


                            <tbody>

                                {loading ? (

                                    <tr>

                                        <td colSpan="5">
                                            Loading dashboard data...
                                        </td>

                                    </tr>

                                ) : dashboardData.recent_jobs.length === 0 ? (

                                    <tr>

                                        <td colSpan="5">
                                            No jobs available.
                                        </td>

                                    </tr>

                                ) : (

                                    dashboardData.recent_jobs.map(
                                        (job) => (

                                            <tr key={job.id}>

                                                <td>
                                                    WO-
                                                    {String(
                                                        job.id
                                                    ).padStart(
                                                        3,
                                                        "0"
                                                    )}
                                                </td>

                                                <td>
                                                    {job.company_name ||
                                                        "—"}
                                                </td>

                                                <td>
                                                    {job.job_name ||
                                                        "—"}
                                                </td>

                                                <td>
                                                    {formatCurrency(
                                                        job.quotation_amount
                                                    )}
                                                </td>

                                                <td>

                                                    <span
                                                        className={`status-badge ${
                                                            job.status
                                                                ?.toLowerCase()
                                                                .replace(
                                                                    /\s+/g,
                                                                    "-"
                                                                )
                                                        }`}
                                                    >
                                                        {job.status ||
                                                            "—"}
                                                    </span>

                                                </td>

                                            </tr>

                                        )
                                    )

                                )}

                            </tbody>

                        </table>

                    </div>

                </section>

            </div>

        </MainLayout>
    );
}

export default Dashboard;
