"""DuckDB SQL generation macro for PII anonymization and masking."""

from typing import Literal, Optional
from core.macros.base import Macro, quote_ident


class MaskPiiMacro(Macro):
    """
    Renders DuckDB SQL expressions to mask, redact, or hash sensitive PII columns.
    """

    def __init__(
        self,
        strategy: Literal["partial_mask", "sha256_hash", "redact"] = "partial_mask",
        entity_type: Optional[str] = None,
    ) -> None:
        self.strategy = strategy or "partial_mask"
        self.entity_type = (entity_type or "pii").lower()

    def to_sql(self, column_name: str) -> str:
        col = quote_ident(column_name)

        if self.strategy == "sha256_hash":
            return f"CASE WHEN {col} IS NULL THEN NULL ELSE substr(sha256(cast({col} as varchar)), 1, 16) END"

        if self.strategy == "redact":
            token = f"'[REDACTED_{self.entity_type.upper()}]'"
            return f"CASE WHEN {col} IS NULL THEN NULL ELSE {token} END"

        # Strategy: partial_mask
        if self.entity_type == "email":
            # Mask username leaving first character and domain
            return (
                f"CASE WHEN {col} IS NULL THEN NULL "
                f"WHEN instr(cast({col} as varchar), '@') > 0 "
                f"THEN regexp_replace(cast({col} as varchar), '^(.)(.*)(@.*)$', '\\1***\\3') "
                f"ELSE '***@***' END"
            )

        if self.entity_type in ("credit_card", "card"):
            # Keep last 4 digits
            return (
                f"CASE WHEN {col} IS NULL THEN NULL "
                f"ELSE '****-****-****-' || right(regexp_replace(cast({col} as varchar), '[^0-9]', '', 'g'), 4) END"
            )

        if self.entity_type in ("ssn", "social_security"):
            # Format: ***-**-1234
            return (
                f"CASE WHEN {col} IS NULL THEN NULL "
                f"ELSE '***-**-' || right(regexp_replace(cast({col} as varchar), '[^0-9]', '', 'g'), 4) END"
            )

        if self.entity_type == "phone":
            # Format: (***) ***-1234
            return (
                f"CASE WHEN {col} IS NULL THEN NULL "
                f"ELSE '(***) ***-' || right(regexp_replace(cast({col} as varchar), '[^0-9]', '', 'g'), 4) END"
            )

        if self.entity_type in ("ip", "ip_address"):
            # Mask host octets in IPv4
            return (
                f"CASE WHEN {col} IS NULL THEN NULL "
                f"WHEN cast({col} as varchar) LIKE '%.%.%.%' "
                f"THEN regexp_replace(cast({col} as varchar), '^([0-9]+\\.[0-9]+)\\..*$', '\\1.*.*') "
                f"ELSE '[MASKED_IP]' END"
            )

        # Default fallback
        return (
            f"CASE WHEN {col} IS NULL THEN NULL "
            f"WHEN length(cast({col} as varchar)) > 4 THEN '****' || right(cast({col} as varchar), 4) "
            f"ELSE '****' END"
        )
