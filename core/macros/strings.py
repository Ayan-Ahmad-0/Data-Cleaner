"""String manipulation and normalization macros."""

from typing import List, Literal, Optional
from core.macros.base import Macro, quote_ident


class TrimAndNormalizeMacro(Macro):
    """
    Trims leading/trailing whitespace, converts case, and translates
    pseudo-null string tokens to genuine SQL NULLs.
    """

    def __init__(
        self,
        trim: bool = True,
        case: Optional[Literal["lower", "upper", "title"]] = None,
        null_tokens: Optional[List[str]] = None,
    ) -> None:
        self.trim = trim
        self.case = case
        self.null_tokens = null_tokens or ["N/A", "NA", "none", "null", "-", "?", ""]

    def to_sql(self, column_name: str) -> str:
        col = quote_ident(column_name)

        # Base expression
        expr = f"trim({col})" if self.trim else col

        if self.case == "lower":
            expr = f"lower({expr})"
        elif self.case == "upper":
            expr = f"upper({expr})"
        elif self.case == "title":
            expr = f"(upper(substr({expr}, 1, 1)) || lower(substr({expr}, 2)))"

        if self.null_tokens:
            # Escape single quotes in tokens
            safe_tokens = [t.lower().replace("'", "''") for t in self.null_tokens]
            token_list = ", ".join(f"'{t}'" for t in safe_tokens)
            return (
                f"CASE WHEN lower(trim({col})) IN ({token_list}) THEN NULL "
                f"ELSE {expr} END"
            )

        return expr
