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
import { useStates } from "../../services/company";

import "./Customers.css";

const EMPTY_CUSTOMER = {
        company_name: "",
        contact_name: "",
        phone: "",
        email: "",
        gstin: "",
        pan: "",
        state_code: "",
        billing_address: "",
        shipping_address: "",
        payment_terms_days: "",
    };

function Customers() {

    const { showToast } = useToast();

    const [search, setSearch] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [customers, setCustomers] = useState([]);

    const [editingCustomerId, setEditingCustomerId] = useState(null);

    const states = useStates();

    const [formData, setFormData] = useState(EMPTY_CUSTOMER);

    useEffect(() => {
        fetchCustomers();
    }, []);

    const fetchCustomers = async () => {
        try {

            const response = await api.get("/customers");

            setCustomers(response.data);

        } catch (error) {

            console.error(
                "Error fetching customers:",
                error
            );

            showToast(
                "Unable to load customers. Please try again.",
                "error"
            );
        }
    };

    const handleChange = (event) => {

        const { name, value } = event.target;

        if (name === "gstin") {
            const gstin = value.toUpperCase().replace(/\s/g, "");
            const known = gstin.length >= 2 && states.some((state) => state.code === gstin.slice(0, 2));
            setFormData({
                ...formData,
                gstin,
                state_code: known ? gstin.slice(0, 2) : formData.state_code,
            });
            return;
        }

        setFormData({
            ...formData,
            [name]: value,
        });
    };

    const openAddModal = () => {

        setEditingCustomerId(null);

        setFormData(EMPTY_CUSTOMER);

        setShowModal(true);
    };

    const openEditModal = (customer) => {

        setEditingCustomerId(customer.id);

        setFormData({
            company_name: customer.company_name || "",
            contact_name: customer.contact_name || "",
            phone: customer.phone || "",
            email: customer.email || "",
            gstin: customer.gstin || "",
            pan: customer.pan || "",
            state_code: customer.state_code || "",
            billing_address: customer.billing_address || "",
            shipping_address: customer.shipping_address || "",
            payment_terms_days: customer.payment_terms_days ?? "",
        });

        setShowModal(true);
    };

    const handleSaveCustomer = async (event) => {

        event.preventDefault();

        try {

            if (editingCustomerId) {

                await api.put(
                    `/customers/${editingCustomerId}`,
                    formData
                );

                showToast(
                    "Customer updated successfully.",
                    "success"
                );

            } else {

                await api.post(
                    "/customers",
                    formData
                );

                showToast(
                    "Customer created successfully.",
                    "success"
                );
            }

            setFormData(EMPTY_CUSTOMER);

            setEditingCustomerId(null);
            setShowModal(false);

            fetchCustomers();

        } catch (error) {

            console.error(
                "Error saving customer:",
                error
            );

            showToast(
                error.response?.data?.message ||
                "Unable to save customer. Please try again.",
                "error"
            );
        }
    };


    const handleDeleteCustomer = async (id) => {

        const confirmed = window.confirm(
            "Are you sure you want to delete this customer?"
        );

        if (!confirmed) {
            return;
        }

        try {

            await api.delete(
                `/customers/${id}`
            );

            setCustomers((currentCustomers) =>
                currentCustomers.filter(
                    (customer) => customer.id !== id
                )
            );

            showToast(
                "Customer deleted successfully.",
                "success"
            );

        } catch (error) {

            console.error(
                "Error deleting customer:",
                error
            );

            showToast(
                error.response?.data?.message ||
                "Unable to delete customer. Please try again.",
                "error"
            );
        }
    };


    const filteredCustomers = customers.filter((customer) =>
        `${customer.company_name} ${customer.contact_name} ${customer.phone} ${customer.email} ${customer.gstin || ""}`
            .toLowerCase()
            .includes(search.toLowerCase())
    );

    const columns = [

        {
            key: "id",
            label: "Customer ID",
        },

        {
            key: "company_name",
            label: "Customer",
        },

        {
            key: "contact_name",
            label: "Contact Person",
        },

        {
            key: "phone",
            label: "Phone",
        },

        {
            key: "email",
            label: "Email",
        },

        {
            key: "gstin",
            label: "GSTIN",
            render: (row) => row.gstin || "—",
        },

        {
            key: "status",
            label: "Status",

            render: (row) => (
                <StatusBadge
                    status={row.status || "Active"}
                />
            ),
        },

        {
            key: "actions",
            label: "Actions",

            render: (row) => (

                <div className="vf-table-actions">

                    <button
                        type="button"
                        className="vf-action-button vf-action-edit"
                        onClick={() =>
                            openEditModal(row)
                        }
                    >
                        Edit
                    </button>

                    <button
                        type="button"
                        className="vf-action-button vf-action-delete"
                        onClick={() =>
                            handleDeleteCustomer(row.id)
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

            <div className="customers-page">

                <PageHeader
                    eyebrow="CUSTOMERS"
                    title="Customers"
                    description="Manage your customer companies and business relationships."
                    action={
                        <Button
                            variant="gold"
                            onClick={openAddModal}
                        >
                            + Add Customer
                        </Button>
                    }
                />

                <div className="customers-toolbar">

                    <SearchBar
                        value={search}
                        onChange={setSearch}
                        placeholder="Search customers..."
                    />

                    <div className="customers-summary">

                        <span>
                            {filteredCustomers.length}
                        </span>

                        customers

                    </div>

                </div>

                <DataTable
                    columns={columns}
                    data={filteredCustomers}
                    emptyMessage="No customers found."
                />

            </div>


            {showModal && (

                <Modal
                    title={
                        editingCustomerId
                            ? "Edit Customer"
                            : "Add Customer"
                    }
                    onClose={() =>
                        setShowModal(false)
                    }
                >

                    <form
                        className="customer-form"
                        onSubmit={handleSaveCustomer}
                    >

                        <div className="customer-form-field">

                            <label>
                                Customer Name
                            </label>

                            <input
                                type="text"
                                name="company_name"
                                value={formData.company_name}
                                onChange={handleChange}
                                placeholder="Enter customer name"
                                required
                            />

                        </div>


                        <div className="customer-form-field">

                            <label>
                                Contact Person
                            </label>

                            <input
                                type="text"
                                name="contact_name"
                                value={formData.contact_name}
                                onChange={handleChange}
                                placeholder="Enter contact person"
                            />

                        </div>


                        <div className="customer-form-field">

                            <label>
                                Phone
                            </label>

                            <input
                                type="text"
                                name="phone"
                                value={formData.phone}
                                onChange={handleChange}
                                placeholder="Enter phone number"
                            />

                        </div>


                        <div className="customer-form-field">

                            <label>
                                Email
                            </label>

                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                onChange={handleChange}
                                placeholder="Enter email"
                            />

                        </div>



                        <div className="customer-form-field">
                            <label>GSTIN</label>
                            <input
                                type="text"
                                name="gstin"
                                value={formData.gstin}
                                onChange={handleChange}
                                placeholder="15-character GSTIN (optional)"
                                maxLength={15}
                            />
                        </div>

                        <div className="customer-form-field">
                            <label>PAN</label>
                            <input
                                type="text"
                                name="pan"
                                value={formData.pan}
                                onChange={(event) =>
                                    setFormData({ ...formData, pan: event.target.value.toUpperCase() })
                                }
                                placeholder="ABCDE1234F"
                                maxLength={10}
                            />
                        </div>

                        <div className="customer-form-field">
                            <label>State (place of supply)</label>
                            <select
                                name="state_code"
                                value={formData.state_code}
                                onChange={handleChange}
                            >
                                <option value="">Select state</option>
                                {states.map((state) => (
                                    <option key={state.code} value={state.code}>
                                        {state.code} — {state.name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="customer-form-field">
                            <label>Billing address</label>
                            <textarea
                                name="billing_address"
                                value={formData.billing_address}
                                onChange={handleChange}
                                rows="3"
                            />
                        </div>

                        <div className="customer-form-field">
                            <label>Shipping address</label>
                            <textarea
                                name="shipping_address"
                                value={formData.shipping_address}
                                onChange={handleChange}
                                rows="2"
                                placeholder="Leave blank if same as billing"
                            />
                        </div>

                        <div className="customer-form-field">
                            <label>Payment terms (days)</label>
                            <input
                                type="number"
                                min="0"
                                max="365"
                                name="payment_terms_days"
                                value={formData.payment_terms_days}
                                onChange={handleChange}
                                placeholder="Uses your default if blank"
                            />
                        </div>

                        <div className="customer-form-actions">

                            <Button
                                variant="secondary"
                                type="button"
                                onClick={() =>
                                    setShowModal(false)
                                }
                            >
                                Cancel
                            </Button>

                            <Button
                                variant="gold"
                                type="submit"
                            >
                                {editingCustomerId
                                    ? "Update Customer"
                                    : "Save Customer"}
                            </Button>

                        </div>

                    </form>

                </Modal>
            )}

        </MainLayout>
    );
}

export default Customers;