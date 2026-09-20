function StatusBadge({ status }) {
    const statusClass = status
        ?.toLowerCase()
        .replace(/\s+/g, "-");

    return (
        <span className={`vf-status vf-status-${statusClass}`}>
            {status}
        </span>
    );
}

export default StatusBadge;