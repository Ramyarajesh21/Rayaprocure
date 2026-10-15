import { useEffect, useState } from "react";
import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import StatusBadge from "../../components/StatusBadge";
import api from "../../services/api";
import Button from "../../components/Button";
import Insights from "./Insights";
import "./Reports.css";

function Reports() {
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchReport();
    }, []);

    const fetchReport = async () => {
        try {
            const response = await api.get("/reports/summary");
            setSummary(response.data);
        } catch (error) {
            console.error("Failed to load reports:", error);
        } finally {
            setLoading(false);
        }
    };

    const formatCurrency = (value) => {
        return `₹${Number(value || 0).toLocaleString("en-IN")}`;
    };

    const downloadReport = async (type) => {
        const response = await api.get(`/reports/export/${type}`, { responseType: "blob" });
        const url = URL.createObjectURL(response.data);
        const link = document.createElement("a"); link.href = url; link.download = `${type}-report.csv`; link.click(); URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <MainLayout>
                <div className="reports-page">
                    <PageHeader
                        eyebrow="BUSINESS INSIGHTS"
                        title="Reports"
                        description="Overview of your vendor operations and financial activity."
                    />

                    <div className="reports-loading">
                        Loading reports...
                    </div>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="reports-page">

                <PageHeader
                    eyebrow="BUSINESS INSIGHTS"
                    title="Reports"
                    description="Overview of your vendor operations and financial activity."
                    action={<div className="report-export-actions"><Button variant="secondary" onClick={() => downloadReport("invoices")}>Export invoices</Button><Button onClick={() => downloadReport("payments")}>Export payments</Button></div>}
                />

                {/* Summary Cards */}
                <div className="reports-summary-grid">

                    <div className="report-card">
                        <span className="report-card-label">
                            Total Customers
                        </span>
                        <strong className="report-card-value">
                            {summary?.total_customers || 0}
                        </strong>
                        <span className="report-card-note">
                            Active customer records
                        </span>
                    </div>

                    <div className="report-card">
                        <span className="report-card-label">
                            Total RFQs
                        </span>
                        <strong className="report-card-value">
                            {summary?.total_rfqs || 0}
                        </strong>
                        <span className="report-card-note">
                            Requests received
                        </span>
                    </div>

                    <div className="report-card">
                        <span className="report-card-label">
                            Total Quotations
                        </span>
                        <strong className="report-card-value">
                            {summary?.total_quotations || 0}
                        </strong>
                        <span className="report-card-note">
                            Quotations prepared
                        </span>
                    </div>

                    <div className="report-card">
                        <span className="report-card-label">
                            Total Jobs
                        </span>
                        <strong className="report-card-value">
                            {summary?.total_jobs || 0}
                        </strong>
                        <span className="report-card-note">
                            Jobs created
                        </span>
                    </div>

                </div>

                {/* Operations & Finance */}
                <div className="reports-main-grid">

                    <div className="report-section">
                        <div className="report-section-header">
                            <div>
                                <span className="report-section-eyebrow">
                                    OPERATIONS
                                </span>
                                <h2>Job Overview</h2>
                            </div>
                        </div>

                        <div className="job-overview">

                            <div className="job-stat">
                                <div className="job-stat-top">
                                    <span>Ongoing Jobs</span>
                                    <StatusBadge status="Ongoing" />
                                </div>

                                <strong>
                                    {summary?.ongoing_jobs || 0}
                                </strong>
                            </div>

                            <div className="job-stat">
                                <div className="job-stat-top">
                                    <span>Completed Jobs</span>
                                    <StatusBadge status="Completed" />
                                </div>

                                <strong>
                                    {summary?.completed_jobs || 0}
                                </strong>
                            </div>

                        </div>
                    </div>

                    <div className="report-section">
                        <div className="report-section-header">
                            <div>
                                <span className="report-section-eyebrow">
                                    FINANCIAL OVERVIEW
                                </span>
                                <h2>Invoice & Payments</h2>
                            </div>
                        </div>

                        <div className="finance-list">

                            <div className="finance-row">
                                <span>Total Invoice Value</span>
                                <strong>
                                    {formatCurrency(
                                        summary?.total_invoice_value
                                    )}
                                </strong>
                            </div>

                            <div className="finance-row">
                                <span>Payments Received</span>
                                <strong>
                                    {formatCurrency(
                                        summary?.total_payments_received
                                    )}
                                </strong>
                            </div>

                            <div className="finance-row finance-outstanding">
                                <span>Outstanding Amount</span>
                                <strong>
                                    {formatCurrency(
                                        summary?.outstanding_amount
                                    )}
                                </strong>
                            </div>

                        </div>
                    </div>

                </div>

                {/* Business Flow */}
                <div className="report-section report-flow-section">

                    <div className="report-section-header">
                        <div>
                            <span className="report-section-eyebrow">
                                BUSINESS FLOW
                            </span>
                            <h2>Vendor Operations Summary</h2>
                        </div>
                    </div>

                    <div className="report-flow">

                        <div className="flow-item">
                            <span>01</span>
                            <strong>Customers</strong>
                            <small>
                                {summary?.total_customers || 0} records
                            </small>
                        </div>

                        <div className="flow-line"></div>

                        <div className="flow-item">
                            <span>02</span>
                            <strong>RFQs</strong>
                            <small>
                                {summary?.total_rfqs || 0} received
                            </small>
                        </div>

                        <div className="flow-line"></div>

                        <div className="flow-item">
                            <span>03</span>
                            <strong>Quotations</strong>
                            <small>
                                {summary?.total_quotations || 0} prepared
                            </small>
                        </div>

                        <div className="flow-line"></div>

                        <div className="flow-item">
                            <span>04</span>
                            <strong>Jobs</strong>
                            <small>
                                {summary?.total_jobs || 0} created
                            </small>
                        </div>

                        <div className="flow-line"></div>

                        <div className="flow-item">
                            <span>05</span>
                            <strong>Payments</strong>
                            <small>
                                {formatCurrency(
                                    summary?.total_payments_received
                                )}
                            </small>
                        </div>

                    </div>

                </div>


                <Insights />

            </div>
        </MainLayout>
    );
}

export default Reports;
