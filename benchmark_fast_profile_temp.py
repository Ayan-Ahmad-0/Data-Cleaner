import time
from pathlib import Path
import duckdb
from core.profiler import Profiler, NULL_TOKENS, DISPLAY_TOKEN_MAP, COMMON_DATE_FORMATS, ColumnProfile, NumericStats, DateFormatMatch

def profile_fast(parquet_path):
    conn = duckdb.connect(':memory:')
    conn.execute("SET preserve_insertion_order = false;")
    pq_sql = str(Path(parquet_path).resolve()).replace('\\', '/')
    view_name = "raw_data"
    conn.execute(f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM read_parquet('{pq_sql}');")

    t_start = time.perf_counter()
    desc = conn.execute(f"DESCRIBE {view_name}").fetchall()
    column_names = [col[0] for col in desc]
    total_rows = conn.execute(f"SELECT COUNT(*) FROM {view_name}").fetchone()[0]

    cols_quoted = ", ".join(f'"{col}"' for col in column_names)
    exact_dup_rows = conn.execute(
        f"SELECT COUNT(*) - COUNT(DISTINCT hash({cols_quoted})) FROM {view_name}"
    ).fetchone()[0]
    exact_dup_pct = round((exact_dup_rows / total_rows) * 100, 2) if total_rows > 0 else 0.0

    SAMPLE_SIZE = 100000

    profiles = {}
    for col in column_names:
        quoted = f'"{col}"'
        str_val = f"try_cast({quoted} AS VARCHAR)"

        token_cases = ", ".join(
            [f"SUM(CASE WHEN lower(trim({str_val})) = '{tok}' THEN 1 ELSE 0 END) AS tok_{i}"
             for i, tok in enumerate(NULL_TOKENS)]
        )

        # Full-table scan for exact null counts, distinct count, and whitespace issues
        q1 = f"""
            SELECT
                COUNT({quoted}) AS non_null_count,
                COUNT(DISTINCT {quoted}) AS distinct_count,
                SUM(CASE WHEN {quoted} IS NOT NULL AND length({str_val}) != length(trim({str_val})) THEN 1 ELSE 0 END) AS ws_issues,
                {token_cases}
            FROM {view_name};
        """
        res = conn.execute(q1).fetchone()
        non_null_count = res[0]
        distinct_count = res[1]
        ws_issues = res[2] or 0

        token_counts = {}
        for i, tok in enumerate(NULL_TOKENS):
            val = res[3 + i] or 0
            if val > 0:
                display_tok = DISPLAY_TOKEN_MAP.get(tok, tok)
                token_counts[display_tok] = val

        sql_nulls = total_rows - non_null_count
        pseudo_nulls = sum(token_counts.values())
        total_nulls = min(total_rows, sql_nulls + pseudo_nulls)
        null_pct = round((total_nulls / total_rows) * 100, 2)

        is_candidate_key = (
            distinct_count == total_rows and total_nulls == 0 and total_rows > 1
        )

        # Fast type inference on sample (up to SAMPLE_SIZE rows)
        if total_rows > SAMPLE_SIZE:
            sample_subquery = f"(SELECT {quoted} FROM {view_name} WHERE {quoted} IS NOT NULL LIMIT {SAMPLE_SIZE})"
        else:
            sample_subquery = f"(SELECT {quoted} FROM {view_name} WHERE {quoted} IS NOT NULL)"

        type_test_query = f"""
            SELECT
                COUNT(try_cast({quoted} AS BIGINT)) AS int_count,
                COUNT(try_cast({quoted} AS DOUBLE)) AS dbl_count,
                COUNT(try_cast({quoted} AS BOOLEAN)) AS bool_count,
                COUNT(*) AS sample_valid
            FROM {sample_subquery}
            WHERE lower(trim({str_val})) NOT IN ({','.join(f"'{t}'" for t in NULL_TOKENS)});
        """
        type_res = conn.execute(type_test_query).fetchone()
        int_valid = type_res[0] or 0
        dbl_valid = type_res[1] or 0
        bool_valid = type_res[2] or 0
        sample_valid = type_res[3] or 0

        inferred_type = "string"
        numeric_stats = None
        formats = []
        timezone_evidence = None
        day_month_ambiguous = False

        if sample_valid > 0 and (int_valid / sample_valid) >= 0.85:
            inferred_type = "integer"
            num_q = f"""
                SELECT
                    MIN(try_cast({quoted} AS BIGINT)),
                    MAX(try_cast({quoted} AS BIGINT)),
                    MEDIAN(try_cast({quoted} AS BIGINT)),
                    SUM(CASE WHEN try_cast({quoted} AS BIGINT) < 0 THEN 1 ELSE 0 END)
                FROM {view_name}
                WHERE try_cast({quoted} AS BIGINT) IS NOT NULL;
            """
            num_res = conn.execute(num_q).fetchone()
            neg_count = num_res[3] or 0
            numeric_stats = NumericStats(
                min=float(num_res[0]) if num_res[0] is not None else None,
                max=float(num_res[1]) if num_res[1] is not None else None,
                median=float(num_res[2]) if num_res[2] is not None else None,
                negatives=neg_count,
                negative_pct=round((neg_count / (non_null_count or 1)) * 100, 2),
            )
        elif sample_valid > 0 and (dbl_valid / sample_valid) >= 0.85:
            inferred_type = "double"
            num_q = f"""
                SELECT
                    MIN(try_cast({quoted} AS DOUBLE)),
                    MAX(try_cast({quoted} AS DOUBLE)),
                    MEDIAN(try_cast({quoted} AS DOUBLE)),
                    SUM(CASE WHEN try_cast({quoted} AS DOUBLE) < 0 THEN 1 ELSE 0 END)
                FROM {view_name}
                WHERE try_cast({quoted} AS DOUBLE) IS NOT NULL;
            """
            num_res = conn.execute(num_q).fetchone()
            neg_count = num_res[3] or 0
            numeric_stats = NumericStats(
                min=round(float(num_res[0]), 4) if num_res[0] is not None else None,
                max=round(float(num_res[1]), 4) if num_res[1] is not None else None,
                median=round(float(num_res[2]), 4) if num_res[2] is not None else None,
                negatives=neg_count,
                negative_pct=round((neg_count / (non_null_count or 1)) * 100, 2),
            )
        elif sample_valid > 0 and (bool_valid / sample_valid) >= 0.95:
            inferred_type = "boolean"
        else:
            # Check date formats on sample
            fmt_cases = ", ".join(
                [f"COUNT(try_strptime(trim({quoted}), '{fmt}')) AS fmt_{i}"
                 for i, fmt in enumerate(COMMON_DATE_FORMATS)]
            )
            date_q = f"SELECT {fmt_cases} FROM {sample_subquery};"
            try:
                date_res = conn.execute(date_q).fetchone()
                sample_tested = sample_valid
                if sample_tested > 0:
                    for i, fmt in enumerate(COMMON_DATE_FORMATS):
                        matched = date_res[i] or 0
                        pct = round((matched / sample_tested) * 100, 2)
                        if pct >= 2.0:
                            formats.append(DateFormatMatch(format=fmt, match_pct=pct))

                    if formats:
                        inferred_type = "timestamp"
                        formats.sort(key=lambda x: x.match_pct, reverse=True)

                        tz_q = f"""
                            SELECT
                                SUM(CASE WHEN {quoted} LIKE '%Z' THEN 1 ELSE 0 END) AS z_count,
                                SUM(CASE WHEN {quoted} ~ '[+-][0-9]{{2}}:[0-9]{{2}}$' THEN 1 ELSE 0 END) AS offset_count
                            FROM {sample_subquery};
                        """
                        tz_res = conn.execute(tz_q).fetchone()
                        z_cnt = tz_res[0] or 0
                        offset_cnt = tz_res[1] or 0
                        if z_cnt > 0 and offset_cnt == 0:
                            timezone_evidence = "UTC (Z suffix)"
                        elif offset_cnt > 0 and z_cnt == 0:
                            timezone_evidence = "offset"
                        elif offset_cnt > 0 and z_cnt > 0:
                            timezone_evidence = "mixed"
                        else:
                            timezone_evidence = "naive"

                        amb_q = f"""
                            SELECT
                                COUNT(try_strptime({quoted}, '%d/%m/%Y')) AS dm_cnt,
                                COUNT(try_strptime({quoted}, '%m/%d/%Y')) AS md_cnt
                            FROM {sample_subquery}
                            WHERE {quoted} LIKE '%/%/%';
                        """
                        amb_res = conn.execute(amb_q).fetchone()
                        dm_c = amb_res[0] or 0
                        md_c = amb_res[1] or 0
                        if dm_c > 0 and dm_c == md_c:
                            day_month_ambiguous = True
            except Exception as e:
                pass

        # Fast sample values
        sample_q = f"""
            SELECT DISTINCT {quoted}
            FROM (SELECT {quoted} FROM {view_name} WHERE {quoted} IS NOT NULL LIMIT 2000)
            WHERE lower(trim({str_val})) NOT IN ({','.join(f"'{t}'" for t in NULL_TOKENS)})
            LIMIT 5;
        """
        sample_rows = conn.execute(sample_q).fetchall()
        sample_values = [str(r[0]) for r in sample_rows]

        profiles[col] = ColumnProfile(
            name=col,
            inferred_type=inferred_type,
            total_count=total_rows,
            nulls=total_nulls,
            null_pct=null_pct,
            null_tokens=token_counts,
            distinct_count=distinct_count,
            candidate_key=is_candidate_key,
            whitespace_issues=ws_issues,
            casing_issues=0,
            numeric_stats=numeric_stats,
            formats=formats,
            timezone_evidence=timezone_evidence,
            day_month_ambiguous=day_month_ambiguous,
            sample_values=sample_values,
        )

    duration = time.perf_counter() - t_start
    print(f"Fast profiling completed in {duration:.2f}s!")
    return profiles, duration

if __name__ == '__main__':
    profiles, d = profile_fast('data/benchmarks/events_1gb.parquet')
    for c, p in profiles.items():
        print(f"  {c}: type={p.inferred_type}, distinct={p.distinct_count}, nulls={p.nulls}")
