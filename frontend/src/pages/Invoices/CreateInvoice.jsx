import React, {
    useEffect,
    useMemo,
    useState,
} from "react";

import {
    useNavigate,
    useSearchParams,
} from "react-router-dom";

import api from "../../services/api";
import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import Button from "../../components/Button";
import { useToast } from "../../components/Toast/ToastContext";

import "../Quotations/Quotations.css";
import "./Invoices.css";

const DEFAULT_NOTES =
    "Thank you for your business. Please contact us if you have any questions regarding this invoice.";

const DEFAULT_TERMS =
    "Payment is due on or before the due date mentioned above. Please retain this invoice for your records.";

const formatCurrency = (value) => {
    const amount = Number(value || 0);

    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2,
    }).format(amount);
};

const getToday = () => {
    const date = new Date();

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
};

const getDefaultDueDate = (dateString) => {
    const date = new Date(`${dateString}T00:00:00`);

    date.setDate(date.getDate() + 10);

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
};

const getNextInvoiceNumber = (invoices = []) => {
    let highestNumber = 0;

    invoices.forEach((invoice) => {
        const invoiceNumber = String(
            invoice?.invoice_number || ""
        ).trim();

        const match = invoiceNumber.match(/INV-(\d+)/i);

        if (match) {
            highestNumber = Math.max(
                highestNumber,
                Number(match[1])
            );
        }
    });

    return `INV-${String(highestNumber + 1).padStart(5, "0")}`;
};

const createEmptyItem = () => ({
    id: `${Date.now()}-${Math.random()}`,
    description: "",
    quantity: "1",
    unit: "Job",
    rate: "0",
});

/*
 * ============================================================
 * CUSTOMER HELPERS
 * ============================================================
 */

const getCustomerIdFromJob = (job) => {
    return (
        job?.customer_id ||
        job?.customer?.id ||
        job?.customer_details?.id ||
        job?.company_id ||
        job?.company?.id ||
        null
    );
};

const getCustomerFromJob = (job, customers = []) => {
    if (!job) {
        return null;
    }

    const embeddedCustomer =
        job.customer ||
        job.customer_details ||
        job.company ||
        null;

    const customerId = getCustomerIdFromJob(job);

    const loadedCustomer = customerId
        ? customers.find(
            (customer) =>
                String(customer?.id) ===
                String(customerId)
        )
        : null;

    return loadedCustomer || embeddedCustomer || null;
};

const normalizeCustomer = (customer, job = null) => {
    if (!customer && !job) {
        return null;
    }

    return {
        id:
            customer?.id ||
            getCustomerIdFromJob(job),

        company_name:
            customer?.company_name ||
            customer?.company ||
            customer?.name ||
            job?.customer_name ||
            job?.company_name ||
            job?.company?.company_name ||
            job?.company?.name ||
            job?.customer?.company_name ||
            job?.customer?.name ||
            "Customer Company",

        contact_name:
            customer?.contact_name ||
            customer?.contact_person ||
            customer?.contact ||
            job?.contact_name ||
            job?.customer?.contact_name ||
            job?.company?.contact_name ||
            "",

        address:
            customer?.address ||
            customer?.billing_address ||
            customer?.bill_to_address ||
            job?.customer?.address ||
            job?.customer?.billing_address ||
            job?.company?.address ||
            job?.company?.billing_address ||
            job?.billing_address ||
            "",

        city:
            customer?.city ||
            job?.customer?.city ||
            job?.company?.city ||
            "",

        state:
            customer?.state ||
            job?.customer?.state ||
            job?.company?.state ||
            "",

        pincode:
            customer?.pincode ||
            customer?.postal_code ||
            customer?.zip_code ||
            job?.customer?.pincode ||
            job?.company?.pincode ||
            "",

        phone:
            customer?.phone ||
            customer?.mobile ||
            customer?.contact_number ||
            job?.customer?.phone ||
            job?.customer?.mobile ||
            job?.company?.phone ||
            job?.company?.mobile ||
            "",

        email:
            customer?.email ||
            job?.customer?.email ||
            job?.company?.email ||
            "",
    };
};

