import { FiActivity, FiBarChart2, FiBriefcase, FiClipboard, FiFileText, FiGrid, FiHome, FiInbox, FiInfo, FiMail, FiPackage, FiSettings, FiShield, FiUsers } from "react-icons/fi";

export const NAV_ITEMS = [
    {
        name: "Dashboard",
        path: "/dashboard",
        icon: FiGrid,
        roles: ["Owner", "Accounts", "Operations"]
    },
    {
        name: "Customers",
        path: "/customers",
        icon: FiUsers,
        roles: ["Owner", "Accounts", "Operations"]
    },
    {
        name: "RFQs",
        path: "/rfqs",
        icon: FiInbox,
        roles: ["Owner", "Operations"]
    },
    {
        name: "Quotations",
        path: "/quotations",
        icon: FiFileText,
        roles: ["Owner", "Operations"]
    },
    {
        name: "Jobs",
        path: "/jobs",
        icon: FiBriefcase,
        roles: ["Owner"]
    },
    {
        name: "Invoices",
        path: "/invoices",
        icon: FiClipboard,
        roles: ["Owner", "Accounts"]
    },
    {
        name: "Payments",
        path: "/payments",
        icon: FiActivity,
        roles: ["Owner", "Accounts"]
    },
    {
        name: "Reports",
        path: "/reports",
        icon: FiBarChart2,
        roles: ["Owner", "Accounts"]
    },
    {
        name: "Settings",
        path: "/settings",
        icon: FiSettings,
        roles: ["Owner"]
    },
    {
        name: "Team & Access",
        path: "/team",
        icon: FiUsers,
        roles: ["Owner"]
    },
    { name: "Products & Services", path: "/catalog", icon: FiPackage, roles: ["Owner", "Accounts", "Operations"] },
    { name: "Company Profile", path: "/company", icon: FiHome, roles: ["Owner"] },
    { name: "Document Templates", path: "/templates", icon: FiFileText, roles: ["Owner"] },
    { name: "Email & Reminders", path: "/automation", icon: FiMail, roles: ["Owner"] },
    { name: "Audit History", path: "/audit", icon: FiShield, roles: ["Owner"] },
    {
        name: "About",
        path: "/about",
        icon: FiInfo,
        roles: ["Owner", "Accounts", "Operations"]
    }
];
