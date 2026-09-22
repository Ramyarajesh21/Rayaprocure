import { FaEye, FaEyeSlash } from "react-icons/fa";
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import "./Settings.css";


const DEFAULT_NOTIFICATIONS = {
    invoice: true,
    payment: true,
    quotation: true,
    rfq: true,
    job: true,
    general: false
};


const DEFAULT_USERS = [
    {
        id: 1,
        name: "Owner",
        role: "Owner",
        description: "Full system access",
        initial: "O",
        active: true
    },
    {
        id: 2,
        name: "Accounts",
        role: "Accounts",
        description: "Invoices and payments",
        initial: "A",
        active: true
    },
    {
        id: 3,
        name: "Operations",
        role: "Operations",
        description: "RFQ and quotation management",
        initial: "P",
        active: true
    }
];


/* =========================================================
   GET LOGGED IN USER
========================================================= */

function getLoggedInUser() {

    try {

        const storedUser =
            localStorage.getItem("vendorflowUser");

        if (!storedUser) {

            return {
                role: "Owner",
                name: "Owner"
            };
        }

        const parsedUser =
            JSON.parse(storedUser);

        /*
         * VendorFlow has three roles:
         * Owner / Accounts / Operations
         */

        return parsedUser;

    } catch {

        return {
            role: "Owner",
            name: "Owner"
        };
    }
}


/* =========================================================
   LOCAL STORAGE HELPER
========================================================= */

function getStorage(key, fallback) {

    try {

        const value =
            localStorage.getItem(key);

        return value
            ? JSON.parse(value)
            : fallback;

    } catch {

        return fallback;
    }
}


/* =========================================================
   ROLE HELPER
========================================================= */

function getNotificationRole(role) {

    if (
        role !== "Owner" &&
        role !== "Accounts" &&
        role !== "Operations"
    ) {
        return "Owner";
    }

    return role;
}


/* =========================================================
   SETTINGS COMPONENT
========================================================= */

