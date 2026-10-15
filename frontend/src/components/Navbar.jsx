import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { FiBell, FiChevronDown, FiLogOut } from "react-icons/fi";
import api from "../services/api";
import "./Navbar.css";

function Navbar() {
    const location = useLocation();
    const navigate = useNavigate();

    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [showNotifications, setShowNotifications] = useState(false);
    const [notifications, setNotifications] = useState([]);

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
        if (path.startsWith("/team")) return "Team & Access";
        if (path.startsWith("/company")) return "Company Profile";
        if (path.startsWith("/audit")) return "Audit History";
        if (path.startsWith("/catalog")) return "Products & Services";
        if (path.startsWith("/templates")) return "Document Templates";
        if (path.startsWith("/automation")) return "Email & Reminders";
        if (path.startsWith("/about")) return "About";

        return "Dashboard";
    };

    const handleLogout = async () => {
        try {
            await api.post("/api/auth/logout");
        } catch (error) {
            console.warn("Unable to end the server session:", error);
        }
        localStorage.removeItem("vendorflowUser");
        localStorage.removeItem("vendorflowRole");
        navigate("/login");
    };

    const loadNotifications = async () => {
        try { setNotifications((await api.get("/api/notifications")).data); } catch { /* notifications are non-blocking */ }
    };

    useEffect(() => { loadNotifications(); }, []);
    const unreadCount = notifications.filter((item) => !item.is_read).length;

    const openNotification = async (item) => {
        if (!item.is_read) await api.put(`/api/notifications/${item.id}/read`);
        setNotifications((items) => items.map((entry) => entry.id === item.id ? { ...entry, is_read: true } : entry));
        setShowNotifications(false);
        if (item.link_path) navigate(item.link_path);
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
                <div className="notification-wrapper">
                <button type="button" className="notification-button" aria-label="Notifications" onClick={() => { setShowNotifications(!showNotifications); loadNotifications(); }}>
                    <FiBell className="notification-icon" aria-hidden="true" />

                    {unreadCount > 0 && <span className="notification-dot"></span>}
                </button>
                {showNotifications && <div className="notification-menu"><strong>Notifications</strong>{notifications.length ? notifications.slice(0, 6).map((item) => <button key={item.id} className={item.is_read ? "notification-item" : "notification-item unread"} onClick={() => openNotification(item)}><b>{item.title}</b><span>{item.message}</span></button>) : <p>No notifications yet.</p>}</div>}
                </div>

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

                        <FiChevronDown className="profile-chevron" aria-hidden="true" />
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
                    <FiLogOut aria-hidden="true" />
                </button>

            </div>
        </header>
    );
}

export default Navbar;
