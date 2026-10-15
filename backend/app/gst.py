"""GST helpers: state codes, GSTIN validation, tax computation, amount in words.

All money maths uses Decimal and is rounded to paise (0.01) at each line, the
same way GST invoices are normally produced.
"""

import re
from decimal import Decimal, ROUND_HALF_UP

TWO_PLACES = Decimal("0.01")

# GST state / UT codes as used in GSTIN and "Place of Supply".
STATES = {
    "01": "Jammu & Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
    "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana", "07": "Delhi",
    "08": "Rajasthan", "09": "Uttar Pradesh", "10": "Bihar", "11": "Sikkim",
    "12": "Arunachal Pradesh", "13": "Nagaland", "14": "Manipur",
    "15": "Mizoram", "16": "Tripura", "17": "Meghalaya", "18": "Assam",
    "19": "West Bengal", "20": "Jharkhand", "21": "Odisha", "22": "Chhattisgarh",
    "23": "Madhya Pradesh", "24": "Gujarat",
    "26": "Dadra & Nagar Haveli and Daman & Diu", "27": "Maharashtra",
    "29": "Karnataka", "30": "Goa", "31": "Lakshadweep", "32": "Kerala",
    "33": "Tamil Nadu", "34": "Puducherry", "35": "Andaman & Nicobar Islands",
    "36": "Telangana", "37": "Andhra Pradesh", "38": "Ladakh",
    "97": "Other Territory", "99": "Centre Jurisdiction",
}

# Standard GST slabs; 0 covers nil-rated / exempt supplies.
GST_RATES = [Decimal(rate) for rate in ("0", "0.1", "0.25", "3", "5", "12", "18", "28")]

_GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
_GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def q2(value):
    return Decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def gstin_checksum_ok(gstin):
    """Verify the mod-36 check character of a GSTIN."""
    total = 0
    for index, char in enumerate(gstin[:14]):
        digit = _GSTIN_CHARS.index(char)
        product = digit * (1 if index % 2 == 0 else 2)
        total += product // 36 + product % 36
    return _GSTIN_CHARS[(36 - total % 36) % 36] == gstin[14]


def normalize_gstin(value):
    return re.sub(r"\s+", "", str(value or "")).upper()


def validate_gstin(value):
    """Return an error message for an invalid GSTIN, or None when valid/blank."""
    gstin = normalize_gstin(value)
    if not gstin:
        return None
    if not _GSTIN_PATTERN.match(gstin):
        return "GSTIN must be 15 characters in the standard format (for example 33ABCDE1234F1Z5)."
    if gstin[:2] not in STATES:
        return "GSTIN starts with an unknown state code."
    if not gstin_checksum_ok(gstin):
        return "GSTIN check character is invalid. Please re-check the number."
    return None


def state_code_from_gstin(value):
    gstin = normalize_gstin(value)
    return gstin[:2] if len(gstin) >= 2 and gstin[:2] in STATES else None


def parse_decimal(value, label, minimum=None, maximum=None, default="0"):
    try:
        number = Decimal(str(default if value in (None, "") else value))
    except Exception:
        raise ValueError(f"{label} must be a valid number.")
    if number.is_nan() or number.is_infinite():
        raise ValueError(f"{label} must be a valid number.")
    if minimum is not None and number < minimum:
        raise ValueError(f"{label} cannot be less than {minimum}.")
    if maximum is not None and number > maximum:
        raise ValueError(f"{label} cannot be more than {maximum}.")
    return number


def determine_supply(gst_registered, seller_state, place_of_supply):
    """Return (supply_type, place_of_supply).

    ``none``  - seller is not GST registered: bill of supply, no tax charged.
    ``intra`` - same state: CGST + SGST.
    ``inter`` - different state: IGST.
    """
    if not gst_registered:
        return "none", place_of_supply or seller_state or None
    place = place_of_supply or seller_state
    if not place or not seller_state or place == seller_state:
        return "intra", place or seller_state
    return "inter", place


