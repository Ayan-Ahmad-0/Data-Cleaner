"""Automated primary key detection and cross-table foreign key value-overlap scanner."""

from __future__ import annotations
import logging
import re
from typing import Dict, List, Optional, Set, Tuple
import duckdb

from core.modeling.models import ColumnMetadata, Relationship, TableMetadata

logger = logging.getLogger(__name__)


def singularize(name: str) -> str:
    """Best-effort singular form of common table names for heuristic matching."""
    s = name.lower()
    if s.endswith("ies") and len(s) > 3:
        return s[:-3] + "y"
    if s.endswith("es") and len(s) > 2 and s[-3] in ("s", "x", "z", "ch", "sh"):
        return s[:-2]
    if s.endswith("s") and len(s) > 1 and not s.endswith("ss"):
        return s[:-1]
    return s


class RelationshipDetector:
    """Discovers primary keys and foreign key relationships across staged DuckDB tables."""

    @staticmethod
    def detect_primary_keys(con: duckdb.DuckDBPyConnection, tables: Dict[str, TableMetadata]) -> None:
        """Analyze column uniqueness and non-null constraints to flag primary key candidates."""
        for tbl_name, tbl_meta in tables.items():
            if tbl_meta.row_count == 0:
                continue

            best_pk_col: Optional[ColumnMetadata] = None
            best_score = -1

            for col in tbl_meta.columns:
                try:
                    # Query distinct count and null count
                    res = con.execute(f"""
                        SELECT 
                            count(*) AS total,
                            approx_count_distinct("{col.name}") AS distinct_cnt,
                            count(*) - count("{col.name}") AS null_cnt
                        FROM "{tbl_name}"
                    """).fetchone()

                    if not res:
                        continue

                    total, distinct_cnt, null_cnt = res[0], res[1], res[2]
                    col.distinct_count = distinct_cnt
                    col.null_count = null_cnt
                    col.is_nullable = (null_cnt > 0)

                    # A true PK candidate must have 0 nulls and near 100% uniqueness
                    is_unique = (distinct_cnt >= total * 0.99)
                    if null_cnt == 0 and is_unique:
                        col_lower = col.name.lower()
                        score = 1
                        if col_lower == "id":
                            score += 10
                        elif col_lower == f"{singularize(tbl_name)}_id" or col_lower == f"{tbl_name}_id":
                            score += 8
                        elif col_lower.endswith("_id") or col_lower.endswith("_key") or col_lower.endswith("_pk"):
                            score += 5
                        elif "uuid" in col_lower or "guid" in col_lower:
                            score += 4

                        if score > best_score:
                            best_score = score
                            best_pk_col = col
                except Exception as e:
                    logger.debug(f"Failed to check PK for {tbl_name}.{col.name}: {e}")

            if best_pk_col:
                best_pk_col.is_pk = True

    @staticmethod
    def detect_foreign_keys(
        con: duckdb.DuckDBPyConnection,
        tables: Dict[str, TableMetadata],
    ) -> List[Relationship]:
        """Scan pairs of tables for key overlap and infer relational edges."""
        relationships: List[Relationship] = []
        seen_pairs: Set[Tuple[str, str, str, str]] = set()

        table_names = list(tables.keys())
        if len(table_names) < 2:
            return []

        for i in range(len(table_names)):
            for j in range(len(table_names)):
                if i == j:
                    continue

                child_table = table_names[i]
                parent_table = table_names[j]
                child_meta = tables[child_table]
                parent_meta = tables[parent_table]

                if child_meta.row_count == 0 or parent_meta.row_count == 0:
                    continue

                # Find candidate pairs between child and parent
                candidate_pairs = RelationshipDetector._find_candidate_pairs(child_meta, parent_meta)

                for child_col, parent_col, base_confidence in candidate_pairs:
                    pair_key = (child_table, child_col.name, parent_table, parent_col.name)
                    rev_key = (parent_table, parent_col.name, child_table, child_col.name)
                    if pair_key in seen_pairs or rev_key in seen_pairs:
                        continue

                    rel = RelationshipDetector._verify_overlap(
                        con,
                        child_table,
                        child_col,
                        parent_table,
                        parent_col,
                        base_confidence,
                    )

                    if rel:
                        relationships.append(rel)
                        seen_pairs.add(pair_key)
                        child_col.is_fk = True

        return relationships

    @staticmethod
    def _find_candidate_pairs(
        child_meta: TableMetadata,
        parent_meta: TableMetadata,
    ) -> List[Tuple[ColumnMetadata, ColumnMetadata, float]]:
        """Identify plausible column candidates based on naming patterns and data types."""
        candidates = []
        parent_singular = singularize(parent_meta.table_name)

        for child_col in child_meta.columns:
            c_name = child_col.name.lower()
            for parent_col in parent_meta.columns:
                p_name = parent_col.name.lower()

                # Prioritize parent columns that are PKs or named 'id'
                if not (parent_col.is_pk or p_name == "id" or p_name.endswith("_id") or p_name.endswith("_key")):
                    continue

                # Rule 1: Child is '<parent_singular>_id' and Parent is 'id' or '<parent_singular>_id'
                if c_name == f"{parent_singular}_id" and (p_name == "id" or p_name == f"{parent_singular}_id"):
                    candidates.append((child_col, parent_col, 0.95))
                    continue

                # Rule 2: Exact matching column name (e.g. both have 'customer_id' or 'product_sku')
                if c_name == p_name and c_name != "id":
                    confidence = 0.90 if parent_col.is_pk else 0.75
                    candidates.append((child_col, parent_col, confidence))
                    continue

                # Rule 3: Child is '<parent_table>_id' and Parent is 'id'
                if c_name == f"{parent_meta.table_name.lower()}_id" and p_name == "id":
                    candidates.append((child_col, parent_col, 0.95))
                    continue

        return candidates

    @staticmethod
    def _verify_overlap(
        con: duckdb.DuckDBPyConnection,
        child_table: str,
        child_col: ColumnMetadata,
        parent_table: str,
        parent_col: ColumnMetadata,
        base_confidence: float,
    ) -> Optional[Relationship]:
        """Execute a cross-table SQL verification to measure key overlap and orphan rates."""
        try:
            query = f"""
                SELECT
                    count(c."{child_col.name}") AS total_child_non_null,
                    count(c."{child_col.name}") FILTER (WHERE p."{parent_col.name}" IS NOT NULL) AS matched_rows,
                    count(c."{child_col.name}") FILTER (WHERE p."{parent_col.name}" IS NULL) AS orphan_rows,
                    approx_count_distinct(c."{child_col.name}") AS child_distinct,
                    approx_count_distinct(p."{parent_col.name}") AS parent_distinct
                FROM "{child_table}" c
                LEFT JOIN "{parent_table}" p ON c."{child_col.name}" = p."{parent_col.name}"
                WHERE c."{child_col.name}" IS NOT NULL
            """
            res = con.execute(query).fetchone()
            if not res:
                return None

            total_child = res[0]
            matched = res[1]
            orphans = res[2]
            child_distinct = res[3]

            if total_child == 0 or matched == 0:
                return None

            match_ratio = matched / total_child
            # We require at least 50% overlap for auto-detection
            if match_ratio < 0.50:
                return None

            # Determine cardinality:
            # If child column is also unique, relationship is 1:1, otherwise 1:N
            cardinality = "1:1" if (child_distinct >= total_child * 0.98) else "1:N"

            final_confidence = round(min(1.0, base_confidence * (0.5 + 0.5 * match_ratio)), 2)

            rel_id = f"rel_{child_table}_{child_col.name}_{parent_table}_{parent_col.name}"
            return Relationship(
                id=rel_id,
                from_table=child_table,
                from_column=child_col.name,
                to_table=parent_table,
                to_column=parent_col.name,
                cardinality=cardinality,
                confidence=final_confidence,
                match_ratio=round(match_ratio, 3),
                orphan_count=orphans,
                status="detected",
            )
        except Exception as e:
            logger.debug(f"Failed to verify overlap between {child_table}.{child_col.name} and {parent_table}.{parent_col.name}: {e}")
            return None
