const escapeHtml = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Download tabular data as an Excel-readable workbook (.xls). */
export function downloadExcel(filename, rows) {
    const data = Array.isArray(rows) ? rows : [];
    const columns = [...new Set(data.flatMap((row) => Object.keys(row || {})))];
    const tableRows = data.map((row) =>
        `<tr>${columns.map((column) => `<td>${escapeHtml(row?.[column])}</td>`).join("")}</tr>`
    ).join("");
    const header = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("");
    const workbook = `<html><head><meta charset="utf-8"></head><body><table><thead><tr>${header}</tr></thead><tbody>${tableRows}</tbody></table></body></html>`;
    const blob = new Blob(["\ufeff", workbook], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename.endsWith(".xls") ? filename : `${filename}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