def compute_document(raw_items, adjustment, supply_type, round_off_enabled=True, label="item"):
    """Validate line items and compute every tax figure server-side.

    Returns ``(items, totals)`` where each item carries taxable/CGST/SGST/IGST
    amounts and ``totals`` carries the document level figures.
    Raises ``ValueError`` with a user-facing message on invalid input.
    """
    if not isinstance(raw_items, list) or not raw_items:
        raise ValueError(f"At least one {label} is required.")

    items = []
    taxable_total = Decimal("0.00")
    cgst_total = Decimal("0.00")
    sgst_total = Decimal("0.00")
    igst_total = Decimal("0.00")

    for position, raw in enumerate(raw_items, start=1):
        description = str(raw.get("description", "")).strip()
        unit = str(raw.get("unit", "")).strip()
        if not description:
            raise ValueError(f"Row {position}: description is required.")
        if not unit:
            raise ValueError(f"Row {position}: unit is required.")

        quantity = parse_decimal(raw.get("quantity"), f"Row {position} quantity")
        rate = parse_decimal(raw.get("rate"), f"Row {position} rate", minimum=Decimal("0"))
        discount_percent = parse_decimal(
            raw.get("discount_percent"), f"Row {position} discount",
            minimum=Decimal("0"), maximum=Decimal("100"),
        )
        gst_rate = parse_decimal(
            raw.get("gst_rate"), f"Row {position} GST rate",
            minimum=Decimal("0"), maximum=Decimal("100"),
        )
        if quantity <= 0:
            raise ValueError(f"Row {position}: quantity must be greater than zero.")

        hsn_sac = re.sub(r"\s+", "", str(raw.get("hsn_sac") or ""))
        if hsn_sac and not re.fullmatch(r"\d{4,8}", hsn_sac):
            raise ValueError(f"Row {position}: HSN/SAC must be 4 to 8 digits.")

        if supply_type == "none":
            gst_rate = Decimal("0")

        gross = q2(quantity * rate)
        discount_amount = q2(gross * discount_percent / Decimal("100"))
        taxable = gross - discount_amount

        cgst = sgst = igst = Decimal("0.00")
        if supply_type == "intra":
            half = gst_rate / Decimal("2")
            cgst = q2(taxable * half / Decimal("100"))
            sgst = q2(taxable * half / Decimal("100"))
        elif supply_type == "inter":
            igst = q2(taxable * gst_rate / Decimal("100"))

        line_total = taxable + cgst + sgst + igst

        taxable_total += taxable
        cgst_total += cgst
        sgst_total += sgst
        igst_total += igst

        items.append({
            "description": description,
            "hsn_sac": hsn_sac,
            "quantity": quantity,
            "unit": unit,
            "rate": rate,
            "discount_percent": discount_percent,
            "gst_rate": gst_rate,
            # ``amount`` stays the pre-tax line value so older screens keep working.
            "amount": taxable,
            "taxable_amount": taxable,
            "cgst_amount": cgst,
            "sgst_amount": sgst,
            "igst_amount": igst,
            "total_amount": line_total,
        })

    adjustment = q2(parse_decimal(adjustment, "Adjustment"))
    total_tax = cgst_total + sgst_total + igst_total
    pre_round = taxable_total + total_tax + adjustment

    round_off = Decimal("0.00")
    if round_off_enabled:
        round_off = q2(pre_round.quantize(Decimal("1"), rounding=ROUND_HALF_UP) - pre_round)
    grand_total = pre_round + round_off

    totals = {
        "subtotal": taxable_total,
        "taxable_value": taxable_total,
        "cgst_total": cgst_total,
        "sgst_total": sgst_total,
        "igst_total": igst_total,
        "total_tax": total_tax,
        "adjustment": adjustment,
        "round_off": round_off,
        "grand_total": grand_total,
    }
    return items, totals


# ---------------------------------------------------------------------------
# Amount in words (Indian numbering: thousand, lakh, crore)
# ---------------------------------------------------------------------------
_ONES = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _below_thousand(number):
    words = []
    if number >= 100:
        words.append(_ONES[number // 100] + " Hundred")
        number %= 100
    if number >= 20:
        words.append(_TENS[number // 10] + ("-" + _ONES[number % 10] if number % 10 else ""))
    elif number:
        words.append(_ONES[number])
    return " ".join(words)


def amount_in_words(amount, currency="INR"):
    """Return e.g. 'Indian Rupees One Lakh Twenty-Five Thousand Only'."""
    value = q2(amount)
    rupees = int(value)
    paise = int((value - rupees) * 100)

    if rupees == 0:
        rupee_words = "Zero"
    else:
        parts = []
        crore, rupees_rest = divmod(rupees, 10_000_000)
        lakh, rupees_rest = divmod(rupees_rest, 100_000)
        thousand, rest = divmod(rupees_rest, 1_000)
        if crore:
            parts.append(_below_thousand(crore) + " Crore")
        if lakh:
            parts.append(_below_thousand(lakh) + " Lakh")
        if thousand:
            parts.append(_below_thousand(thousand) + " Thousand")
        if rest:
            parts.append(_below_thousand(rest))
        rupee_words = " ".join(parts)

    prefix = "Indian Rupees" if currency == "INR" else currency
    text = f"{prefix} {rupee_words}"
    if paise:
        text += f" and {_below_thousand(paise)} Paise"
    return text + " Only"
