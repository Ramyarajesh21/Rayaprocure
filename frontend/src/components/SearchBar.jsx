function SearchBar({
    value,
    onChange,
    placeholder = "Search...",
}) {
    return (
        <div className="vf-search">

            <span className="vf-search-icon">
                ⌕
            </span>

            <input
                type="text"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                placeholder={placeholder}
            />

        </div>
    );
}

export default SearchBar;