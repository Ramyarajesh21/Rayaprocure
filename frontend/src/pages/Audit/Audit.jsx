import { useEffect, useState } from "react";
import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import DataTable from "../../components/DataTable";
import api from "../../services/api";
import "../Users/Users.css";

function Audit() {
    const [entries, setEntries] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get("/api/audit-logs")
            .then(({ data }) => setEntries(data))
            .catch(() => setEntries([]))
            .finally(() => setLoading(false));
    }, []);

    const columns = [
        { key: "created_at", label: "When", render: (row) => row.created_at ? new Date(row.created_at).toLocaleString() : "—" },
        { key: "user_name", label: "By", render: (row) => row.user_name || "System" },
        { key: "action", label: "Action" },
        { key: "entity_type", label: "Area" },
        { key: "entity_id", label: "Record", render: (row) => row.entity_id || "—" },
    ];

    return (
        <MainLayout>
            <div className="users-page">
                <PageHeader
                    eyebrow="GOVERNANCE"
                    title="Audit History"
                    description="The latest 200 successful workspace actions, retained for accountability."
                />
                <div className="users-insight">
                    <strong>Owner-only visibility</strong>
                    <span>Use this history to review changes to commercial, financial, and access records.</span>
                </div>
                <DataTable columns={columns} data={entries} emptyMessage={loading ? "Loading activity…" : "No recorded activity yet."} />
            </div>
        </MainLayout>
    );
}

export default Audit;
