"""SQL generating macro library for verified dataset transformations."""

from core.macros.base import quote_ident, Macro
from core.macros.strings import TrimAndNormalizeMacro
from core.macros.numbers import CastTypeMacro, ClipOutliersMacro, HandleNullsMacro
from core.macros.dates import ParseTimestampMacro
from core.macros.dedupe import DedupeMacro

__all__ = [
    "quote_ident",
    "Macro",
    "TrimAndNormalizeMacro",
    "CastTypeMacro",
    "ClipOutliersMacro",
    "HandleNullsMacro",
    "ParseTimestampMacro",
    "DedupeMacro",
]
