import { useId } from "react";
import { GST_RATES, blankItem, computeTotals } from "../utils/gst";
import { formatMoney } from "../utils/format";
import "./LineItemsEditor.css";

const SUPPLY_LABELS = {
    intra: "Intra-state supply: CGST + SGST",
    inter: "Inter-state supply: IGST",
    none: "GST not applicable (supplier not GST registered)",
};

// Editable line items with HSN/SAC, discount, GST rate and live totals.
function LineItemsEditor({
    items,
    onChange,
    adjustment,
    onAdjustmentChange,
    supplyType,
    roundOff = true,
    catalog = [],
}) {
    const listId = useId();
    const showTax = supplyType !== "none";
    const totals = computeTotals(items, adjustment, supplyType, roundOff);

    const update = (index, patch) =>
        onChange(items.map((item, position) => (position === index ? { ...item, ...patch } : item)));

    const handleDescription = (index, value) => {
        const match = catalog.find((entry) => entry.name.toLowerCase() === value.toLowerCase());
        if (match) {
            update(index, {
                description: match.name,
                hsn_sac: match.hsn_sac || "",
                unit: match.unit || "Nos",
                rate: String(match.rate ?? ""),
                gst_rate: String(match.gst_rate ?? 18),
            });
        } else {
            update(index, { description: value });
        }
    };

    const remove = (index) => {
        if (items.length > 1) onChange(items.filter((_, position) => position !== index));
    };

    return (
        <div className="lie">
            <div className={`lie-banner lie-banner-${supplyType}`}>{SUPPLY_LABELS[supplyType]}</div>

            <datalist id={listId}>
                {catalog.map((entry) => (
                    <option key={entry.id} value={entry.name} />
                ))}
            </datalist>

            <div className="lie-head" aria-hidden="true">
                <span className="lie-c-desc">Item / service</span>
                <span className="lie-c-hsn">HSN/SAC</span>
                <span className="lie-c-qty">Qty</span>
                <span className="lie-c-unit">Unit</span>
                <span className="lie-c-rate">Rate (₹)</span>
                <span className="lie-c-disc">Disc %</span>
                {showTax && <span className="lie-c-gst">GST %</span>}
                <span className="lie-c-amt">Amount</span>
                <span className="lie-c-act" />
            </div>

            {items.map((item, index) => (
                <div className="lie-row" key={index}>
                    <label className="lie-c-desc" data-label="Item / service">
                        <input
                            list={listId}
                            value={item.description}
                            onChange={(event) => handleDescription(index, event.target.value)}
                            placeholder="Item or service"
                            required
                        />
                    </label>
                    <label className="lie-c-hsn" data-label="HSN/SAC">
                        <input
                            value={item.hsn_sac}
                            onChange={(event) => update(index, { hsn_sac: event.target.value })}
                            placeholder="e.g. 9983"
                            inputMode="numeric"
                            maxLength={8}
                        />
                    </label>
                    <label className="lie-c-qty" data-label="Qty">
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.quantity}
                            onChange={(event) => update(index, { quantity: event.target.value })}
                            required
                        />
                    </label>
                    <label className="lie-c-unit" data-label="Unit">
                        <input
                            value={item.unit}
                            onChange={(event) => update(index, { unit: event.target.value })}
                            placeholder="Nos"
                            required
                        />
                    </label>
                    <label className="lie-c-rate" data-label="Rate (₹)">
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.rate}
                            onChange={(event) => update(index, { rate: event.target.value })}
                            placeholder="0.00"
                            required
                        />
                    </label>
                    <label className="lie-c-disc" data-label="Disc %">
                        <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={item.discount_percent}
                            onChange={(event) => update(index, { discount_percent: event.target.value })}
                        />
                    </label>
                    {showTax && (
                        <label className="lie-c-gst" data-label="GST %">
                            <select
                                value={item.gst_rate}
                                onChange={(event) => update(index, { gst_rate: event.target.value })}
                            >
                                {GST_RATES.map((rate) => (
                                    <option key={rate} value={rate}>
                                        {rate}%
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    <div className="lie-c-amt" data-label="Amount">
                        ₹{formatMoney(totals.lines[index].taxable)}
                    </div>
                    <div className="lie-c-act">
                        <button
                            type="button"
                            className="lie-remove"
                            onClick={() => remove(index)}
                            disabled={items.length === 1}
                            aria-label={`Remove item ${index + 1}`}
                        >
                            ×
                        </button>
                    </div>
                </div>
            ))}

            <button type="button" className="lie-add" onClick={() => onChange([...items, blankItem()])}>
                + Add item
            </button>

            <div className="lie-totals">
                <div><span>Taxable value</span><strong>₹{formatMoney(totals.taxable)}</strong></div>
                {supplyType === "intra" && (
                    <>
                        <div><span>CGST</span><strong>₹{formatMoney(totals.cgst)}</strong></div>
                        <div><span>SGST</span><strong>₹{formatMoney(totals.sgst)}</strong></div>
                    </>
                )}
                {supplyType === "inter" && (
                    <div><span>IGST</span><strong>₹{formatMoney(totals.igst)}</strong></div>
                )}
                <div className="lie-adjust">
                    <span>Adjustment (+/−)</span>
                    <input
                        type="number"
                        step="0.01"
                        value={adjustment}
                        onChange={(event) => onAdjustmentChange(event.target.value)}
                    />
                </div>
                {roundOff && totals.roundOff !== 0 && (
                    <div><span>Round off</span><strong>{totals.roundOff > 0 ? "+" : "−"}₹{formatMoney(Math.abs(totals.roundOff))}</strong></div>
                )}
                <div className="lie-grand"><span>Grand total</span><strong>₹{formatMoney(totals.grandTotal)}</strong></div>
            </div>
        </div>
    );
}

export default LineItemsEditor;
