import {
    BrowserRouter,
    Routes,
    Route,
    Navigate,
} from "react-router-dom";
import { lazy, Suspense } from "react";

const Login = lazy(() => import("../pages/Login/Login"));
const Dashboard = lazy(() => import("../pages/Dashboard/Dashboard"));
const Customers = lazy(() => import("../pages/Customers/Customers"));
const RFQs = lazy(() => import("../pages/RFQs/RFQs"));
const Quotations = lazy(() => import("../pages/Quotations/Quotations"));
const CreateQuotation = lazy(() => import("../pages/Quotations/CreateQuotation"));
const QuotationPreview = lazy(() => import("../pages/Quotations/QuotationPreview"));
const Jobs = lazy(() => import("../pages/Jobs/Jobs"));
const Invoices = lazy(() => import("../pages/Invoices/Invoices"));
const CreateInvoice = lazy(() => import("../pages/Invoices/CreateInvoice"));
const InvoicePreview = lazy(() => import("../pages/Invoices/InvoicePreview"));
const Payments = lazy(() => import("../pages/Payments/Payments"));
const Reports = lazy(() => import("../pages/Reports/Reports"));
const Settings = lazy(() => import("../pages/Settings/Settings"));
const About = lazy(() => import("../pages/About/About"));
const Users = lazy(() => import("../pages/Users/Users"));
const Company = lazy(() => import("../pages/Company/Company"));
const Audit = lazy(() => import("../pages/Audit/Audit"));
const Catalog = lazy(() => import("../pages/Catalog/Catalog"));
const Templates = lazy(() => import("../pages/Templates/Templates"));
const EmailReminders = lazy(() => import("../pages/Automation/EmailReminders"));
const Portal = lazy(() => import("../pages/Portal/Portal"));

import ProtectedRoute from "./ProtectedRoute";
import RouteLoading from "../components/RouteLoading";


