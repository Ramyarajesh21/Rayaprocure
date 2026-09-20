import { NavLink } from "react-router-dom";
import { useState } from "react";
import "./Sidebar.css";
import rayaprocureLogo from "../assets/icons/rayaprocure-logo.png";

function Sidebar() {

    const [showDeveloper, setShowDeveloper] = useState(false);

    const storedUser = localStorage.getItem("vendorflowUser");
    const user = storedUser ? JSON.parse(storedUser) : null;

    const role = user?.role;


    const menuItems = [
        {
            name: "Dashboard",
            path: "/dashboard",
            roles: ["Owner", "Accounts", "Operations"]
        },
        {
            name: "Customers",
            path: "/customers",
            roles: ["Owner", "Accounts", "Operations"]
        },
        {
            name: "RFQs",
            path: "/rfqs",
            roles: ["Owner", "Operations"]
        },
        {
            name: "Quotations",
            path: "/quotations",
            roles: ["Owner", "Operations"]
        },
        {
            name: "Jobs",
            path: "/jobs",
            roles: ["Owner"]
        },
        {
            name: "Invoices",
            path: "/invoices",
            roles: ["Owner", "Accounts"]
        },
        {
            name: "Payments",
            path: "/payments",
            roles: ["Owner", "Accounts"]
        },
        {
            name: "Reports",
            path: "/reports",
            roles: ["Owner", "Accounts"]
        },
        {
            name: "Settings",
            path: "/settings",
            roles: ["Owner"]
        },
        {
            name: "About",
            path: "/about",
            roles: ["Owner", "Accounts", "Operations"]
        }
    ];


    const visibleMenuItems = menuItems.filter((item) =>
        item.roles.includes(role)
    );


    return (
        <aside className="sidebar">


            {/* =========================================
                SIDEBAR HEADER
            ========================================= */}

            <div className="sidebar-logo">

                <img
    src={rayaprocureLogo}
    alt="RayaProcure Logo"
    className="sidebar-logo-image"
/>

                <div className="sidebar-logo-text">

                    {/* <h2>
                        RayaProcure
                    </h2>

                    <span>
                        Vendor Operations
                    </span> */}

                </div>

            </div>


            {/* =========================================
                NAVIGATION
            ========================================= */}

            <nav className="sidebar-nav">

                {visibleMenuItems.map((item) => (

                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            isActive
                                ? "nav-item active"
                                : "nav-item"
                        }
                    >

                        <span>
                            {item.name}
                        </span>

                    </NavLink>

                ))}

            </nav>


            {/* =========================================
                FOOTER
            ========================================= */}

            <div className="sidebar-footer">



                <div className="sidebar-footer-bottom">

                    <span>
                        © 2026 RayaProcure | All rights reserved v1.0 | Developed by{" "}
                        <button
                            type="button"
                            className="developer-link"
                            onClick={() =>
                                setShowDeveloper(!showDeveloper)
                            }
                        >
                            Ramya S
                        </button>
                    </span>

                </div>


                {/* =========================================
                    DEVELOPER CONTACT POPUP
                ========================================= */}

                {showDeveloper && (

                    <div className="developer-contact">

                        <div className="developer-contact-header">

                            <strong>
                                Ramya S
                            </strong>

                            <button
                                type="button"
                                className="developer-close"
                                onClick={() =>
                                    setShowDeveloper(false)
                                }
                                aria-label="Close"
                            >
                                ×
                            </button>

                        </div>


                        <a
                            href="mailto:ramyaselvaraj214@gmail.com"
                            className="developer-contact-item"
                        >
                            <span>✉</span>

                            <span>
                                ramyaselvaraj214@gmail.com
                            </span>
                        </a>


                        <a
                            href="tel:6380768574"
                            className="developer-contact-item"
                        >
                            <span>☎</span>

                            <span>
                                6380768574
                            </span>
                        </a>

                    </div>

                )}

            </div>

        </aside>
    );
}

export default Sidebar;