function Settings() {

    const loggedInUser = useMemo(
        () => getLoggedInUser(),
        []
    );


    const role = getNotificationRole(
        loggedInUser?.role ||
        localStorage.getItem("vendorflowRole") ||
        "Owner"
    );


    const isOwner = role === "Owner";


    /* =====================================================
       ACTIVE SETTINGS MENU
    ===================================================== */

    const [activeSetting, setActiveSetting] =
        useState(
            isOwner
                ? "theme"
                : "notifications"
        );


    /* =====================================================
       GLOBAL THEME
    ===================================================== */

    const [theme, setTheme] =
        useState(() => {

            const savedTheme =
                localStorage.getItem("vendorflowTheme");

            /*
             * VendorFlow now supports only:
             *
             * light
             * dark
             *
             * Any old theme value such as olive/navy
             * automatically falls back to light.
             */

            if (
                savedTheme === "light" ||
                savedTheme === "dark"
            ) {
                return savedTheme;
            }

            return "light";
        });


    /* =====================================================
       NOTIFICATIONS
    ===================================================== */

    const notificationStorageKey =
        `vendorflowNotifications_${role}`;


    const [notifications, setNotifications] =
        useState(
            getStorage(
                notificationStorageKey,
                DEFAULT_NOTIFICATIONS
            )
        );


    const [notificationBackup, setNotificationBackup] =
        useState(notifications);


    /* =====================================================
       SECURITY
    ===================================================== */

    const [security, setSecurity] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
    });


    const [passwordMessage, setPasswordMessage] =
        useState("");


    const [passwordError, setPasswordError] =
        useState("");


    const [showPasswordForm, setShowPasswordForm] =
        useState(false);


    const [showPasswords, setShowPasswords] =
        useState({
            current: false,
            new: false,
            confirm: false
        });


    /* =====================================================
       USERS
    ===================================================== */

    const [users, setUsers] =
        useState(
            getStorage(
                "vendorflowUsers",
                DEFAULT_USERS
            )
        );


    const [managedUser, setManagedUser] =
        useState(null);


    /* =====================================================
       APPLY THEME GLOBALLY
    ===================================================== */

    useEffect(() => {

        /*
         * Apply selected theme to the root HTML element.
         *
         * Example:
         *
         * <html data-theme="dark">
         *
         * CSS variables from variables.css
         * control the entire application.
         */

        document.documentElement.setAttribute(
            "data-theme",
            theme
        );


        /*
         * Save selected theme for future sessions.
         */

        localStorage.setItem(
            "vendorflowTheme",
            theme
        );

    }, [theme]);


    /* =====================================================
       AVAILABLE SETTINGS BY ROLE
    ===================================================== */

    const menuItems = [

        {
            id: "theme",
            label: "Theme",
            icon: "🎨",
            visible: isOwner
        },

        {
            id: "notifications",
            label: "Notifications",
            icon: "🔔",
            visible: true
        },

        {
            id: "security",
            label: "Security",
            icon: "🔒",
            visible: true
        },

        {
            id: "users",
            label: "Users & Access",
            icon: "👥",
            visible: isOwner
        }

    ].filter(item => item.visible);


    /* =====================================================
       THEME CHANGE
    ===================================================== */

    const handleThemeChange = (selectedTheme) => {

        if (!isOwner) {
            return;
        }


        /*
         * Only Light and Dark are supported.
         */

        if (
            selectedTheme !== "light" &&
            selectedTheme !== "dark"
        ) {
            return;
        }


        setTheme(selectedTheme);

    };


    /* =====================================================
       NOTIFICATIONS
    ===================================================== */

    const handleNotificationChange = (
        notification,
        value
    ) => {

        const updated = {
            ...notifications,
            [notification]: value
        };


        setNotifications(updated);


        localStorage.setItem(
            notificationStorageKey,
            JSON.stringify(updated)
        );

    };


    const handleNotificationSave = () => {

        localStorage.setItem(
            notificationStorageKey,
            JSON.stringify(notifications)
        );


        setNotificationBackup(notifications);

    };


    const handleNotificationReset = () => {

        const reset =
            getStorage(
                notificationStorageKey,
                DEFAULT_NOTIFICATIONS
            );


        setNotifications(reset);

        setNotificationBackup(reset);


        localStorage.setItem(
            notificationStorageKey,
            JSON.stringify(reset)
        );

    };


    /* =====================================================
       SECURITY — CHANGE PASSWORD
    ===================================================== */

    const handlePasswordChange = async () => {

        setPasswordMessage("");

        setPasswordError("");


        const {
            currentPassword,
            newPassword,
            confirmPassword
        } = security;


        if (
            !currentPassword ||
            !newPassword ||
            !confirmPassword
        ) {

            setPasswordError(
                "Please fill all password fields."
            );

            return;
        }


        if (newPassword.length < 6) {

            setPasswordError(
                "New password must contain at least 6 characters."
            );

            return;
        }


        if (newPassword !== confirmPassword) {

            setPasswordError(
                "New password and confirm password do not match."
            );

            return;
        }


        try {

            const storedUser =
                localStorage.getItem("vendorflowUser");


            const user =
                storedUser
                    ? JSON.parse(storedUser)
                    : null;


            const username =
                user?.username;


            const userRole =
                getNotificationRole(
                    user?.role || role
                );


            if (!username) {

                setPasswordError(
                    "User information not found. Please login again."
                );

                return;
            }


            const response =
                await axios.post(
                    "http://127.0.0.1:5000/api/auth/change-password",
                    {
                        username: username,
                        role: userRole,
                        currentPassword: currentPassword,
                        newPassword: newPassword
                    }
                );


            setPasswordMessage(
                response.data?.message ||
                "Password changed successfully."
            );


            setSecurity({
                currentPassword: "",
                newPassword: "",
                confirmPassword: ""
            });


            setShowPasswords({
                current: false,
                new: false,
                confirm: false
            });

        } catch (error) {

            console.log(
                "CHANGE PASSWORD ERROR:",
                error
            );


            setPasswordError(
                error.response?.data?.message ||
                error.message ||
                "Unable to change password."
            );

        }

    };


    /* =====================================================
       PASSWORD VISIBILITY
    ===================================================== */

    const togglePasswordVisibility = (field) => {

        setShowPasswords(prev => ({
            ...prev,
            [field]: !prev[field]
        }));

    };


    /* =====================================================
       USERS
    ===================================================== */

    const handleUserToggle = (userId) => {

        if (!isOwner) {
            return;
        }


        const updatedUsers =
            users.map(user => {

                if (user.id === userId) {

                    return {
                        ...user,
                        active: !user.active
                    };

                }

                return user;

            });


        setUsers(updatedUsers);


        localStorage.setItem(
            "vendorflowUsers",
            JSON.stringify(updatedUsers)
        );

    };


    const handleManageUser = (user) => {

        if (!isOwner) {
            return;
        }


        setManagedUser(
            managedUser?.id === user.id
                ? null
                : user
        );

    };


    /* =====================================================
       ACTIVE MENU SAFETY
    ===================================================== */

    useEffect(() => {

        const allowed =
            menuItems.some(
                item => item.id === activeSetting
            );


        if (!allowed) {

            setActiveSetting(
                isOwner
                    ? "theme"
                    : "notifications"
            );

        }

    }, [
        role,
        isOwner,
        activeSetting
    ]);


    /* =====================================================
       RENDER
    ===================================================== */

    return (

        <MainLayout>

            <div className="settings-page">

                <PageHeader
                    title="Settings"
                    subtitle="Manage your VendorFlow workspace and preferences."
                />


                <div className="settings-layout">


                    {/* =====================================================
                        SETTINGS SIDEBAR
                    ===================================================== */}

                    <aside className="settings-sidebar">

                        <div className="settings-sidebar-title">
                            Settings
                        </div>


                        <div className="settings-menu">

                            {menuItems.map(item => (

                                <button
                                    key={item.id}
                                    type="button"
                                    className={
                                        activeSetting === item.id
                                            ? "settings-menu-item active"
                                            : "settings-menu-item"
                                    }
                                    onClick={() =>
                                        setActiveSetting(item.id)
                                    }
                                >

                                    <span className="settings-menu-icon">
                                        {item.icon}
                                    </span>


                                    <span>
                                        {item.label}
                                    </span>

                                </button>

                            ))}

                        </div>

                    </aside>


                    {/* =====================================================
                        SETTINGS CONTENT
                    ===================================================== */}

                    <main className="settings-content">


                        {/* =====================================================
                            THEME
                        ===================================================== */}

                        {activeSetting === "theme" && isOwner && (

                            <section className="settings-panel">

                                <div className="settings-panel-header">

                                    <div>

                                        <div className="settings-eyebrow">
                                            APPEARANCE
                                        </div>


                                        <h2>
                                            Theme
                                        </h2>


                                        <p>
                                            Choose how VendorFlow appears across the application.
                                        </p>

                                    </div>

                                </div>


                                <div className="theme-options">


                                    {/* =================================================
                                        LIGHT THEME
                                    ================================================= */}

                                    <button
                                        type="button"
                                        className={
                                            theme === "light"
                                                ? "theme-option selected"
                                                : "theme-option"
                                        }
                                        onClick={() =>
                                            handleThemeChange("light")
                                        }
                                    >

                                        <div className="theme-preview theme-preview-light">

                                            <div className="theme-preview-sidebar" />


                                            <div className="theme-preview-content">

                                                <div />
                                                <div />
                                                <div />

                                            </div>

                                        </div>


                                        <div className="theme-option-info">

                                            <strong>
                                                Modern Obsidian & Cobalt
                                            </strong>


                                            <span>
                                                Clean light interface with cobalt accents
                                            </span>

                                        </div>


                                        <span className="theme-radio">
                                            {theme === "light" ? "✓" : ""}
                                        </span>

                                    </button>


                                    {/* =================================================
                                        DARK THEME
                                    ================================================= */}

                                    <button
                                        type="button"
                                        className={
                                            theme === "dark"
                                                ? "theme-option selected"
                                                : "theme-option"
                                        }
                                        onClick={() =>
                                            handleThemeChange("dark")
                                        }
                                    >

                                        <div className="theme-preview theme-preview-dark">

                                            <div className="theme-preview-sidebar" />


                                            <div className="theme-preview-content">

                                                <div />
                                                <div />
                                                <div />

                                            </div>

                                        </div>


                                        <div className="theme-option-info">

                                            <strong>
                                                Midnight Slate & Champagne Gold
                                            </strong>


                                            <span>
                                                Premium dark interface with gold accents
                                            </span>

                                        </div>


                                        <span className="theme-radio">
                                            {theme === "dark" ? "✓" : ""}
                                        </span>

                                    </button>


                                </div>

                            </section>

                        )}


                        {/* =====================================================
                            NOTIFICATIONS
                        ===================================================== */}

                        {activeSetting === "notifications" && (

                            <section className="settings-panel">

                                <div className="settings-panel-header">

                                    <div>

                                        <div className="settings-eyebrow">
                                            PREFERENCES
                                        </div>


                                        <h2>
                                            Notifications
                                        </h2>


                                        <p>
                                            Manage notifications for your {role} account.
                                        </p>

                                    </div>

                                </div>


                                <div className="notification-list">

                                    {[
                                        [
                                            "invoice",
                                            "Invoice Notifications",
                                            "Receive updates about invoices."
                                        ],
                                        [
                                            "payment",
                                            "Payment Notifications",
                                            "Receive payment and outstanding updates."
                                        ],
                                        [
                                            "quotation",
                                            "Quotation Notifications",
                                            "Receive quotation related updates."
                                        ],
                                        [
                                            "rfq",
                                            "RFQ Notifications",
                                            "Receive RFQ related updates."
                                        ],
                                        [
                                            "job",
                                            "Job Notifications",
                                            "Receive job and work updates."
                                        ],
                                        [
                                            "general",
                                            "General Notifications",
                                            "Receive general VendorFlow notifications."
                                        ]
                                    ].map(
                                        ([
                                            key,
                                            title,
                                            description
                                        ]) => (

                                            <div
                                                className="notification-item"
                                                key={key}
                                            >

                                                <div>

                                                    <strong>
                                                        {title}
                                                    </strong>


                                                    <span>
                                                        {description}
                                                    </span>

                                                </div>


                                                <button
                                                    type="button"
                                                    className={
                                                        notifications[key]
                                                            ? "notification-toggle active"
                                                            : "notification-toggle"
                                                    }
                                                    onClick={() =>
                                                        handleNotificationChange(
                                                            key,
                                                            !notifications[key]
                                                        )
                                                    }
                                                >

                                                    <span />

                                                </button>

                                            </div>

                                        )
                                    )}

                                </div>


                                <div className="settings-actions">

                                    <button
                                        className="settings-secondary-button"
                                        onClick={handleNotificationReset}
                                    >
                                        Reset
                                    </button>


                                    <button
                                        className="settings-primary-button"
                                        onClick={handleNotificationSave}
                                    >
                                        Save Preferences
                                    </button>

                                </div>

                            </section>

                        )}


                        {/* =====================================================
                            SECURITY
                        ===================================================== */}

                        {activeSetting === "security" && (

                            <section className="settings-panel">

                                <div className="settings-panel-header">

                                    <div>

                                        <div className="settings-eyebrow">
                                            ACCOUNT SECURITY
                                        </div>


                                        <h2>
                                            Security
                                        </h2>


                                        <p>
                                            Manage security for your {role} account.
                                        </p>

                                    </div>

                                </div>


                                <div className="security-list">

                                    <div className="security-item">

                                        <div>

                                            <strong>
                                                Change Password
                                            </strong>


                                            <span>
                                                Update the password for your own account.
                                            </span>

                                        </div>


                                        <button
                                            className="settings-secondary-button"
                                            onClick={() => {

                                                setShowPasswordForm(
                                                    !showPasswordForm
                                                );

                                                setPasswordMessage("");
                                                setPasswordError("");

                                            }}
                                        >

                                            {showPasswordForm
                                                ? "Cancel"
                                                : "Change Password"}

                                        </button>

                                    </div>

                                </div>


                                {showPasswordForm && (

                                    <div className="password-form">


                                        {/* CURRENT PASSWORD */}

                                        <div className="settings-field">

                                            <label>
                                                Current Password
                                            </label>


                                            <div className="password-input-wrapper">

                                                <input
                                                    type={
                                                        showPasswords.current
                                                            ? "text"
                                                            : "password"
                                                    }
                                                    value={
                                                        security.currentPassword
                                                    }
                                                    onChange={e =>
                                                        setSecurity({
                                                            ...security,
                                                            currentPassword:
                                                                e.target.value
                                                        })
                                                    }
                                                />


                                                <button
                                                    type="button"
                                                    className="password-eye-button"
                                                    onClick={() =>
                                                        togglePasswordVisibility(
                                                            "current"
                                                        )
                                                    }
                                                    aria-label={
                                                        showPasswords.current
                                                            ? "Hide current password"
                                                            : "Show current password"
                                                    }
                                                >

                                                    {showPasswords.current
                                                        ? <FaEyeSlash />
                                                        : <FaEye />}

                                                </button>

                                            </div>

                                        </div>


                                        {/* NEW PASSWORD */}

                                        <div className="settings-field">

                                            <label>
                                                New Password
                                            </label>


                                            <div className="password-input-wrapper">

                                                <input
                                                    type={
                                                        showPasswords.new
                                                            ? "text"
                                                            : "password"
                                                    }
                                                    value={
                                                        security.newPassword
                                                    }
                                                    onChange={e =>
                                                        setSecurity({
                                                            ...security,
                                                            newPassword:
                                                                e.target.value
                                                        })
                                                    }
                                                />


                                                <button
                                                    type="button"
                                                    className="password-eye-button"
                                                    onClick={() =>
                                                        togglePasswordVisibility(
                                                            "new"
                                                        )
                                                    }
                                                    aria-label={
                                                        showPasswords.new
                                                            ? "Hide new password"
                                                            : "Show new password"
                                                    }
                                                >

                                                    {showPasswords.new
                                                        ? <FaEyeSlash />
                                                        : <FaEye />}

                                                </button>

                                            </div>

                                        </div>


                                        {/* CONFIRM PASSWORD */}

                                        <div className="settings-field">

                                            <label>
                                                Confirm New Password
                                            </label>


                                            <div className="password-input-wrapper">

                                                <input
                                                    type={
                                                        showPasswords.confirm
                                                            ? "text"
                                                            : "password"
                                                    }
                                                    value={
                                                        security.confirmPassword
                                                    }
                                                    onChange={e =>
                                                        setSecurity({
                                                            ...security,
                                                            confirmPassword:
                                                                e.target.value
                                                        })
                                                    }
                                                />


                                                <button
                                                    type="button"
                                                    className="password-eye-button"
                                                    onClick={() =>
                                                        togglePasswordVisibility(
                                                            "confirm"
                                                        )
                                                    }
                                                    aria-label={
                                                        showPasswords.confirm
                                                            ? "Hide confirm password"
                                                            : "Show confirm password"
                                                    }
                                                >

                                                    {showPasswords.confirm
                                                        ? <FaEyeSlash />
                                                        : <FaEye />}

                                                </button>

                                            </div>

                                        </div>


                                        {passwordError && (

                                            <div className="settings-error">
                                                {passwordError}
                                            </div>

                                        )}


                                        {passwordMessage && (

                                            <div className="settings-success">
                                                {passwordMessage}
                                            </div>

                                        )}


                                        <div className="settings-actions">

                                            <button
                                                className="settings-primary-button"
                                                onClick={handlePasswordChange}
                                            >
                                                Update Password
                                            </button>

                                        </div>

                                    </div>

                                )}

                            </section>

                        )}


                        {/* =====================================================
                            USERS & ACCESS
                        ===================================================== */}

                        {activeSetting === "users" && isOwner && (

                            <section className="settings-panel">

                                <div className="settings-panel-header">

                                    <div>

                                        <div className="settings-eyebrow">
                                            ACCESS CONTROL
                                        </div>


                                        <h2>
                                            Users & Access
                                        </h2>


                                        <p>
                                            Manage the three VendorFlow user accounts.
                                        </p>

                                    </div>

                                </div>


                                <div className="users-list">

                                    {users.map(user => (

                                        <div
                                            className="user-item"
                                            key={user.id}
                                        >

                                            <div className="user-avatar">
                                                {user.initial}
                                            </div>


                                            <div className="user-info">

                                                <strong>
                                                    {user.name}
                                                </strong>


                                                <span>
                                                    {user.description}
                                                </span>

                                            </div>


                                            <div className="user-role">
                                                {user.role}
                                            </div>


                                            <div
                                                className={
                                                    user.active
                                                        ? "user-status active"
                                                        : "user-status inactive"
                                                }
                                            >

                                                {user.active
                                                    ? "Active"
                                                    : "Inactive"}

                                            </div>


                                            <button
                                                className="user-access-button"
                                                onClick={() =>
                                                    handleUserToggle(
                                                        user.id
                                                    )
                                                }
                                            >

                                                {user.active
                                                    ? "Disable"
                                                    : "Enable"}

                                            </button>


                                            <button
                                                className="user-manage-button"
                                                onClick={() =>
                                                    handleManageUser(user)
                                                }
                                            >
                                                Manage
                                            </button>


                                            {managedUser?.id === user.id && (

                                                <div className="user-management-panel">

                                                    <strong>
                                                        {user.name} Account
                                                    </strong>


                                                    <p>
                                                        Role: {user.role}
                                                    </p>


                                                    <p>
                                                        Access:
                                                        {" "}
                                                        {user.active
                                                            ? "Enabled"
                                                            : "Disabled"}
                                                    </p>


                                                    <button
                                                        className="settings-primary-button"
                                                        onClick={() =>
                                                            handleUserToggle(
                                                                user.id
                                                            )
                                                        }
                                                    >

                                                        {user.active
                                                            ? "Disable User"
                                                            : "Enable User"}

                                                    </button>

                                                </div>

                                            )}

                                        </div>

                                    ))}

                                </div>


                                <div className="settings-note">

                                    Only the Owner can manage user access.
                                    Accounts and Operations cannot access this section.

                                </div>

                            </section>

                        )}

                    </main>

                </div>

            </div>

        </MainLayout>
    );
}


export default Settings;