// Client-side mirror of backend/app/gst.py so the form shows live totals.
// The server always recalculates; these numbers are only a preview.

export const GST_RATES = [0, 0.1, 0.25, 3, 5, 12, 18, 28];

const round2 = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

export function determineSupply(gstRegistered, sellerState, placeOfSupply) {
    if (!gstRegistered) return "none";
    const place = placeOfSupply || sellerState;
    if (!place || !sellerState || place === sellerState) return "intra";
    return "inter";
}

export function computeLine(item, supplyType) {
    const quantity = Number(item.quantity) || 0;
    const rate = Number(item.rate) || 0;
    const discount = Math.min(Math.max(Number(item.discount_percent) || 0, 0), 100);
    const gstRate = supplyType === "none" ? 0 : Number(item.gst_rate) || 0;

    const gross = round2(quantity * rate);
    const taxable = round2(gross - round2((gross * discount) / 100));

    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    if (supplyType === "intra") {
        cgst = round2((taxable * gstRate) / 200);
        sgst = round2((taxable * gstRate) / 200);
    } else if (supplyType === "inter") {
        igst = round2((taxable * gstRate) / 100);
    }

    return { taxable, cgst, sgst, igst, total: round2(taxable + cgst + sgst + igst) };
}

export function computeTotals(items, adjustment, supplyType, roundOffEnabled = true) {
    const lines = items.map((item) => computeLine(item, supplyType));
    const sum = (key) => round2(lines.reduce((total, line) => total + line[key], 0));

    const taxable = sum("taxable");
    const cgst = sum("cgst");
    const sgst = sum("sgst");
    const igst = sum("igst");
    const totalTax = round2(cgst + sgst + igst);
    const adj = round2(Number(adjustment) || 0);
    const preRound = round2(taxable + totalTax + adj);
    const roundOff = roundOffEnabled ? round2(Math.round(preRound) - preRound) : 0;

    return {
        lines,
        taxable,
        cgst,
        sgst,
        igst,
        totalTax,
        adjustment: adj,
        roundOff,
        grandTotal: round2(preRound + roundOff),
    };
}

export const blankItem = () => ({
    description: "",
    hsn_sac: "",
    quantity: "1",
    unit: "Nos",
    rate: "",
    discount_percent: "0",
    gst_rate: "18",
});

export function itemsFromApi(items) {
    if (!items?.length) return [blankItem()];
    return items.map((item) => ({
        description: item.description || "",
        hsn_sac: item.hsn_sac || "",
        quantity: String(item.quantity ?? ""),
        unit: item.unit || "",
        rate: String(item.rate ?? ""),
        discount_percent: String(item.discount_percent ?? 0),
        gst_rate: String(item.gst_rate ?? 0),
    }));
}

export function itemsToApi(items) {
    return items.map((item) => ({
        description: item.description.trim(),
        hsn_sac: (item.hsn_sac || "").replace(/\s+/g, ""),
        quantity: Number(item.quantity),
        unit: item.unit.trim(),
        rate: Number(item.rate),
        discount_percent: Number(item.discount_percent) || 0,
        gst_rate: Number(item.gst_rate) || 0,
    }));
}

export function validateItems(items) {
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const row = index + 1;
        if (!item.description.trim()) return `Enter a description for item ${row}.`;
        if (!item.quantity || Number(item.quantity) <= 0) return `Enter a valid quantity for item ${row}.`;
        if (!item.unit.trim()) return `Enter a unit for item ${row}.`;
        if (item.rate === "" || Number(item.rate) < 0) return `Enter a valid rate for item ${row}.`;
        if (item.hsn_sac && !/^\d{4,8}$/.test(item.hsn_sac.replace(/\s+/g, ""))) {
            return `HSN/SAC for item ${row} must be 4 to 8 digits.`;
        }
    }
    return "";
}
