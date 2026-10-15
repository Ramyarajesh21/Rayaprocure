"""Per-tenant document numbering."""

import re


def next_document_number(cursor, tenant_id, table, column, prefix, width=3):
    """Return the next ``PREFIX-###`` number for one tenant.

    Uses the highest existing numeric suffix instead of COUNT(*), so deleting a
    record never causes the next number to collide with an existing one.
    """
    escaped = prefix.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
    cursor.execute(
        f"SELECT `{column}` FROM `{table}` WHERE tenant_id = %s AND `{column}` LIKE %s",
        (tenant_id, f"{escaped}%"),
    )
    highest = 0
    for row in cursor.fetchall():
        value = row[0] if not isinstance(row, dict) else row[column]
        match = re.search(r"(\d+)$", value or "")
        if match:
            highest = max(highest, int(match.group(1)))
    return f"{prefix}{highest + 1:0{width}d}"
