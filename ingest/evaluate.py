from decimal import Decimal, ROUND_HALF_UP

TWO_PLACES = Decimal("0.01")


def price_per_sqm(
    price: Decimal | None, area: Decimal | None
) -> Decimal | None:
    """Price per square metre, or None if it cannot be computed.

    Returns None rather than raising or skipping: a listing with no area
    is still worth keeping, it just cannot be evaluated.
    """
    if price is None or area is None or area <= 0:
        return None
    return (price / area).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def discount_pct(
    value: Decimal | None, baseline: Decimal | None
) -> Decimal | None:
    """Percent below baseline. Positive means cheaper than the area norm."""
    if value is None or baseline is None or baseline <= 0:
        return None
    pct = (Decimal(1) - (value / baseline)) * Decimal(100)
    return pct.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def is_hot_lead(discount: Decimal | None, threshold: Decimal) -> bool:
    """Threshold comes from settings.discount_threshold_pct, never a
    constant (build prompt section 9)."""
    if discount is None:
        return False
    return discount >= threshold
