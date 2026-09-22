import "./Quotations.css";

import { useEffect, useState } from "react";
import {
    useNavigate,
    useParams,
} from "react-router-dom";

import api from "../../services/api";

import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import Button from "../../components/Button";

import { useToast } from "../../components/Toast/ToastContext";


const DEFAULT_NOTES = `Please review the quoted scope, quantities, and specifications carefully before confirmation.
This quotation is subject to the availability of required materials and resources.
Any applicable taxes or statutory charges will be handled as per the agreed commercial terms.`;


const DEFAULT_TERMS = `1. This quotation is valid for 10 days from the quotation date.
2. Work or supply will be carried out according to the agreed scope and specifications.
3. Any additional work or requirement outside the agreed scope will be charged separately.
4. Delivery or work schedules will be mutually agreed with the customer.
5. Payment terms will be as mutually agreed between Rayaprocure and the customer.
6. Any changes to the scope, quantity, or specifications may require a revised quotation.`;


function getTodayDate() {

    const today = new Date();

    const year = today.getFullYear();

    const month = String(
        today.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        today.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function addDays(dateString, days) {

    if (!dateString) {
        return "";
    }

    const date = new Date(
        `${dateString}T00:00:00`
    );

    date.setDate(
        date.getDate() + days
    );

    const year = date.getFullYear();

    const month = String(
        date.getMonth() + 1
    ).padStart(2, "0");

    const day = String(
        date.getDate()
    ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function CreateQuotation() {

    const navigate = useNavigate();

    const { quotationId } = useParams();

    const { showToast } = useToast();


    // =====================================================
    // EDIT MODE
    // =====================================================

    const isEditMode =
        Boolean(quotationId);


    const [rfqs, setRfqs] = useState([]);

    const [loadingRfqs, setLoadingRfqs] =
        useState(true);

    const [loadingQuotation, setLoadingQuotation] =
        useState(isEditMode);

    const [saving, setSaving] =
        useState(false);


    // =====================================================
    // FORM DATA
    // =====================================================

    const [formData, setFormData] = useState({

        rfq_id: "",

        quotation_date:
            getTodayDate(),

        valid_until:
            addDays(
                getTodayDate(),
                10
            ),

        adjustment: "0",

        notes:
            DEFAULT_NOTES,

        terms_conditions:
            DEFAULT_TERMS,

        status: "Draft",
    });


    // =====================================================
    // ITEMS
    // =====================================================

    const [items, setItems] = useState([
        {
            description: "",
            quantity: "",
            unit: "",
            rate: "",
        },
    ]);


    // =====================================================
    // FETCH RFQS
    // =====================================================

    useEffect(() => {

        fetchRfqs();

    }, []);


    const fetchRfqs = async () => {

        try {

            const response =
                await api.get("/rfqs");

            setRfqs(
                response.data || []
            );

        } catch (error) {

            console.error(
                "Failed to fetch RFQs:",
                error
            );

            showToast(
                "Unable to load RFQs. Please try again.",
                "error"
            );

        } finally {

            setLoadingRfqs(false);
        }
    };


    // =====================================================
    // FETCH EXISTING QUOTATION FOR EDIT
    // =====================================================

    useEffect(() => {

        if (quotationId) {

            fetchQuotation();

        }

    }, [quotationId]);


    const fetchQuotation = async () => {

        try {

            setLoadingQuotation(true);

            const response =
                await api.get(
                    `/quotations/${quotationId}`
                );

            const quotation =
                response.data;


            // -------------------------------------------------
            // FORM DATA
            // -------------------------------------------------

            setFormData({

                rfq_id:
                    String(
                        quotation.rfq_id || ""
                    ),

                quotation_date:
                    quotation.quotation_date ||
                    getTodayDate(),

                valid_until:
                    quotation.valid_until ||
                    addDays(
                        quotation.quotation_date ||
                        getTodayDate(),
                        10
                    ),

                adjustment:
                    String(
                        quotation.adjustment ?? 0
                    ),

                notes:
                    quotation.notes ||
                    DEFAULT_NOTES,

                terms_conditions:
                    quotation.terms_conditions ||
                    DEFAULT_TERMS,

                status:
                    quotation.status ||
                    "Draft",
            });


            // -------------------------------------------------
            // ITEMS
            // -------------------------------------------------

            if (
                quotation.items &&
                quotation.items.length > 0
            ) {

                setItems(

                    quotation.items.map(
                        (item) => ({

                            description:
                                item.description ||
                                "",

                            quantity:
                                String(
                                    item.quantity ??
                                    ""
                                ),

                            unit:
                                item.unit ||
                                "",

                            rate:
                                String(
                                    item.rate ??
                                    ""
                                ),
                        })
                    )

                );

            } else {

                setItems([
                    {
                        description: "",
                        quantity: "",
                        unit: "",
                        rate: "",
                    },
                ]);

            }

        } catch (error) {

            console.error(
                "Failed to load quotation:",
                error
            );

            showToast(
                error.response?.data?.message ||
                "Unable to load quotation.",
                "error"
            );

            navigate("/quotations");

        } finally {

            setLoadingQuotation(false);
        }
    };


    // =====================================================
    // FORM CHANGE
    // =====================================================

    const handleFormChange = (
        event
    ) => {

        const {
            name,
            value,
        } = event.target;


        if (
            name ===
            "quotation_date"
        ) {

            setFormData(
                (previous) => ({

                    ...previous,

                    quotation_date:
                        value,

                    valid_until:
                        addDays(
                            value,
                            10
                        ),
                })
            );

            return;
        }


        setFormData(
            (previous) => ({

                ...previous,

                [name]: value,
            })
        );
    };


    // =====================================================
    // ITEM CHANGE
    // =====================================================

    const handleItemChange = (
        index,
        field,
        value
    ) => {

        setItems(
            (previous) => {

                const updatedItems =
                    [...previous];

                updatedItems[index] = {

                    ...updatedItems[index],

                    [field]: value,
                };

                return updatedItems;
            }
        );
    };


    // =====================================================
    // ADD ITEM
    // =====================================================

    const addItem = () => {

        setItems(
            (previous) => [

                ...previous,

                {
                    description: "",
                    quantity: "",
                    unit: "",
                    rate: "",
                },
            ]
        );
    };


    // =====================================================
    // REMOVE ITEM
    // =====================================================

    const removeItem = (
        index
    ) => {

        if (
            items.length === 1
        ) {

            showToast(
                "At least one quotation item is required.",
                "error"
            );

            return;
        }


        setItems(
            (previous) =>
                previous.filter(
                    (_, itemIndex) =>
                        itemIndex !== index
                )
        );
    };


    // =====================================================
    // ITEM AMOUNT
    // =====================================================

    const getItemAmount = (
        item
    ) => {

        const quantity =
            Number(
                item.quantity
            );

        const rate =
            Number(
                item.rate
            );


        if (
            !Number.isFinite(
                quantity
            ) ||
            !Number.isFinite(
                rate
            )
        ) {

            return 0;
        }


        return quantity * rate;
    };


    // =====================================================
    // SUBTOTAL
    // =====================================================

    const subtotal =
        items.reduce(
            (
                total,
                item
            ) =>
                total +
                getItemAmount(
                    item
                ),
            0
        );


    // =====================================================
    // ADJUSTMENT
    // =====================================================

    const adjustment =
        Number(
            formData.adjustment
        ) || 0;


    // =====================================================
    // GRAND TOTAL
    // =====================================================

    const grandTotal =
        subtotal +
        adjustment;


    // =====================================================
    // FORMAT MONEY
    // =====================================================

    const formatMoney = (
        value
    ) => {

        return Number(
            value || 0
        ).toLocaleString(
            "en-IN",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }
        );
    };


    // =====================================================
    // SUBMIT
    // =====================================================

    const handleSubmit = async (
        event
    ) => {

        event.preventDefault();


        // -------------------------------------------------
        // RFQ VALIDATION
        // -------------------------------------------------

        if (
            !formData.rfq_id
        ) {

            showToast(
                "Please select an RFQ.",
                "error"
            );

            return;
        }


        // -------------------------------------------------
        // ITEM VALIDATION
        // -------------------------------------------------

        for (
            let index = 0;
            index < items.length;
            index++
        ) {

            const item =
                items[index];


            if (
                !item.description.trim()
            ) {

                showToast(
                    `Please enter a description for item ${index + 1}.`,
                    "error"
                );

                return;
            }


            if (
                !item.quantity ||
                Number(
                    item.quantity
                ) <= 0
            ) {

                showToast(
                    `Please enter a valid quantity for item ${index + 1}.`,
                    "error"
                );

                return;
            }


            if (
                !item.unit.trim()
            ) {

                showToast(
                    `Please enter a unit for item ${index + 1}.`,
                    "error"
                );

                return;
            }


            if (
                item.rate === "" ||
                Number(
                    item.rate
                ) < 0
            ) {

                showToast(
                    `Please enter a valid rate for item ${index + 1}.`,
                    "error"
                );

                return;
            }
        }


        // -------------------------------------------------
        // SAVE
        // -------------------------------------------------

        try {

            setSaving(true);


            const payload = {

                rfq_id:
                    Number(
                        formData.rfq_id
                    ),

                quotation_date:
                    formData.quotation_date,

                items:
                    items.map(
                        (item) => ({

                            description:
                                item.description.trim(),

                            quantity:
                                Number(
                                    item.quantity
                                ),

                            unit:
                                item.unit.trim(),

                            rate:
                                Number(
                                    item.rate
                                ),
                        })
                    ),

                adjustment:
                    Number(
                        formData.adjustment
                    ) || 0,

                notes:
                    formData.notes.trim(),

                terms_conditions:
                    formData.terms_conditions.trim(),

                status:
                    formData.status,
            };


            let response;


            // =================================================
            // CREATE
            // =================================================

            if (!isEditMode) {

                response =
                    await api.post(
                        "/quotations",
                        payload
                    );

            }

            // =================================================
            // EDIT / UPDATE
            // =================================================

            else {

                response =
                    await api.put(
                        `/quotations/${quotationId}`,
                        payload
                    );
            }


            // -------------------------------------------------
            // SUCCESS
            // -------------------------------------------------

            showToast(

                response.data?.message ||

                (
                    isEditMode
                        ? "Quotation updated successfully."
                        : "Quotation created successfully."
                ),

                "success"
            );


            navigate(
                "/quotations"
            );

        } catch (error) {

            console.error(
                "Quotation save error:",
                error
            );


            showToast(

                error.response?.data?.message ||

                (
                    isEditMode
                        ? "Unable to update quotation. Please try again."
                        : "Unable to create quotation. Please try again."
                ),

                "error"
            );

        } finally {

            setSaving(false);
        }
    };


    // =====================================================
    // CANCEL
    // =====================================================

    const handleCancel = () => {

        navigate(
            "/quotations"
        );
    };


    // =====================================================
    // LOADING EDIT QUOTATION
    // =====================================================

    if (
        isEditMode &&
        loadingQuotation
    ) {

        return (

            <MainLayout>

                <div className="quotations-page">

                    <PageHeader
                        eyebrow="QUOTATIONS"
                        title="Edit Quotation"
                        description="Loading quotation details..."
                    />

                    <div
                        style={{
                            padding: "40px",
                            textAlign: "center",
                        }}
                    >
                        Loading quotation...
                    </div>

                </div>

            </MainLayout>
        );
    }


    // =====================================================
    // RENDER
    // =====================================================

    return (

        <MainLayout>

            <div className="quotations-page">


                {/* =================================================
                    PAGE HEADER
                ================================================= */}

                <PageHeader

                    eyebrow="QUOTATIONS"

                    title={
                        isEditMode
                            ? "Edit Quotation"
                            : "Create Quotation"
                    }

                    description={
                        isEditMode
                            ? "Update the quotation details and items."
                            : "Prepare a professional quotation for your customer."
                    }

                />


                <form
                    className="vf-form quotation-create-form"
                    onSubmit={
                        handleSubmit
                    }
                >


                    {/* =================================================
                        QUOTATION INFORMATION
                    ================================================= */}

                    <div className="quotation-form-section">

                        <div className="quotation-section-heading">

                            <h3>
                                Quotation Information
                            </h3>

                            <p>
                                Select the RFQ and quotation date.
                            </p>

                        </div>


                        <div className="vf-form-row">


                            {/* CUSTOMER / RFQ */}

                            <div className="vf-form-group">

                                <label>
                                    Customer / RFQ
                                </label>


                                <select
                                    name="rfq_id"
                                    value={
                                        formData.rfq_id
                                    }
                                    onChange={
                                        handleFormChange
                                    }
                                    required
                                    disabled={
                                        loadingRfqs
                                    }
                                >

                                    <option value="">

                                        {loadingRfqs
                                            ? "Loading RFQs..."
                                            : "Select RFQ / Customer"}

                                    </option>


                                    {rfqs.map(
                                        (rfq) => (

                                            <option
                                                key={
                                                    rfq.id
                                                }
                                                value={
                                                    rfq.id
                                                }
                                            >

                                                {
                                                    rfq.rfq_number
                                                }

                                                {" — "}

                                                {
                                                    rfq.company_name
                                                }

                                            </option>

                                        )
                                    )}

                                </select>

                            </div>


                            {/* QUOTATION DATE */}

                            <div className="vf-form-group">

                                <label>
                                    Quotation Date
                                </label>


                                <input
                                    type="date"
                                    name="quotation_date"
                                    value={
                                        formData.quotation_date
                                    }
                                    onChange={
                                        handleFormChange
                                    }
                                    required
                                />

                            </div>


                            {/* VALID UNTIL */}

                            <div className="vf-form-group">

                                <label>
                                    Valid Until
                                </label>


                                <input
                                    type="date"
                                    name="valid_until"
                                    value={
                                        formData.valid_until
                                    }
                                    readOnly
                                />


                                <small>
                                    Automatically set to 10 days
                                    from the quotation date.
                                </small>

                            </div>


                            {/* STATUS */}

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
                                        handleFormChange
                                    }
                                    required
                                >

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

                        </div>

                    </div>


                    {/* =================================================
                        ITEMS
                    ================================================= */}

                    <div className="quotation-form-section">


                        <div className="quotation-section-heading">


                            <div>

                                <h3>
                                    Items / Services
                                </h3>

                                <p>
                                    Add the items or services included
                                    in this quotation.
                                </p>

                            </div>


                            <Button
                                type="button"
                                variant="secondary"
                                onClick={
                                    addItem
                                }
                            >
                                + Add Item
                            </Button>

                        </div>


                        <div className="quotation-items-wrapper">


                            {/* HEADER */}

                            <div className="quotation-items-header">

                                <span className="quotation-col-description">
                                    Description
                                </span>

                                <span className="quotation-col-quantity">
                                    Quantity
                                </span>

                                <span className="quotation-col-unit">
                                    Unit
                                </span>

                                <span className="quotation-col-rate">
                                    Rate
                                </span>

                                <span className="quotation-col-amount">
                                    Amount
                                </span>

                                <span className="quotation-col-action">
                                    Action
                                </span>

                            </div>


                            {/* ITEMS */}

                            {items.map(
                                (
                                    item,
                                    index
                                ) => (

                                    <div
                                        className="quotation-item-row"
                                        key={index}
                                    >


                                        {/* DESCRIPTION */}

                                        <div className="quotation-col-description">

                                            <input
                                                type="text"
                                                value={
                                                    item.description
                                                }
                                                onChange={
                                                    (event) =>
                                                        handleItemChange(
                                                            index,
                                                            "description",
                                                            event.target.value
                                                        )
                                                }
                                                placeholder="Enter item or service"
                                                required
                                            />

                                        </div>


                                        {/* QUANTITY */}

                                        <div className="quotation-col-quantity">

                                            <input
                                                type="number"
                                                value={
                                                    item.quantity
                                                }
                                                onChange={
                                                    (event) =>
                                                        handleItemChange(
                                                            index,
                                                            "quantity",
                                                            event.target.value
                                                        )
                                                }
                                                placeholder="0"
                                                min="0"
                                                step="0.01"
                                                required
                                            />

                                        </div>


                                        {/* UNIT */}

                                        <div className="quotation-col-unit">

                                            <input
                                                type="text"
                                                value={
                                                    item.unit
                                                }
                                                onChange={
                                                    (event) =>
                                                        handleItemChange(
                                                            index,
                                                            "unit",
                                                            event.target.value
                                                        )
                                                }
                                                placeholder="Nos"
                                                required
                                            />

                                        </div>


                                        {/* RATE */}

                                        <div className="quotation-col-rate">

                                            <input
                                                type="number"
                                                value={
                                                    item.rate
                                                }
                                                onChange={
                                                    (event) =>
                                                        handleItemChange(
                                                            index,
                                                            "rate",
                                                            event.target.value
                                                        )
                                                }
                                                placeholder="0.00"
                                                min="0"
                                                step="0.01"
                                                required
                                            />

                                        </div>


                                        {/* AMOUNT */}

                                        <div className="quotation-col-amount quotation-calculated-amount">

                                            ₹
                                            {formatMoney(
                                                getItemAmount(
                                                    item
                                                )
                                            )}

                                        </div>


                                        {/* REMOVE */}

                                        <div className="quotation-col-action">

                                            <button
                                                type="button"
                                                className="quotation-remove-item"
                                                onClick={() =>
                                                    removeItem(
                                                        index
                                                    )
                                                }
                                                title="Remove item"
                                            >
                                                ×
                                            </button>

                                        </div>

                                    </div>

                                )
                            )}

                        </div>

                    </div>


                    {/* =================================================
                        TOTALS
                    ================================================= */}

                    <div className="quotation-totals-section">


                        {/* SUBTOTAL */}

                        <div className="quotation-total-row">

                            <span>
                                Subtotal
                            </span>

                            <strong>
                                ₹
                                {formatMoney(
                                    subtotal
                                )}
                            </strong>

                        </div>


                        {/* ADJUSTMENT */}

                        <div className="quotation-total-row">


                            <div className="quotation-adjustment-label">

                                <span>
                                    Adjustment
                                </span>

                                <small>
                                    Enter positive or negative amount
                                </small>

                            </div>


                            <div className="quotation-adjustment-input">

                                <input
                                    type="number"
                                    name="adjustment"
                                    value={
                                        formData.adjustment
                                    }
                                    onChange={
                                        handleFormChange
                                    }
                                    step="0.01"
                                />

                            </div>


                        </div>


                        {/* GRAND TOTAL */}

                        <div className="quotation-total-row quotation-grand-total">

                            <span>
                                Grand Total
                            </span>

                            <strong>
                                ₹
                                {formatMoney(
                                    grandTotal
                                )}
                            </strong>

                        </div>

                    </div>


                    {/* =================================================
                        NOTES
                    ================================================= */}

                    <div className="quotation-form-section">


                        <div className="quotation-section-heading">

                            <h3>
                                Notes
                            </h3>

                            <p>
                                Default professional notes.
                                You can customize them if required.
                            </p>

                        </div>


                        <div className="vf-form-group">

                            <textarea
                                name="notes"
                                value={
                                    formData.notes
                                }
                                onChange={
                                    handleFormChange
                                }
                                rows="5"
                            />

                        </div>

                    </div>


                    {/* =================================================
                        TERMS
                    ================================================= */}

                    <div className="quotation-form-section">


                        <div className="quotation-section-heading">

                            <h3>
                                Terms &amp; Conditions
                            </h3>

                            <p>
                                Default quotation terms.
                                You can customize them if required.
                            </p>

                        </div>


                        <div className="vf-form-group">

                            <textarea
                                name="terms_conditions"
                                value={
                                    formData.terms_conditions
                                }
                                onChange={
                                    handleFormChange
                                }
                                rows="8"
                            />

                        </div>

                    </div>


                    {/* =================================================
                        ACTIONS
                    ================================================= */}

                    <div className="vf-form-actions">


                        <Button
                            variant="secondary"
                            type="button"
                            onClick={
                                handleCancel
                            }
                            disabled={
                                saving
                            }
                        >
                            Cancel
                        </Button>


                        <Button
                            type="submit"
                            disabled={
                                saving
                            }
                        >

                            {saving

                                ? (
                                    isEditMode
                                        ? "Updating..."
                                        : "Saving..."
                                )

                                : (
                                    isEditMode
                                        ? "Update Quotation"
                                        : "Save Quotation"
                                )}

                        </Button>

                    </div>

                </form>

            </div>

        </MainLayout>
    );
}


export default CreateQuotation;