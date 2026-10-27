"""High-precision PII detection engine with regex scanners, Luhn validation, and semantic heuristics."""

from __future__ import annotations
import logging
from dataclasses import dataclass, field
from pathlib import Path
import re
from typing import Any, Dict, List, Optional, Tuple

import duckdb

from core.privacy.masking import mask_value

logger = logging.getLogger(__name__)


def luhn_checksum(digits: str) -> bool:
    """Validate numeric string using Luhn algorithm (Mod 10)."""
    clean_digits = re.sub(r"\D", "", digits)
    if not (13 <= len(clean_digits) <= 19):
        return False
    digits_list = [int(d) for d in clean_digits]
    checksum = 0
    reverse_digits = digits_list[::-1]
    for idx, d in enumerate(reverse_digits):
        if idx % 2 == 1:
            doubled = d * 2
            checksum += doubled - 9 if doubled > 9 else doubled
        else:
            checksum += d
    return checksum % 10 == 0


# Compiled pattern definitions
EMAIL_REGEX = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
CC_CANDIDATE_REGEX = re.compile(
    r"^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})$"
)
SSN_REGEX = re.compile(r"^(?!000|666|9\d{2})\d{3}[- ]?(?!00)\d{2}[- ]?(?!0000)\d{4}$")
PHONE_REGEX = re.compile(
    r"^(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?:\s*(?:ext|x|ext.)\s*\d{1,5})?$"
)
IPV4_REGEX = re.compile(
    r"^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$"
)
IPV6_REGEX = re.compile(
    r"^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::$|^([0-9a-fA-F]{1,4}:){1,7}:$|^:((:[0-9a-fA-F]{1,4}){1,7}|:)$"
)

COLUMN_KEYWORDS = {
    "email": ["email", "e_mail", "e-mail", "mail_addr", "contact_email", "user_email"],
    "credit_card": ["card", "credit_card", "cc_num", "cc_number", "card_number", "pan", "account_num"],
    "ssn": ["ssn", "social_security", "tax_id", "sin", "national_id"],
    "phone": ["phone", "mobile", "cell", "telephone", "phone_number", "contact_number"],
    "ip": ["ip", "ip_address", "client_ip", "remote_ip", "ipv4", "ipv6", "host_ip"],
}


@dataclass
class PiiDetectionResult:
    """Detection findings for an individual column."""

    column_name: str
    entity_type: str  # 'email', 'credit_card', 'ssn', 'phone', 'ip'
    confidence: float  # 0.0 to 1.0
    sample_count: int
    match_count: int
    sample_preview_masked: str
    suggested_strategy: str  # 'partial_mask', 'sha256_hash', 'redact'
    details: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "column_name": self.column_name,
            "entity_type": self.entity_type,
            "confidence": round(self.confidence, 3),
            "sample_count": self.sample_count,
            "match_count": self.match_count,
            "sample_preview_masked": self.sample_preview_masked,
            "suggested_strategy": self.suggested_strategy,
            "details": self.details,
        }


class PiiDetector:
    """Scans dataset columns for sensitive PII entities."""

    @staticmethod
    def _test_value_entity(value: Any, entity_type: str) -> bool:
        """Check if a single string matches the entity specification."""
        if value is None:
            return False
        s = str(value).strip()
        if not s:
            return False

        if entity_type == "email":
            return bool(EMAIL_REGEX.match(s))

        if entity_type == "credit_card":
            digits_only = re.sub(r"\D", "", s)
            if CC_CANDIDATE_REGEX.match(digits_only):
                return luhn_checksum(digits_only)
            return False

        if entity_type == "ssn":
            return bool(SSN_REGEX.match(s))

        if entity_type == "phone":
            digits_only = re.sub(r"\D", "", s)
            if len(digits_only) in (10, 11) and PHONE_REGEX.match(s):
                return True
            return False

        if entity_type == "ip":
            return bool(IPV4_REGEX.match(s) or IPV6_REGEX.match(s))

        return False

    @staticmethod
    def _column_matches_keywords(col_name: str, entity_type: str) -> bool:
        """Check if column header matches known domain naming heuristics."""
        normalized = re.sub(r"[^a-z0-9_]", "", col_name.lower())
        keywords = COLUMN_KEYWORDS.get(entity_type, [])
        return any(kw in normalized for kw in keywords)

    @classmethod
    def scan_column(
        cls,
        col_name: str,
        samples: List[Any],
    ) -> Optional[PiiDetectionResult]:
        """Scan a sample of values for a specific column and return PiiDetectionResult if detected."""
        non_null_samples = [s for s in samples if s is not None and str(s).strip() != ""]
        if not non_null_samples:
            return None

        total_samples = len(non_null_samples)
        candidate_entities = ["email", "credit_card", "ssn", "phone", "ip"]

        best_entity: Optional[str] = None
        best_confidence: float = 0.0
        best_matches: int = 0
        best_preview: str = ""

        for entity in candidate_entities:
            matches = sum(1 for val in non_null_samples if cls._test_value_entity(val, entity))
            if matches == 0:
                continue

            match_ratio = matches / total_samples
            header_bonus = 0.25 if cls._column_matches_keywords(col_name, entity) else 0.0

            # Confidence formula: match ratio weighted with header relevance
            raw_confidence = min(1.0, match_ratio * 0.8 + header_bonus)

            # Minimum threshold:
            # If match ratio >= 50%, or (match ratio >= 20% with matching column name)
            is_valid = match_ratio >= 0.5 or (match_ratio >= 0.2 and header_bonus > 0)

            if is_valid and raw_confidence > best_confidence:
                best_confidence = raw_confidence
                best_entity = entity
                best_matches = matches
                first_matching_val = next(
                    val for val in non_null_samples if cls._test_value_entity(val, entity)
                )
                best_preview = mask_value(first_matching_val, entity, strategy="partial_mask") or ""

        if best_entity and best_confidence >= 0.45:
            suggested_strategy = "sha256_hash" if best_entity in ("credit_card", "ssn") else "partial_mask"
            return PiiDetectionResult(
                column_name=col_name,
                entity_type=best_entity,
                confidence=best_confidence,
                sample_count=total_samples,
                match_count=best_matches,
                sample_preview_masked=best_preview,
                suggested_strategy=suggested_strategy,
                details={"header_matched": cls._column_matches_keywords(col_name, best_entity)},
            )

        return None

    @classmethod
    def scan_dataset(
        cls,
        parquet_path: Path,
        max_samples: int = 1000,
    ) -> List[PiiDetectionResult]:
        """Scan all columns of a Parquet dataset for sensitive PII entities using DuckDB."""
        if not parquet_path.exists():
            return []

        p_sql = str(parquet_path.resolve()).replace("\\", "/")
        con = duckdb.connect(":memory:")
        results: List[PiiDetectionResult] = []

        try:
            # Fetch column names
            cols_res = con.execute(f"DESCRIBE SELECT * FROM read_parquet('{p_sql}')").fetchall()
            col_names = [r[0] for r in cols_res]

            for col in col_names:
                escaped_col = f'"{col}"'
                query = f"""
                    SELECT {escaped_col}
                    FROM read_parquet('{p_sql}')
                    WHERE {escaped_col} IS NOT NULL
                    LIMIT {max_samples}
                """
                sample_rows = con.execute(query).fetchall()
                sample_vals = [r[0] for r in sample_rows]

                detected = cls.scan_column(col, sample_vals)
                if detected:
                    results.append(detected)
        except Exception as e:
            logger.warning("Error during dataset PII scan of %s: %s", parquet_path, e)
        finally:
            con.close()

        return results
