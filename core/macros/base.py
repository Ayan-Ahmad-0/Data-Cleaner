"""Base macro interfaces and identifier escaping."""

from abc import ABC, abstractmethod


def quote_ident(name: str) -> str:
    """Escapes double quotes and encloses identifier to prevent SQL injection."""
    escaped = name.replace('"', '""')
    return f'"{escaped}"'


class Macro(ABC):
    """Abstract base class for a SQL-generating transformation macro."""

    @abstractmethod
    def to_sql(self, column_name: str) -> str:
        """Render the SQL expression for the specified column."""
        pass
