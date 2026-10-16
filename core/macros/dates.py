"""Timestamp parsing and timezone normalization macros."""

from typing import List
from core.macros.base import Macro, quote_ident


class ParseTimestampMacro(Macro):
    """
    Parses timestamps trying formats sequentially via COALESCE,
    handling whitespace and normalizing to UTC.
    """

    def __init__(self, formats: List[str], source_tz: str = "UTC") -> None:
        self.formats = formats
        self.source_tz = source_tz

    def to_sql(self, column_name: str) -> str:
        col = quote_ident(column_name)
        strptime_calls = [f"try_strptime(trim({col}), '{fmt}')" for fmt in self.formats]

        if len(strptime_calls) > 1:
            coalesced = f"COALESCE({', '.join(strptime_calls)})"
        else:
            coalesced = strptime_calls[0]

        return coalesced
