"""Unit tests for PII detection engine and masking transformations."""

import pytest
from core.privacy.detector import PiiDetector, luhn_checksum
from core.privacy.masking import (
    hash_sha256,
    mask_credit_card,
    mask_email,
    mask_ip,
    mask_phone,
    mask_ssn,
    mask_value,
)
from core.ai.prompts import clean_profile_for_prompt


def test_luhn_checksum():
    # Valid Visa test number
    assert luhn_checksum("4532015112830366") is True
    assert luhn_checksum("4532-0151-1283-0366") is True
    # Invalid numbers
    assert luhn_checksum("4532015112830367") is False
    assert luhn_checksum("1234567812345678") is False
    assert luhn_checksum("123") is False


def test_masking_helpers():
    assert mask_email("alice.smith@company.com") == "a***@company.com"
    assert mask_credit_card("4532-0151-1283-0366") == "****-****-****-0366"
    assert mask_ssn("123-45-6789") == "***-**-6789"
    assert mask_phone("+1 (555) 867-5309") == "(***) ***-5309"
    assert mask_ip("192.168.1.100") == "192.168.*.*"
    assert mask_ip("2001:0db8:85a3:0000:0000:8a2e:0370:7334") == "2001:0db8:****"

    h = hash_sha256("sensitive_id", length=16)
    assert len(h) == 16
    assert h == hash_sha256("sensitive_id", length=16)


def test_mask_value_dispatch():
    val = "user@domain.com"
    assert mask_value(val, "email", strategy="partial_mask") == "u***@domain.com"
    assert mask_value(val, "email", strategy="redact") == "[REDACTED_EMAIL]"
    assert len(mask_value(val, "email", strategy="sha256_hash")) == 16
    assert mask_value(val, "email", strategy="synthetic_token").startswith("TOKEN_EMA_")


def test_detector_identifies_pii_columns():
    # 1. Emails
    emails = ["john.doe@gmail.com", "jane.doe@yahoo.com", "admin@enterprise.org", None]
    res_email = PiiDetector.scan_column("customer_email", emails)
    assert res_email is not None
    assert res_email.entity_type == "email"
    assert res_email.confidence >= 0.75
    assert "j***@gmail.com" in res_email.sample_preview_masked

    # 2. Credit Cards (valid Luhn)
    cards = ["4532015112830366", "4532-0151-1283-0366", "4532 0151 1283 0366"]
    res_card = PiiDetector.scan_column("payment_card_num", cards)
    assert res_card is not None
    assert res_card.entity_type == "credit_card"
    assert res_card.confidence >= 0.75
    assert res_card.suggested_strategy == "sha256_hash"

    # 3. SSNs
    ssns = ["123-45-6789", "456-78-1234", "234-56-7890"]
    res_ssn = PiiDetector.scan_column("ssn", ssns)
    assert res_ssn is not None
    assert res_ssn.entity_type == "ssn"
    assert res_ssn.confidence >= 0.8

    # 4. Phone numbers
    phones = ["(555) 234-5678", "555-876-5432", "+1-555-345-6789"]
    res_phone = PiiDetector.scan_column("phone_number", phones)
    assert res_phone is not None
    assert res_phone.entity_type == "phone"

    # 5. IP addresses
    ips = ["192.168.0.1", "10.0.0.1", "172.16.254.1"]
    res_ip = PiiDetector.scan_column("client_ip", ips)
    assert res_ip is not None
    assert res_ip.entity_type == "ip"

    # 6. Non-PII clean columns
    non_pii = ["Widget A", "Widget B", "Gadget X", "Sprocket 100"]
    assert PiiDetector.scan_column("product_name", non_pii) is None


def test_clean_profile_for_prompt_auto_scrubs_pii():
    profile = {
        "columns": {
            "user_email": {
                "sample_values": ["test@example.com", "user@company.com"],
            },
            "category": {
                "sample_values": ["Electronics", "Apparel"],
            },
        }
    }
    scrubbed = clean_profile_for_prompt(profile, privacy_mode=False)
    # user_email samples should be masked
    assert scrubbed["columns"]["user_email"]["sample_values"][0] == "t***@example.com"
    assert "pii_detected" in scrubbed["columns"]["user_email"]
    # category samples should remain untouched
    assert scrubbed["columns"]["category"]["sample_values"][0] == "Electronics"
