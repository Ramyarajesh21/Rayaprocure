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

import "./Customers.css";

function Customers() {

    const { showToast } = useToast();

    const [search, setSearch] = useState("");
    const [showModal, setShowModal] = useState(false);
    const [customers, setCustomers] = useState([]);

    const [editingCustomerId, setEditingCustomerId] = useState(null);

    const [formData, setFormData] = useState({
        company_name: "",
        contact_name: "",
        phone: "",
        email: "",
    });

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

        setFormData({
            ...formData,
            [name]: value,
        });
    };

    const openAddModal = () => {

        setEditingCustomerId(null);

        setFormData({
            company_name: "",
            contact_name: "",
            phone: "",
            email: "",
        });

        setShowModal(true);
    };

    const openEditModal = (customer) => {

        setEditingCustomerId(customer.id);

        setFormData({
            company_name: customer.company_name || "",
            contact_name: customer.contact_name || "",
            phone: customer.phone || "",
            email: customer.email || "",
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

            setFormData({
                company_name: "",
                contact_name: "",
                phone: "",
                email: "",
            });

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
        `${customer.company_name} ${customer.contact_name} ${customer.phone} ${customer.email}`
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
                                required
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
                                required
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