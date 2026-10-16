"""Numeric casting, outlier clipping, and null handling macros."""

from typing import Any, Literal, Optional, Union
from core.macros.base import Macro, quote_ident


class CastTypeMacro(Macro):
    """Safely converts column to target SQL type; failures become NULL."""

    def __init__(
        self,
        target_type: Literal["integer", "bigint", "double", "boolean", "varchar", "date", "timestamp"],
    ) -> None:
        self.target_type = target_type.upper()

    def to_sql(self, column_name: str) -> str:
        col = quote_ident(column_name)
        return f"try_cast({col} AS {self.target_type})"


class ClipOutliersMacro(Macro):
    """Clips or nullifies numeric values outside designated bounds."""

    def __init__(
        self,
        min_val: Optional[float] = None,
        max_val: Optional[float] = None,
        action: Literal["null", "clamp"] = "null",
    ) -> None:
        self.min_val = min_val
        self.max_val = max_val
        self.action = action

    def to_sql(self, column_name: str) -> str:
        col = quote_ident(column_name)

        if self.action == "null":
            conditions = []
            if self.min_val is not None:
                conditions.append(f"{col} < {self.min_val}")
            if self.max_val is not None:
                conditions.append(f"{col} > {self.max_val}")

            or_cond = " OR ".join(conditions)
            return f"CASE WHEN {or_cond} THEN NULL ELSE {col} END"

        elif self.action == "clamp":
            when_clauses = []
            if self.min_val is not None:
                when_clauses.append(f"WHEN {col} < {self.min_val} THEN {self.min_val}")
            if self.max_val is not None:
                when_clauses.append(f"WHEN {col} > {self.max_val} THEN {self.max_val}")

            when_str = " ".join(when_clauses)
            return f"CASE {when_str} ELSE {col} END"

        return col


class HandleNullsMacro(Macro):
    """Applies imputation or null handling strategy."""

    def __init__(
        self,
        strategy: Literal["drop_row", "fill_value", "fill_median", "fill_mode", "flag"],
        value: Optional[Union[str, int, float, bool]] = None,
    ) -> None:
        self.strategy = strategy
        self.value = value

    def to_sql(self, column_name: str) -> str:
        col = quote_ident(column_name)

        if self.strategy == "fill_value":
            if isinstance(self.value, str):
                safe_val = self.value.replace("'", "''")
                val_repr = f"'{safe_val}'"
            elif self.value is None:
                val_repr = "NULL"
            else:
                val_repr = str(self.value)
            return f"COALESCE({col}, {val_repr})"

        elif self.strategy == "fill_median":
            # CTE-based median replacement in compiler
            return f"COALESCE({col}, (SELECT MEDIAN({col}) FROM normalized))"

        elif self.strategy == "fill_mode":
            return f"COALESCE({col}, (SELECT MODE({col}) FROM normalized))"

        return col
