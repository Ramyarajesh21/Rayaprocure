function StatCard({
    label,
    value,
    note,
    icon,
    trend,
}) {
    return (
        <div className="vf-stat-card">

            <div className="vf-stat-top">

                <span className="vf-stat-label">
                    {label}
                </span>

                {icon && (
                    <div className="vf-stat-icon">
                        {icon}
                    </div>
                )}

            </div>

            <strong className="vf-stat-value">
                {value}
            </strong>

            {(note || trend) && (
                <div className="vf-stat-bottom">

                    {trend && (
                        <span className="vf-stat-trend">
                            {trend}
                        </span>
                    )}

                    {note && (
                        <span className="vf-stat-note">
                            {note}
                        </span>
                    )}

                </div>
            )}

        </div>
    );
}

export default StatCard;