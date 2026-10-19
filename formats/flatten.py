"""Pure helpers for flattening nested struct columns into flat dot-delimited SQL expressions."""

from __future__ import annotations
import re
from typing import Any, Dict, List, Tuple


def parse_struct_fields(type_str: str) -> List[Tuple[str, str]]:
    """
    Parse a DuckDB STRUCT type string into a list of (field_name, field_type).
    Example: 'STRUCT(street VARCHAR, city VARCHAR, zip STRUCT(code VARCHAR))'
    Handles arbitrarily nested parentheses and commas.
    """
    type_str = type_str.strip()
    if not (type_str.upper().startswith("STRUCT(") and type_str.endswith(")")):
        return []

    inner = type_str[len("STRUCT("):-1].strip()
    fields: List[Tuple[str, str]] = []

    paren_depth = 0
    current_token = []

    for char in inner:
        if char in "([":
            paren_depth += 1
            current_token.append(char)
        elif char in ")]":
            paren_depth -= 1
            current_token.append(char)
        elif char == "," and paren_depth == 0:
            field_def = "".join(current_token).strip()
            if field_def:
                fields.append(_split_field_def(field_def))
            current_token = []
        else:
            current_token.append(char)

    if current_token:
        field_def = "".join(current_token).strip()
        if field_def:
            fields.append(_split_field_def(field_def))

    return fields


def _split_field_def(field_def: str) -> Tuple[str, str]:
    """Split 'name TYPE' or '\"name with spaces\" TYPE' into (name, type)."""
    field_def = field_def.strip()
    if field_def.startswith('"'):
        # Quoted identifier
        match = re.match(r'^"([^"]+)"\s+(.+)$', field_def)
        if match:
            return match.group(1), match.group(2).strip()
    # Unquoted identifier: split on first space
    parts = field_def.split(None, 1)
    if len(parts) == 2:
        return parts[0], parts[1].strip()
    return field_def, "VARCHAR"


def generate_flattening_expressions(
    columns_with_types: List[Tuple[str, str]],
    separator: str = ".",
    max_depth: int = 10,
    array_mode: str = "json_string",
) -> Tuple[List[str], bool, List[str]]:
    """
    Generate SQL SELECT projection expressions that unnest all STRUCT columns
    into 'parent.child' flat column aliases.

    Args:
        columns_with_types: List of (column_name, duckdb_type_str)
        separator: Separator for flattened names (default '.')
        max_depth: Maximum recursion depth
        array_mode: 'json_string' (default, cast list to json) or 'raw'

    Returns:
        (select_expressions, is_flattened, warnings)
    """
    select_expressions: List[str] = []
    seen_names: Dict[str, int] = {}
    warnings: List[str] = []
    flattened = False

    def resolve_alias(candidate: str) -> str:
        nonlocal warnings
        count = seen_names.get(candidate, 0)
        if count == 0:
            seen_names[candidate] = 1
            return candidate
        else:
            seen_names[candidate] = count + 1
            unique_alias = f"{candidate}_{count + 1}"
            warnings.append(f"Column name collision for '{candidate}'; renamed to '{unique_alias}'")
            return unique_alias

    def walk_struct(
        path_expr: str,
        name_prefix: str,
        type_str: str,
        current_depth: int,
    ) -> None:
        nonlocal flattened, warnings
        if current_depth > max_depth:
            alias = resolve_alias(name_prefix)
            select_expressions.append(f'to_json({path_expr}) AS "{alias}"')
            warnings.append(f"Nesting depth exceeded {max_depth} at '{name_prefix}'; preserved as JSON string")
            return

        fields = parse_struct_fields(type_str)
        if not fields:
            # Fallback if unparseable
            alias = resolve_alias(name_prefix)
            select_expressions.append(f'{path_expr} AS "{alias}"')
            return

        flattened = True
        for field_name, field_type in fields:
            safe_field_esc = field_name.replace("'", "''")
            child_expr = f"struct_extract({path_expr}, '{safe_field_esc}')"
            child_name = f"{name_prefix}{separator}{field_name}" if name_prefix else field_name

            if field_type.strip().upper().startswith("STRUCT("):
                walk_struct(child_expr, child_name, field_type, current_depth + 1)
            elif field_type.strip().upper().endswith("[]") or field_type.strip().upper().startswith("LIST("):
                alias = resolve_alias(child_name)
                select_expressions.append(f'to_json({child_expr}) AS "{alias}"')
            else:
                alias = resolve_alias(child_name)
                select_expressions.append(f'{child_expr} AS "{alias}"')

    for col_name, col_type in columns_with_types:
        safe_col = col_name.replace('"', '""')
        col_expr = f'"{safe_col}"'
        type_upper = col_type.strip().upper()

        if type_upper.startswith("STRUCT("):
            walk_struct(col_expr, col_name, col_type, current_depth=1)
        elif (type_upper.endswith("[]") or type_upper.startswith("LIST(")) and array_mode == "json_string":
            alias = resolve_alias(col_name)
            select_expressions.append(f'to_json({col_expr}) AS "{alias}"')
        else:
            alias = resolve_alias(col_name)
            select_expressions.append(f'{col_expr} AS "{alias}"')

    return select_expressions, flattened, warnings