function AppRoutes() {

    return (
        <BrowserRouter>

            <Suspense fallback={<RouteLoading />}>
            <Routes>

                {/* =====================================================
                    LOGIN
                ===================================================== */}

                <Route
                    path="/login"
                    element={<Login />}
                />


                {/* =====================================================
                    DASHBOARD
                ===================================================== */}

                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute
                            roles={[
                                "Owner",
                                "Accounts",
                                "Operations"
                            ]}
                        >
                            <Dashboard />
                        </ProtectedRoute>
                    }
                />


                {/* =====================================================
                    CUSTOMERS
                ===================================================== */}

                <Route
                    path="/customers"
                    element={
                        <ProtectedRoute
                            roles={[
                                "Owner",
                                "Accounts",
                                "Operations"
                            ]}
                        >
                            <Customers />
                        </ProtectedRoute>
                    }
                />


                {/* =====================================================
                    RFQs
                ===================================================== */}

                <Route
                    path="/rfqs"
                    element={
                        <ProtectedRoute
                            roles={[
                                "Owner",
                                "Operations"
                            ]}
                        >
                            <RFQs />
                        </ProtectedRoute>
                    }
                />


                {/* =====================================================
                    QUOTATIONS LIST
                ===================================================== */}

                <Route
                    path="/quotations"
                    element={
                        <ProtectedRoute
                            roles={[
                                "Owner",
                                "Operations"
                            ]}
                        >
                            <Quotations />
                        </ProtectedRoute>
                    }
                />


                {/* =====================================================
                    CREATE QUOTATION
                ===================================================== */}

                <Route
                    path="/quotations/create"
                    element={
                        <ProtectedRoute
                            roles={[
                                "Owner",
                                "Operations"
                            ]}
                        >
                            <CreateQuotation />
                        </ProtectedRoute>
                    }
                />


                {/* =====================================================
                    QUOTATION PREVIEW
                ===================================================== */}

                <Route
                    path="/quotations/:quotationId/preview"
                    element={
                        <ProtectedRoute
                            roles={[
                                "Owner",
                                "Operations"
                            ]}
                        >
                            <QuotationPreview />
                        </ProtectedRoute>
                    }
                />


                {/* =====================================================
                    EDIT QUOTATION
                ===================================================== */}

                <Route
                    path="/quotations/:quotationId/edit"
                    element={
                        <ProtectedRoute
                            roles={[
                                "Owner",
                                "Operations"
                            ]}
                        >
                            <CreateQuotation />
                        </ProtectedRoute>
                    }
                />


                {/* =====================================================
                    JOBS
                ===================================================== */}

                <Route
                    path="/jobs"
                    element={
                        <ProtectedRoute
                            roles={[
                                "Owner"
                            ]}
                        >
                            <Jobs />
                        </ProtectedRoute>
                    }
                />


                {/* =====================================================
                    INVOICES LIST
                ===================================================== */}

                <Route
                    path="/invoices"
                    element={
                        <ProtectedRoute
                            roles={[
                                "Owner",
                                "Accounts"
                            ]}
                        >
                            <Invoices />
                        </ProtectedRoute>
                    }
                />


                {/* =====================================================
                    CREATE / EDIT INVOICE
                ===================================================== */}

                <Route
                    path="/invoices/create"
                    element={
                        <ProtectedRoute
                            roles={[
                                "Owner",
                                "Accounts"
                            ]}
                        >
                            <CreateInvoice />
                        </ProtectedRoute>
                    }
                />


                {/* =====================================================
                    INVOICE PREVIEW - SESSION STORAGE
                ===================================================== */}

                <Route
                    path="/invoices/preview"
                    element={
                        <ProtectedRoute
                            roles={[
                                "Owner",
                                "Accounts"
                            ]}
                        >
                            <InvoicePreview />
                        </ProtectedRoute>
                    }
                />


                {/* =====================================================
                    INVOICE PREVIEW - EXISTING INVOICE
                ===================================================== */}

                <Route
                    path="/invoices/:invoiceId/preview"
                    element={
                        <ProtectedRoute
                            roles={[
                                "Owner",
                                "Accounts"
                            ]}
                        >
                            <InvoicePreview />
                        </ProtectedRoute>
                    }
                />


                {/* =====================================================
                    PAYMENTS
                ===================================================== */}

                <Route
                    path="/payments"
                    element={
                        <ProtectedRoute
                            roles={[
                                "Owner",
                                "Accounts"
                            ]}
                        >
                            <Payments />
                        </ProtectedRoute>
                    }
                />


                {/* =====================================================
                    REPORTS
                ===================================================== */}

                <Route
                    path="/reports"
                    element={
                        <ProtectedRoute
                            roles={[
                                "Owner",
                                "Accounts"
                            ]}
                        >
                            <Reports />
                        </ProtectedRoute>
                    }
                />


                {/* =====================================================
                    SETTINGS
                ===================================================== */}

                <Route
                    path="/settings"
                    element={
                        <ProtectedRoute
                            roles={[
                                "Owner"
                            ]}
                        >
                            <Settings />
                        </ProtectedRoute>
                    }
                />

                <Route
                    path="/team"
                    element={
                        <ProtectedRoute roles={["Owner"]}>
                            <Users />
                        </ProtectedRoute>
                    }
                />
                <Route path="/company" element={<ProtectedRoute roles={["Owner"]}><Company /></ProtectedRoute>} />
                <Route path="/audit" element={<ProtectedRoute roles={["Owner"]}><Audit /></ProtectedRoute>} />
                <Route path="/catalog" element={<ProtectedRoute roles={["Owner", "Accounts", "Operations"]}><Catalog /></ProtectedRoute>} />
                <Route path="/templates" element={<ProtectedRoute roles={["Owner"]}><Templates /></ProtectedRoute>} />
                <Route path="/automation" element={<ProtectedRoute roles={["Owner"]}><EmailReminders /></ProtectedRoute>} />

                {/* Public customer link: no login */}
                <Route path="/p/:token" element={<Portal />} />


                {/* =====================================================
                    ABOUT
                ===================================================== */}

                <Route
                    path="/about"
                    element={
                        <ProtectedRoute
                            roles={[
                                "Owner",
                                "Accounts",
                                "Operations"
                            ]}
                        >
                            <About />
                        </ProtectedRoute>
                    }
                />


                {/* =====================================================
                    DEFAULT
                ===================================================== */}

                <Route
                    path="/"
                    element={
                        <Navigate
                            to="/login"
                            replace
                        />
                    }
                />

            </Routes>
            </Suspense>

        </BrowserRouter>
    );
}


export default AppRoutes;
