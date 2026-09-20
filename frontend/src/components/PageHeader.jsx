function PageHeader({
    eyebrow,
    title,
    description,
    action,
}) {
    return (
        <div className="page-header">

            <div className="page-header-content">

                {eyebrow && (
                    <span className="page-header-eyebrow">
                        {eyebrow}
                    </span>
                )}

                <h1>{title}</h1>

                {description && (
                    <p>{description}</p>
                )}

            </div>

            {action && (
                <div className="page-header-action">
                    {action}
                </div>
            )}

        </div>
    );
}

export default PageHeader;