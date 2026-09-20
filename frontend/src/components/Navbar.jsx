import { useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import "./Navbar.css";

function Navbar() {
    const location = useLocation();
    const navigate = useNavigate();

    const [showProfileMenu, setShowProfileMenu] = useState(false);

    const storedUser = localStorage.getItem("vendorflowUser");
    const user = storedUser ? JSON.parse(storedUser) : null;

    const userName = user?.name || "User";
    const userInitial = userName.charAt(0).toUpperCase();

    const getPageName = () => {
        const path = location.pathname;

        if (path === "/dashboard" || path === "/") return "Dashboard";
        if (path.startsWith("/customers")) return "Customers";
        if (path.startsWith("/rfqs")) return "RFQs";
        if (path.startsWith("/quotations")) return "Quotations";
        if (path.startsWith("/jobs")) return "Jobs";
        if (path.startsWith("/invoices")) return "Invoices";
        if (path.startsWith("/payments")) return "Payments";
        if (path.startsWith("/reports")) return "Reports";
        if (path.startsWith("/settings")) return "Settings";
        if (path.startsWith("/about")) return "About";

        return "Dashboard";
    };

    const handleLogout = () => {
        localStorage.removeItem("vendorflowUser");
        localStorage.removeItem("vendorflowRole");
        navigate("/login");
    };

    return (
        <header className="navbar">

            {/* LEFT */}
            <div className="navbar-left">
                <div className="breadcrumb">
                    <span>Workspace</span>

                    <span className="breadcrumb-separator">
                        /
                    </span>

                    <strong>
                        {getPageName()}
                    </strong>
                </div>
            </div>

            {/* RIGHT */}
            <div className="navbar-right">

                {/* PERIOD */}
                <div className="navbar-period">
                    <select defaultValue="monthly">
                        <option value="monthly">
                            This Month
                        </option>

                        <option value="yearly">
                            This Year
                        </option>

                        <option value="financial">
                            Financial Year
                        </option>
                    </select>
                </div>

                {/* NOTIFICATION */}
                <button
                    type="button"
                    className="notification-button"
                    aria-label="Notifications"
                >
                    <span className="notification-icon">
                        ♧
                    </span>

                    <span className="notification-dot"></span>
                </button>

                {/* PROFILE */}
                <div className="profile-wrapper">

                    <button
                        type="button"
                        className="profile-trigger"
                        onClick={() =>
                            setShowProfileMenu(!showProfileMenu)
                        }
                    >
                        <div className="profile-avatar">
                            {userInitial}
                        </div>

                        <span className="profile-name">
                            {userName}
                        </span>

                        <span className="profile-chevron">
                            ▾
                        </span>
                    </button>

                    {/* PROFILE DROPDOWN */}
                    {showProfileMenu && (
                        <div className="profile-menu">

                            <div className="profile-menu-header">

                                <div className="profile-menu-avatar">
                                    {userInitial}
                                </div>

                                <div className="profile-menu-user">
                                    <strong>
                                        {userName}
                                    </strong>

                                    
                                </div>

                            </div>

                           

                        </div>
                    )}
                </div>

                {/* SEPARATE LOGOUT ICON */}
                <button
                    type="button"
                    className="navbar-logout-button"
                    onClick={handleLogout}
                    aria-label="Logout"
                    title="Logout"
                >
                    ↪
                </button>

            </div>
        </header>
    );
}

export default Navbar;