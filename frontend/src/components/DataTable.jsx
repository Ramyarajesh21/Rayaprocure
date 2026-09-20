function DataTable({
    columns,
    data,
    emptyMessage = "No records found.",
}) {
    return (
        <div className="vf-table-wrapper">

            <table className="vf-table">

                <thead>
                    <tr>
                        {columns.map((column) => (
                            <th key={column.key}>
                                {column.label}
                            </th>
                        ))}
                    </tr>
                </thead>

                <tbody>

                    {data.length > 0 ? (
                        data.map((row, rowIndex) => (
                            <tr key={row.id ?? rowIndex}>

                                {columns.map((column) => (
                                    <td key={column.key}>
                                        {column.render
                                            ? column.render(row)
                                            : row[column.key]}
                                    </td>
                                ))}

                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td
                                colSpan={columns.length}
                                className="vf-table-empty"
                            >
                                {emptyMessage}
                            </td>
                        </tr>
                    )}

                </tbody>

            </table>

        </div>
    );
}

export default DataTable;