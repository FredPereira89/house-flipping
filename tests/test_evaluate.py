from decimal import Decimal
import pytest
from ingest.evaluate import price_per_sqm, discount_pct, is_hot_lead


def test_price_per_sqm_basic():
    assert price_per_sqm(Decimal("200000"), Decimal("100")) == Decimal("2000")


def test_price_per_sqm_returns_none_for_zero_area():
    # server.py guarded against this by skipping the listing entirely;
    # we keep the lead and leave the metric null instead.
    assert price_per_sqm(Decimal("200000"), Decimal("0")) is None


def test_price_per_sqm_returns_none_for_missing_inputs():
    assert price_per_sqm(None, Decimal("100")) is None
    assert price_per_sqm(Decimal("200000"), None) is None


def test_discount_pct_below_baseline_is_positive():
    # 2000 vs baseline 2500 is 20% below.
    assert discount_pct(Decimal("2000"), Decimal("2500")) == Decimal("20.00")


def test_discount_pct_above_baseline_is_negative():
    assert discount_pct(Decimal("3000"), Decimal("2500")) == Decimal("-20.00")


def test_discount_pct_none_without_baseline():
    assert discount_pct(Decimal("2000"), None) is None
    assert discount_pct(None, Decimal("2500")) is None
    assert discount_pct(Decimal("2000"), Decimal("0")) is None


def test_is_hot_lead_at_and_above_threshold():
    assert is_hot_lead(Decimal("15.00"), Decimal("15.00")) is True
    assert is_hot_lead(Decimal("22.30"), Decimal("15.00")) is True


def test_is_hot_lead_below_threshold():
    assert is_hot_lead(Decimal("14.99"), Decimal("15.00")) is False


def test_is_hot_lead_false_when_discount_unknown():
    assert is_hot_lead(None, Decimal("15.00")) is False
