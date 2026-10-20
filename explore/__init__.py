"""Explore Data module: Read-only, sandboxed SQL query service for cleaned datasets."""

from explore.errors import (
    DataNotFoundError,
    ExploreError,
    QueryNotAllowedError,
    QuerySyntaxError,
    QueryTimeoutError,
    QueryTooLargeError,
    ServerBusyError,
)
from explore.limits import QueryLimits
from explore.sandbox import create_sandboxed_connection
from explore.service import (
    ColumnInfo,
    QueryResult,
    SchemaInfo,
    export_query,
    get_schema,
    run_query,
)
from explore.validate import ValidatedQuery, validate_sql

__all__ = [
    "ColumnInfo",
    "DataNotFoundError",
    "ExploreError",
    "QueryLimits",
    "QueryNotAllowedError",
    "QueryResult",
    "QuerySyntaxError",
    "QueryTimeoutError",
    "QueryTooLargeError",
    "SchemaInfo",
    "ServerBusyError",
    "ValidatedQuery",
    "create_sandboxed_connection",
    "export_query",
    "get_schema",
    "run_query",
    "validate_sql",
]
