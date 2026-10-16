"""Window-based deduplication macro."""

from typing import List, Literal, Optional
from core.macros.base import quote_ident


class DedupeMacro:
    """Generates window-based QUALIFY clause for row deduplication."""

    def __init__(
        self,
        keys: List[str],
        keep: Literal["first", "latest", "all"] = "latest",
        order_by: Optional[str] = None,
    ) -> None:
        self.keys = keys
        self.keep = keep
        self.order_by = order_by

    def to_qualify_clause(self) -> str:
        partition_cols = ", ".join(quote_ident(k) for k in self.keys)

        order_clause = ""
        if self.order_by:
            direction = "DESC" if self.keep == "latest" else "ASC"
            order_clause = f" ORDER BY {quote_ident(self.order_by)} {direction}"

        return f"QUALIFY row_number() OVER (PARTITION BY {partition_cols}{order_clause}) = 1"
