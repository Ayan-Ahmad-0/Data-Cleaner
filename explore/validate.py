"""SQL validation layer for defense-in-depth query sandboxing."""

from __future__ import annotations
from dataclasses import dataclass
from typing import List, Set
import duckdb
import sqlglot
from sqlglot import exp

from explore.errors import QueryNotAllowedError, QuerySyntaxError
from explore.limits import QueryLimits

BLOCKED_FUNC_PREFIXES = (
    "read_",
    "readcsv",
    "readparquet",
    "readjson",
    "readtext",
    "readblob",
    "readxlsx",
    "http",
    "duckdb_",
)

BLOCKED_FUNCS = {
    "glob",
    "parquet_scan",
    "parquet_metadata",
    "sniff_csv",
    "sqlite_scan",
    "current_setting",
}

DEFAULT_ALLOWED_TABLES = frozenset({"data", "original"})


@dataclass(frozen=True)
class ValidatedQuery:
    """Represents an inspected, validated SQL query approved for sandboxed execution."""
    sql: str
    referenced_tables: List[str]


def validate_sql(
    sql: str,
    limits: QueryLimits | None = None,
    allowed_tables: Set[str] | frozenset[str] = DEFAULT_ALLOWED_TABLES,
) -> ValidatedQuery:
    """Validate user SQL query ensuring it is a single read-only SELECT conforming to the sandbox allow-list.

    Raises:
        QueryNotAllowedError: If the query violates read-only or sandboxing rules.
        QuerySyntaxError: If the query contains syntax or parse errors.
    """
    if not sql or not sql.strip():
        raise QueryNotAllowedError("Query cannot be empty.")

    max_len = limits.max_sql_length if limits else 20_000
    if len(sql) > max_len:
        raise QueryNotAllowedError(f"Query exceeds maximum allowed length of {max_len:,} characters.")

    # 1. DuckDB parser verification & statement count check
    try:
        stmts = duckdb.extract_statements(sql)
    except Exception as e:
        raise QuerySyntaxError(str(e))

    if len(stmts) == 0:
        raise QueryNotAllowedError("No valid SQL statement found.")
    if len(stmts) > 1:
        raise QueryNotAllowedError("Multiple SQL statements separated by ';' are strictly prohibited.")

    stmt = stmts[0]
    if stmt.type != duckdb.StatementType.SELECT:
        raise QueryNotAllowedError(
            f"Statement type '{stmt.type.name}' is not allowed. Only SELECT queries are permitted."
        )

    # 2. AST parsing & fine-grained semantic analysis using sqlglot DuckDB dialect
    try:
        parsed_expressions = sqlglot.parse(sql, read="duckdb")
    except Exception as e:
        raise QuerySyntaxError(str(e))

    if not parsed_expressions or len(parsed_expressions) != 1:
        raise QueryNotAllowedError("Query must contain exactly one statement.")

    root = parsed_expressions[0]
    if not isinstance(root, (exp.Select, exp.Union)):
        raise QueryNotAllowedError("Only SELECT or UNION queries are allowed.")

    # Collect CTE aliases declared in query
    cte_names: Set[str] = set()
    for cte in root.find_all(exp.CTE):
        if cte.alias:
            cte_names.add(cte.alias.lower())

    # Check all table references against the table allow-list
    referenced_tables: List[str] = []
    allowed_table_set = {t.lower() for t in allowed_tables}

    for table_node in root.find_all(exp.Table):
        # Disallow table functions (e.g. read_csv, glob) or literal paths used as tables
        if not isinstance(table_node.this, (exp.Identifier, exp.Var)):
            expr_str = table_node.sql(dialect="duckdb")
            raise QueryNotAllowedError(
                f"External table function or path expression '{expr_str}' is forbidden."
            )

        name = table_node.name.lower()
        if not name:
            continue

        # Disallow path-like names or file extensions
        if any(char in name for char in ("/", "\\", ".", ":")) or name.endswith(
            (".csv", ".parquet", ".json", ".tsv", ".db", ".sqlite", ".xlsx")
        ):
            raise QueryNotAllowedError(f"Direct file or path reference '{name}' is not permitted.")

        # Table must be in allowed list or a query-defined CTE
        if name not in cte_names and name not in allowed_table_set:
            allowed_fmt = ", ".join(f"'{t}'" for t in sorted(allowed_table_set))
            raise QueryNotAllowedError(
                f"Table or view '{name}' is not accessible. Permitted tables: {allowed_fmt}."
            )

        referenced_tables.append(name)

    # Check all function calls across AST against blocked function list
    for func in root.find_all(exp.Func, exp.Anonymous):
        names_to_check: Set[str] = set()
        if isinstance(func, exp.Anonymous):
            if func.this:
                names_to_check.add(str(func.this).lower())
            if func.name:
                names_to_check.add(func.name.lower())
        else:
            if func.sql_name():
                names_to_check.add(func.sql_name().lower())
            if func.key:
                names_to_check.add(func.key.lower())
            if func.name:
                names_to_check.add(func.name.lower())

        for fn in names_to_check:
            if (
                fn.startswith(BLOCKED_FUNC_PREFIXES)
                or fn in BLOCKED_FUNCS
            ):
                raise QueryNotAllowedError(f"Function '{fn}' is forbidden in explore queries.")

    clean_sql = sql.strip().rstrip(";").strip()
    return ValidatedQuery(sql=clean_sql, referenced_tables=referenced_tables)
