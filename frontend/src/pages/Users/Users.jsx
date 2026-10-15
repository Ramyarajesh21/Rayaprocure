import { useEffect, useState } from "react";
import MainLayout from "../../layouts/MainLayout";
import PageHeader from "../../components/PageHeader";
import DataTable from "../../components/DataTable";
import Modal from "../../components/Modal";
import Button from "../../components/Button";
import { useToast } from "../../components/Toast/ToastContext";
import api from "../../services/api";
import "./Users.css";

const blankUser = { name: "", username: "", email: "", password: "", role: "Operations" };

function Users() {
    const [users, setUsers] = useState([]);
    const [form, setForm] = useState(blankUser);
    const [showModal, setShowModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const { showToast } = useToast();

    const loadUsers = async () => {
        try { setUsers((await api.get("/api/users")).data); }
        catch { showToast("Unable to load users.", "error"); }
    };

    useEffect(() => { loadUsers(); }, []);

    const submit = async (event) => {
        event.preventDefault();
        setSaving(true);
        try {
            await api.post("/api/users", form);
            setShowModal(false);
            setForm(blankUser);
            showToast("Team member created successfully.", "success");
            loadUsers();
        } catch (error) {
            showToast(error.response?.data?.message || "Unable to create user.", "error");
        } finally { setSaving(false); }
    };

    const toggleActive = async (user) => {
        try {
            await api.put(`/api/users/${user.id}`, {
                name: user.name, email: user.email || "", role: user.role,
                is_active: !user.is_active,
            });
            showToast(user.is_active ? "User deactivated." : "User activated.", "success");
            loadUsers();
        } catch (error) { showToast(error.response?.data?.message || "Unable to update user.", "error"); }
    };

    const columns = [
        { key: "name", label: "Team member" },
        { key: "username", label: "Username" },
        { key: "email", label: "Email", render: (row) => row.email || "—" },
        { key: "role", label: "Role" },
        { key: "is_active", label: "Status", render: (row) => <span className={`user-state ${row.is_active ? "active" : "inactive"}`}>{row.is_active ? "Active" : "Inactive"}</span> },
        { key: "actions", label: "Actions", render: (row) => <button className="user-action" onClick={() => toggleActive(row)}>{row.is_active ? "Deactivate" : "Activate"}</button> },
    ];

    return <MainLayout>
        <div className="users-page">
            <PageHeader eyebrow="WORKSPACE CONTROL" title="Team & Access" description="Manage who can access your workspace and what they can do." action={<Button onClick={() => setShowModal(true)}>Add team member</Button>} />
            <div className="users-insight"><strong>Role-based access</strong><span>Owner manages the workspace, Operations manages commercial workflow, and Accounts manages billing.</span></div>
            <DataTable columns={columns} data={users} emptyMessage="No team members found." />
            {showModal && <Modal title="Add team member" onClose={() => setShowModal(false)}><form className="users-form" onSubmit={submit}>
                <label>Full name<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
                <label>Username<input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
                <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
                <label>Temporary password<input required minLength="8" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
                <label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}><option>Operations</option><option>Accounts</option><option>Owner</option></select></label>
                <div className="users-form-actions"><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Creating…" : "Create user"}</Button></div>
            </form></Modal>}
        </div>
    </MainLayout>;
}

export default Users;
