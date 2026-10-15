import { useEffect, useRef, useState } from "react";
import api from "../services/api";
import Button from "./Button";
import "./AttachmentsPanel.css";

function formatSize(bytes) {
    if (!bytes) return "0 KB";
    return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentsPanel({ entityType, entityId }) {
    const [attachments, setAttachments] = useState([]);
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef(null);

    const loadAttachments = async () => {
        try { setAttachments((await api.get(`/api/attachments/${entityType}/${entityId}`)).data); }
        catch { setAttachments([]); }
    };

    useEffect(() => { if (entityId) loadAttachments(); }, [entityType, entityId]);

    const upload = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { window.alert("Choose a file smaller than 10 MB."); event.target.value = ""; return; }
        const form = new FormData(); form.append("file", file);
        try {
            setUploading(true);
            await api.post(`/api/attachments/${entityType}/${entityId}`, form);
            event.target.value = "";
            await loadAttachments();
        } catch (error) { window.alert(error.response?.data?.message || "Unable to upload the attachment."); }
        finally { setUploading(false); }
    };

    const download = async (attachment) => {
        try {
            const response = await api.get(`/api/attachments/${attachment.id}/download`, { responseType: "blob" });
            const url = URL.createObjectURL(response.data);
            const link = document.createElement("a"); link.href = url; link.download = attachment.original_name; link.click(); URL.revokeObjectURL(url);
        } catch { window.alert("Unable to download the attachment."); }
    };

    return <section className="attachments-panel">
        <div><span className="attachments-eyebrow">RECORD FILES</span><h3>Supporting documents</h3><p>Attach up to 10 MB per file for this record.</p></div>
        <input ref={inputRef} className="attachments-input" type="file" onChange={upload} />
        <Button variant="secondary" onClick={() => inputRef.current?.click()} disabled={uploading}>{uploading ? "Uploading…" : "Upload file"}</Button>
        <div className="attachments-list">
            {attachments.length ? attachments.map((attachment) => <button type="button" key={attachment.id} className="attachment-item" onClick={() => download(attachment)}><span><strong>{attachment.original_name}</strong><small>{formatSize(attachment.size_bytes)}</small></span><em>Download</em></button>) : <span className="attachments-empty">No files attached yet.</span>}
        </div>
    </section>;
}

export default AttachmentsPanel;
