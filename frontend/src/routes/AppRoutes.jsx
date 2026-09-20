import {
    BrowserRouter,
    Routes,
    Route,
    Navigate,
} from "react-router-dom";

import Login from "../pages/Login/Login";
import Dashboard from "../pages/Dashboard/Dashboard";
import Customers from "../pages/Customers/Customers";
import RFQs from "../pages/RFQs/RFQs";
import Quotations from "../pages/Quotations/Quotations";
import Jobs from "../pages/Jobs/Jobs";
import Invoices from "../pages/Invoices/Invoices";
import Payments from "../pages/Payments/Payments";
import Reports from "../pages/Reports/Reports";
import Settings from "../pages/Settings/Settings";
import About from "../pages/About/About";

import ProtectedRoute from "./ProtectedRoute";


function AppRoutes() {

    return (
        <BrowserRouter>

            <Routes>

                {/* LOGIN */}

                <Route
                    path="/login"
                    element={<Login />}
                />


                {/* DASHBOARD */}

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


                {/* CUSTOMERS */}

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


                {/* RFQs */}

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


                {/* QUOTATIONS */}

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


                {/* JOBS */}

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


                {/* INVOICES */}

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


                {/* PAYMENTS */}

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


                {/* REPORTS */}

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


                {/* SETTINGS */}

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
                    {/* ABOUT */}

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

                {/* DEFAULT */}

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

        </BrowserRouter>
    );
}

export default AppRoutes;