const CreateInvoice = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { showToast } = useToast();

    const editInvoiceId = searchParams.get("edit");
    const isEditMode = Boolean(editInvoiceId);

    const [jobs, setJobs] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [invoices, setInvoices] = useState([]);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [error, setError] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const [items, setItems] = useState([
        {
            id: "initial-item",
            description: "",
            quantity: "1",
            unit: "Job",
            rate: "0",
        },
    ]);

    const [formData, setFormData] = useState({
        job_id: "",
        invoice_number: "",
        invoice_date: getToday(),
        due_date: getDefaultDueDate(getToday()),
        adjustment: "0",
        payment_status: "Pending",
        notes: DEFAULT_NOTES,
        terms_conditions: DEFAULT_TERMS,
    });

    /*
     * ============================================================
     * LOAD DATA
     * ============================================================
     */

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                setError("");

                const [
                    jobsResponse,
                    invoicesResponse,
                    customersResponse,
                ] = await Promise.all([
                    api.get("/jobs"),
                    api.get("/invoices"),
                    api.get("/customers"),
                ]);

                const jobsData =
                    Array.isArray(jobsResponse.data)
                        ? jobsResponse.data
                        : jobsResponse.data?.jobs || [];

                const invoicesData =
                    Array.isArray(invoicesResponse.data)
                        ? invoicesResponse.data
                        : invoicesResponse.data?.invoices || [];

                const customersData =
                    Array.isArray(customersResponse.data)
                        ? customersResponse.data
                        : customersResponse.data?.customers || [];

                setJobs(jobsData);
                setInvoices(invoicesData);
                setCustomers(customersData);

                if (isEditMode) {
                    const invoiceResponse =
                        await api.get(
                            `/invoices/${editInvoiceId}`
                        );

                    const invoice =
                        invoiceResponse.data?.invoice ||
                        invoiceResponse.data;

                    const relatedJob =
                        jobsData.find(
                            (job) =>
                                String(job.id) ===
                                String(invoice?.job_id)
                        ) || null;

                    const existingDescription =
                        invoice?.description ||
                        relatedJob?.job_name ||
                        relatedJob?.name ||
                        relatedJob?.quotation_description ||
                        "Job Service";

                    setFormData({
                        job_id: invoice?.job_id
                            ? String(invoice.job_id)
                            : "",

                        invoice_number:
                            invoice?.invoice_number ||
                            getNextInvoiceNumber(
                                invoicesData
                            ),

                        invoice_date:
                            invoice?.invoice_date ||
                            getToday(),

                        due_date:
                            invoice?.due_date ||
                            getDefaultDueDate(
                                invoice?.invoice_date ||
                                getToday()
                            ),

                        adjustment:
                            invoice?.adjustment ??
                            "0",

                        payment_status:
                            invoice?.payment_status ||
                            "Pending",

                        notes:
                            invoice?.notes ||
                            DEFAULT_NOTES,

                        terms_conditions:
                            invoice?.terms_conditions ||
                            DEFAULT_TERMS,
                    });

                    setItems([
                        {
                            id: "existing-item",
                            description:
                                existingDescription,

                            quantity:
                                invoice?.quantity ??
                                "1",

                            unit:
                                invoice?.unit ||
                                "Job",

                            rate:
                                invoice?.rate ??
                                invoice?.amount ??
                                "0",
                        },
                    ]);
                } else {
                    setFormData((prev) => ({
                        ...prev,
                        invoice_number:
                            getNextInvoiceNumber(
                                invoicesData
                            ),
                    }));
                }
            } catch (err) {
                console.error(
                    "Failed to load invoice data:",
                    err
                );

                setError(
                    err?.response?.data?.message ||
                    "Failed to load invoice data."
                );
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [editInvoiceId, isEditMode]);

    /*
     * ============================================================
     * AVAILABLE JOBS
     * ============================================================
     */

    const availableJobs = useMemo(() => {
        const invoicedJobIds = new Set(
            invoices
                .filter(
                    (invoice) =>
                        !isEditMode ||
                        String(invoice.id) !==
                            String(editInvoiceId)
                )
                .map((invoice) =>
                    String(invoice.job_id)
                )
                .filter(Boolean)
        );

        return jobs.filter((job) => {
            if (isEditMode) {
                return (
                    String(job.id) ===
                        String(formData.job_id) ||
                    !invoicedJobIds.has(
                        String(job.id)
                    )
                );
            }

            return !invoicedJobIds.has(
                String(job.id)
            );
        });
    }, [
        jobs,
        invoices,
        isEditMode,
        editInvoiceId,
        formData.job_id,
    ]);

    /*
     * ============================================================
     * SELECTED JOB
     * ============================================================
     */

    const selectedJob = useMemo(() => {
        return (
            jobs.find(
                (job) =>
                    String(job.id) ===
                    String(formData.job_id)
            ) || null
        );
    }, [jobs, formData.job_id]);

    /*
     * ============================================================
     * SELECTED CUSTOMER
     * ============================================================
     */

    const selectedCustomer = useMemo(() => {
        return normalizeCustomer(
            getCustomerFromJob(
                selectedJob,
                customers
            ),
            selectedJob
        );
    }, [
        selectedJob,
        customers,
    ]);

    /*
     * ============================================================
     * ITEM TOTALS
     * ============================================================
     */

    const itemTotals = useMemo(() => {
        return items.map((item) => {
            const quantity = Number(
                item.quantity || 0
            );

            const rate = Number(
                item.rate || 0
            );

            return quantity * rate;
        });
    }, [items]);

    const subtotal = useMemo(() => {
        return itemTotals.reduce(
            (total, amount) =>
                total + amount,
            0
        );
    }, [itemTotals]);

    const adjustment = Number(
        formData.adjustment || 0
    );

    const grandTotal = Math.max(
        0,
        subtotal + adjustment
    );

    /*
     * ============================================================
     * FORM CHANGE
     * ============================================================
     */

    const handleChange = (event) => {
        const {
            name,
            value,
        } = event.target;

        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));

        setError("");
        setSuccessMessage("");
    };

    /*
     * ============================================================
     * ITEM CHANGE
     * ============================================================
     */

    const handleItemChange = (
        itemId,
        field,
        value
    ) => {
        setItems((prevItems) =>
            prevItems.map((item) =>
                item.id === itemId
                    ? {
                        ...item,
                        [field]: value,
                    }
                    : item
            )
        );

        setError("");
        setSuccessMessage("");
    };

    const handleAddItem = () => {
        setItems((prevItems) => [
            ...prevItems,
            createEmptyItem(),
        ]);

        setError("");
        setSuccessMessage("");
    };

    const handleRemoveItem = (itemId) => {
        setItems((prevItems) => {
            if (prevItems.length === 1) {
                return prevItems;
            }

            return prevItems.filter(
                (item) =>
                    item.id !== itemId
            );
        });

        setError("");
        setSuccessMessage("");
    };

    /*
     * ============================================================
     * JOB CHANGE
     * ============================================================
     */

    const handleJobChange = (event) => {
        const jobId = event.target.value;

        const job = jobs.find(
            (item) =>
                String(item.id) ===
                String(jobId)
        );

        let description = "";
        let rateValue = "0";

        if (job) {
            description =
                job.job_name ||
                job.name ||
                job.quotation_description ||
                job.description ||
                "Job Service";

            rateValue =
                job.quotation_grand_total ??
                job.quotation_amount ??
                job.amount ??
                0;
        }

        setFormData((prev) => ({
            ...prev,
            job_id: jobId,
        }));

        setItems((prevItems) => {
            if (prevItems.length === 0) {
                return [
                    {
                        ...createEmptyItem(),
                        description,
                        rate: String(rateValue),
                    },
                ];
            }

            const firstItem = prevItems[0];

            return [
                {
                    ...firstItem,
                    description,
                    rate: String(rateValue),
                },
                ...prevItems.slice(1),
            ];
        });

        setError("");
        setSuccessMessage("");
    };

    /*
     * ============================================================
     * VALIDATION
     * ============================================================
     */

    const validateForm = () => {
        if (!formData.job_id) {
            return "Please select a job.";
        }

        if (!formData.invoice_number.trim()) {
            return "Invoice number is required.";
        }

        if (!formData.invoice_date) {
            return "Invoice date is required.";
        }

        if (!formData.due_date) {
            return "Due date is required.";
        }

        if (
            formData.due_date <
            formData.invoice_date
        ) {
            return "Due date cannot be earlier than invoice date.";
        }

        if (items.length === 0) {
            return "At least one item is required.";
        }

        for (const item of items) {
            if (!item.description.trim()) {
                return "Description is required for every item.";
            }

            if (
                Number(item.quantity) <= 0
            ) {
                return "Quantity must be greater than 0.";
            }

            if (
                Number(item.rate) < 0
            ) {
                return "Rate cannot be negative.";
            }
        }

        if (!formData.payment_status) {
            return "Payment status is required.";
        }

        return "";
    };

    /*
     * ============================================================
     * BUILD PREVIEW DATA
     * ============================================================
     */

    const buildPreviewData = () => {
        const firstItem =
            items[0] || {
                description: "",
                quantity: 1,
                unit: "Job",
                rate: 0,
            };

        return {
            ...formData,

            id: editInvoiceId || null,

            description:
                firstItem.description,

            quantity:
                Number(
                    firstItem.quantity || 0
                ),

            unit:
                firstItem.unit || "Job",

            rate:
                Number(
                    firstItem.rate || 0
                ),

            adjustment,

            subtotal,
            grandTotal,
            amount: grandTotal,

            items: items.map((item) => ({
                ...item,

                quantity: Number(
                    item.quantity || 0
                ),

                rate: Number(
                    item.rate || 0
                ),

                amount:
                    Number(
                        item.quantity || 0
                    ) *
                    Number(
                        item.rate || 0
                    ),
            })),

            status: "Submitted",

            customer:
                selectedCustomer || null,

            job:
                selectedJob || null,

            quotation:
                selectedJob?.quotation ||
                null,

            rfq:
                selectedJob?.rfq ||
                null,
        };
    };

    /*
     * ============================================================
     * SAVE
     * ============================================================
     */

    const handleSave = async (
        previewAfterSave = false
    ) => {
        const validationError =
            validateForm();

        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            setSaving(true);
            setError("");
            setSuccessMessage("");

            const firstItem = items[0];

            const payload = {
                job_id: Number(
                    formData.job_id
                ),

                invoice_number:
                    formData.invoice_number.trim(),

                invoice_date:
                    formData.invoice_date,

                due_date:
                    formData.due_date,

                amount: grandTotal,

                status: "Submitted",

                payment_status:
                    formData.payment_status,

                notes:
                    formData.notes || "",

                terms_conditions:
                    formData.terms_conditions ||
                    "",

                description:
                    firstItem?.description ||
                    "",

                quantity:
                    Number(
                        firstItem?.quantity ||
                        0
                    ),

                unit:
                    firstItem?.unit ||
                    "Job",

                rate:
                    Number(
                        firstItem?.rate ||
                        0
                    ),

                adjustment,
            };

            let response;

            if (isEditMode) {
                response = await api.put(
                    `/invoices/${editInvoiceId}`,
                    payload
                );
            } else {
                response = await api.post(
                    "/invoices",
                    payload
                );
            }

            const savedInvoice =
                response?.data?.invoice ||
                response?.data ||
                {};

            const savedInvoiceId =
                savedInvoice?.id ||
                editInvoiceId;

            if (previewAfterSave) {
                sessionStorage.setItem(
                    "rayaprocure_invoice_preview",
                    JSON.stringify({
                        ...buildPreviewData(),
                        id: savedInvoiceId,
                    })
                );

                navigate(
                    `/invoices/${savedInvoiceId}/preview`
                );

                return;
            }

            setSuccessMessage(
                isEditMode
                    ? "Invoice updated successfully."
                    : "Invoice created successfully."
            );

            showToast?.(
                isEditMode
                    ? "Invoice updated successfully."
                    : "Invoice created successfully.",
                "success"
            );

            setTimeout(() => {
                navigate("/invoices");
            }, 500);
        } catch (err) {
            console.error(
                "Failed to save invoice:",
                err
            );

            const message =
                err?.response?.data?.message ||
                err?.response?.data?.error ||
                "Failed to save invoice.";

            setError(message);

            showToast?.(
                message,
                "error"
            );
        } finally {
            setSaving(false);
        }
    };

    /*
     * ============================================================
     * PREVIEW
     * ============================================================
     */

    const handlePreview = () => {
        const validationError =
            validateForm();

        if (validationError) {
            setError(validationError);
            return;
        }

        try {
            sessionStorage.setItem(
                "rayaprocure_invoice_preview",
                JSON.stringify(
                    buildPreviewData()
                )
            );

            navigate(
                "/invoices/preview"
            );
        } catch (err) {
            console.error(
                "Failed to prepare invoice preview:",
                err
            );

            setError(
                "Unable to prepare invoice preview."
            );
        }
    };

    const handleCancel = () => {
        navigate("/invoices");
    };

    /*
     * ============================================================
     * LOADING
     * ============================================================
     */

    if (loading) {
        return (
            <MainLayout>
                <div className="quotations-page">

                    <PageHeader
                        eyebrow="INVOICES"
                        title={
                            isEditMode
                                ? "Edit Invoice"
                                : "Create Invoice"
                        }
                        description={
                            isEditMode
                                ? "Update the invoice details below."
                                : "Create a professional invoice for a completed job."
                        }
                    />

                    <div className="quotation-form-section">

                        <div className="quotation-section-heading">

                            <div>
                                <h3>
                                    Loading Invoice
                                </h3>

                                <p>
                                    Please wait while invoice details are being loaded.
                                </p>
                            </div>

                        </div>

                    </div>

                </div>
            </MainLayout>
        );
    }

    /*
     * ============================================================
     * PAGE
     * ============================================================
     */

    return (
        <MainLayout>

            <div className="quotations-page">

                <PageHeader
                    eyebrow="INVOICES"
                    title={
                        isEditMode
                            ? "Edit Invoice"
                            : "Create Invoice"
                    }
                    description={
                        isEditMode
                            ? "Update invoice information, services, payment details and terms."
                            : "Create a professional invoice for a completed job."
                    }
                />

                {error && (
                    <div
                        className="invoice-alert error"
                        role="alert"
                    >
                        {error}
                    </div>
                )}

                {successMessage && (
                    <div
                        className="invoice-alert success"
                        role="status"
                    >
                        {successMessage}
                    </div>
                )}

                <form
                    className="vf-form quotation-create-form"
                    onSubmit={(event) => {
                        event.preventDefault();
                        handleSave(false);
                    }}
                >

                    {/* =================================================
                        SECTION 1 — INVOICE INFORMATION
                    ================================================== */}

                    <div className="quotation-form-section">

                        <div className="quotation-section-heading">

                            <div>

                                <h3>
                                    Invoice Information
                                </h3>

                                <p>
                                    Select the job and enter the invoice details.
                                </p>

                            </div>

                        </div>

                        <div className="vf-form-row">

                            <div className="vf-form-group">

                                <label htmlFor="job_id">
                                    Job
                                    <span className="required">
                                        *
                                    </span>
                                </label>

                                <select
                                    id="job_id"
                                    name="job_id"
                                    value={
                                        formData.job_id
                                    }
                                    onChange={
                                        handleJobChange
                                    }
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
                                                {job.job_number
                                                    ? `${job.job_number} — `
                                                    : ""}

                                                {job.job_name ||
                                                    job.name ||
                                                    job.description ||
                                                    `Job #${job.id}`}
                                            </option>
                                        )
                                    )}

                                </select>

                            </div>

                            <div className="vf-form-group">

                                <label htmlFor="invoice_number">
                                    Invoice Number
                                    <span className="required">
                                        *
                                    </span>
                                </label>

                                <input
                                    id="invoice_number"
                                    name="invoice_number"
                                    type="text"
                                    value={
                                        formData.invoice_number
                                    }
                                    onChange={
                                        handleChange
                                    }
                                    placeholder="INV-00001"
                                />

                            </div>

                            <div className="vf-form-group">

                                <label htmlFor="invoice_date">
                                    Invoice Date
                                    <span className="required">
                                        *
                                    </span>
                                </label>

                                <input
                                    id="invoice_date"
                                    name="invoice_date"
                                    type="date"
                                    value={
                                        formData.invoice_date
                                    }
                                    onChange={
                                        handleChange
                                    }
                                />

                            </div>

                            <div className="vf-form-group">

                                <label htmlFor="due_date">
                                    Due Date
                                    <span className="required">
                                        *
                                    </span>
                                </label>

                                <input
                                    id="due_date"
                                    name="due_date"
                                    type="date"
                                    value={
                                        formData.due_date
                                    }
                                    onChange={
                                        handleChange
                                    }
                                />

                            </div>

                            <div className="vf-form-group">

                                <label htmlFor="payment_status">
                                    Payment Status
                                    <span className="required">
                                        *
                                    </span>
                                </label>

                                <select
                                    id="payment_status"
                                    name="payment_status"
                                    value={
                                        formData.payment_status
                                    }
                                    onChange={
                                        handleChange
                                    }
                                >

                                    <option value="Pending">
                                        Pending
                                    </option>

                                    <option value="Partially Paid">
                                        Partially Paid
                                    </option>

                                    <option value="Paid">
                                        Paid
                                    </option>

                                    <option value="Overdue">
                                        Overdue
                                    </option>

                                </select>

                            </div>

                        </div>

                    </div>

                    {/* =================================================
                        SECTION 2 — ITEMS / SERVICES
                    ================================================== */}

                    <div className="quotation-form-section">

                        <div className="quotation-section-heading">

                            <div>

                                <h3>
                                    Items / Services
                                </h3>

                                <p>
                                    Add the services or job items included in this invoice.
                                </p>

                            </div>

                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handleAddItem}
                                disabled={saving}
                            >
                                + Add Item
                            </Button>

                        </div>

                        <div className="quotation-items-wrapper">

                            {/* TABLE HEADER */}

                            <div className="quotation-items-header">

                                <div className="quotation-col-description">
                                    Description
                                </div>

                                <div className="quotation-col-quantity">
                                    Quantity
                                </div>

                                <div className="quotation-col-unit">
                                    Unit
                                </div>

                                <div className="quotation-col-rate">
                                    Rate
                                </div>

                                <div className="quotation-col-amount">
                                    Amount
                                </div>

                                <div className="quotation-col-action">
                                    Action
                                </div>

                            </div>

                            {/* TABLE ROWS */}

                            {items.map((item, index) => {

                                const itemAmount =
                                    itemTotals[index] || 0;

                                return (
                                    <div
                                        className="quotation-item-row"
                                        key={item.id}
                                    >

                                        {/* DESCRIPTION */}

                                        <div className="quotation-col-description">

                                            <div className="vf-form-group">

                                                <input
                                                    name={`description-${item.id}`}
                                                    type="text"
                                                    value={
                                                        item.description
                                                    }
                                                    onChange={(event) =>
                                                        handleItemChange(
                                                            item.id,
                                                            "description",
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder="Service / Job description"
                                                />

                                            </div>

                                        </div>

                                        {/* QUANTITY */}

                                        <div className="quotation-col-quantity">

                                            <div className="vf-form-group">

                                                <input
                                                    type="number"
                                                    min="0.01"
                                                    step="0.01"
                                                    value={
                                                        item.quantity
                                                    }
                                                    onChange={(event) =>
                                                        handleItemChange(
                                                            item.id,
                                                            "quantity",
                                                            event.target.value
                                                        )
                                                    }
                                                />

                                            </div>

                                        </div>

                                        {/* UNIT */}

                                        <div className="quotation-col-unit">

                                            <div className="vf-form-group">

                                                <input
                                                    type="text"
                                                    value={
                                                        item.unit
                                                    }
                                                    onChange={(event) =>
                                                        handleItemChange(
                                                            item.id,
                                                            "unit",
                                                            event.target.value
                                                        )
                                                    }
                                                    placeholder="Job"
                                                />

                                            </div>

                                        </div>

                                        {/* RATE */}

                                        <div className="quotation-col-rate">

                                            <div className="vf-form-group">

                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.01"
                                                    value={
                                                        item.rate
                                                    }
                                                    onChange={(event) =>
                                                        handleItemChange(
                                                            item.id,
                                                            "rate",
                                                            event.target.value
                                                        )
                                                    }
                                                />

                                            </div>

                                        </div>

                                        {/* AMOUNT */}

                                        <div className="quotation-col-amount">

                                            <strong>
                                                {formatCurrency(
                                                    itemAmount
                                                )}
                                            </strong>

                                        </div>

                                        {/* ACTION */}

                                        <div className="quotation-col-action">

                                            <button
                                                type="button"
                                                className="quotation-remove-item"
                                                onClick={() =>
                                                    handleRemoveItem(
                                                        item.id
                                                    )
                                                }
                                                disabled={
                                                    items.length === 1 ||
                                                    saving
                                                }
                                                title={
                                                    items.length === 1
                                                        ? "At least one item is required"
                                                        : "Remove item"
                                                }
                                                aria-label="Remove item"
                                            >
                                                ×
                                            </button>

                                        </div>

                                    </div>
                                );
                            })}

                        </div>

                    </div>

                    {/* =================================================
                        SECTION 3 — TOTALS
                    ================================================== */}

                    <div className="quotation-form-section">

                        <div className="quotation-totals-section">

                            <div className="quotation-total-row">

                                <span>
                                    Subtotal
                                </span>

                                <strong>
                                    {formatCurrency(
                                        subtotal
                                    )}
                                </strong>

                            </div>

                            <div className="quotation-total-row">

                                <span>
                                    Adjustment
                                </span>

                                <div className="invoice-adjustment-field">

                                    <span>
                                        ₹
                                    </span>

                                    <input
                                        name="adjustment"
                                        type="number"
                                        step="0.01"
                                        value={
                                            formData.adjustment
                                        }
                                        onChange={
                                            handleChange
                                        }
                                    />

                                </div>

                            </div>

                            <div className="quotation-total-row quotation-grand-total">

                                <span>
                                    Grand Total
                                </span>

                                <strong>
                                    {formatCurrency(
                                        grandTotal
                                    )}
                                </strong>

                            </div>

                        </div>

                    </div>

                    {/* =================================================
                        SECTION 4 — NOTES
                    ================================================== */}

                    <div className="quotation-form-section">

                        <div className="quotation-section-heading">

                            <div>

                                <h3>
                                    Notes
                                </h3>

                                <p>
                                    Add any additional information for the customer.
                                </p>

                            </div>

                        </div>

                        <div className="vf-form-group">

                            <textarea
                                name="notes"
                                value={
                                    formData.notes
                                }
                                onChange={
                                    handleChange
                                }
                                rows="4"
                                placeholder="Enter invoice notes..."
                            />

                        </div>

                    </div>

                    {/* =================================================
                        SECTION 5 — TERMS & CONDITIONS
                    ================================================== */}

                    <div className="quotation-form-section">

                        <div className="quotation-section-heading">

                            <div>

                                <h3>
                                    Terms &amp; Conditions
                                </h3>

                                <p>
                                    Define the payment and invoice terms for this document.
                                </p>

                            </div>

                        </div>

                        <div className="vf-form-group">

                            <textarea
                                name="terms_conditions"
                                value={
                                    formData.terms_conditions
                                }
                                onChange={
                                    handleChange
                                }
                                rows="5"
                                placeholder="Enter terms and conditions..."
                            />

                        </div>

                    </div>

                    {/* =================================================
                        ACTIONS
                    ================================================== */}

                    <div className="vf-form-actions">

                        <Button
                            type="button"
                            variant="secondary"
                            onClick={
                                handleCancel
                            }
                            disabled={saving}
                        >
                            Cancel
                        </Button>

                        <Button
                            type="button"
                            variant="secondary"
                            onClick={
                                handlePreview
                            }
                            disabled={saving}
                        >
                            Preview Invoice
                        </Button>

                        <Button
                            type="submit"
                            disabled={saving}
                        >
                            {saving
                                ? "Saving..."
                                : isEditMode
                                    ? "Update Invoice"
                                    : "Save Invoice"}
                        </Button>

                    </div>

                </form>

            </div>

        </MainLayout>
    );
};

export default CreateInvoice;