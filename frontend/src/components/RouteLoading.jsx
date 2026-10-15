function RouteLoading() {
    return (
        <div className="route-loading" role="status" aria-label="Loading page">
            <div className="route-loading-head">
                <span className="skeleton-line skeleton-short" />
                <span className="skeleton-line skeleton-title" />
                <span className="skeleton-line skeleton-copy" />
            </div>
            <div className="route-loading-cards">
                {[1, 2, 3, 4].map((item) => <span key={item} className="skeleton-card" />)}
            </div>
            <span className="skeleton-table" />
        </div>
    );
}

export default RouteLoading;
