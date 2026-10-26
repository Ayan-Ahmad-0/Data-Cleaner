"""Masking and anonymization transformation functions for sensitive data."""

from __future__ import annotations
import hashlib
import re
from typing import Any, Optional


def hash_sha256(value: Any, length: int = 16) -> Optional[str]:
    """Compute a deterministic SHA-256 cryptographic hex digest truncated to length."""
    if value is None:
        return None
    val_str = str(value).strip()
    if not val_str:
        return ""
    digest = hashlib.sha256(val_str.encode("utf-8")).hexdigest()
    return digest[:length] if length > 0 else digest


def mask_email(email: Any) -> Optional[str]:
    """Partially mask email address (e.g. j***@example.com)."""
    if email is None:
        return None
    s = str(email).strip()
    if "@" not in s:
        return s
    parts = s.split("@", 1)
    username, domain = parts[0], parts[1]
    if len(username) <= 1:
        masked_user = "*"
    elif len(username) == 2:
        masked_user = username[0] + "*"
    else:
        masked_user = username[0] + "***"
    return f"{masked_user}@{domain}"


def mask_credit_card(cc: Any) -> Optional[str]:
    """Partially mask credit card preserving only the last 4 digits (e.g. ****-****-****-1234)."""
    if cc is None:
        return None
    digits = re.sub(r"\D", "", str(cc).strip())
    if len(digits) < 4:
        return "****"
    last4 = digits[-4:]
    return f"****-****-****-{last4}"


def mask_ssn(ssn: Any) -> Optional[str]:
    """Partially mask US Social Security Number preserving only last 4 digits (e.g. ***-**-1234)."""
    if ssn is None:
        return None
    digits = re.sub(r"\D", "", str(ssn).strip())
    if len(digits) < 4:
        return "***-**-****"
    last4 = digits[-4:]
    return f"***-**-{last4}"


def mask_phone(phone: Any) -> Optional[str]:
    """Partially mask phone number preserving the last 4 digits (e.g. (***) ***-1234)."""
    if phone is None:
        return None
    digits = re.sub(r"\D", "", str(phone).strip())
    if len(digits) < 4:
        return "(***) ***-****"
    last4 = digits[-4:]
    return f"(***) ***-{last4}"


def mask_ip(ip: Any) -> Optional[str]:
    """Partially mask IPv4 or IPv6 address (e.g. 192.168.*.*)."""
    if ip is None:
        return None
    s = str(ip).strip()
    if "." in s:
        octets = s.split(".")
        if len(octets) == 4:
            return f"{octets[0]}.{octets[1]}.*.*"
    elif ":" in s:
        blocks = s.split(":")
        if len(blocks) >= 3:
            return f"{blocks[0]}:{blocks[1]}:****"
    return "[MASKED_IP]"


def mask_value(
    value: Any,
    entity_type: str,
    strategy: str = "partial_mask",
    token_seed: Optional[int] = None,
) -> Any:
    """Anonymize or mask a single value based on entity type and requested strategy.
    
    Strategies:
      - 'partial_mask': Keep non-identifying characters (e.g. last 4 digits or domain)
      - 'sha256_hash': Deterministic 16-character SHA-256 hash (preserves joins)
      - 'redact': Full replacement token (e.g. [REDACTED_EMAIL])
      - 'synthetic_token': Pseudonymized token (e.g. TOKEN_001)
    """
    if value is None:
        return None
    val_str = str(value).strip()
    if not val_str:
        return value

    strategy = (strategy or "partial_mask").lower()
    entity_type = (entity_type or "unknown").lower()

    if strategy in ("sha256", "sha256_hash", "hash"):
        return hash_sha256(val_str)

    if strategy in ("redact", "redacted"):
        return f"[REDACTED_{entity_type.upper()}]"

    if strategy in ("synthetic_token", "token"):
        h = hashlib.md5(val_str.encode("utf-8")).hexdigest()[:6].upper()
        return f"TOKEN_{entity_type[:3].upper()}_{h}"

    # Default: partial_mask
    if entity_type == "email":
        return mask_email(val_str)
    if entity_type in ("credit_card", "card"):
        return mask_credit_card(val_str)
    if entity_type in ("ssn", "social_security"):
        return mask_ssn(val_str)
    if entity_type == "phone":
        return mask_phone(val_str)
    if entity_type in ("ip", "ip_address"):
        return mask_ip(val_str)

    # Generic fallback
    if len(val_str) <= 4:
        return "****"
    return "*" * (len(val_str) - 4) + val_str[-4:]
