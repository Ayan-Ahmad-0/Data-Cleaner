import time
import sys
from pathlib import Path
import duckdb
from core.profiler import Profiler, NULL_TOKENS, DISPLAY_TOKEN_MAP, COMMON_DATE_FORMATS

def log(msg):
    print(msg, flush=True)

dst = Path('data/benchmarks/events_1gb.parquet')
profiler = Profiler()

conn = profiler._get_connection()
pq_sql = str(dst.resolve()).replace('\\', '/')
view_name = 'raw_data'
conn.execute(f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM read_parquet('{pq_sql}');")

t0 = time.time()
log('1. Counting rows...')
total_rows = conn.execute(f'SELECT COUNT(*) FROM {view_name}').fetchone()[0]
log(f'Rows: {total_rows} in {time.time()-t0:.2f}s')

t0 = time.time()
log('2. Duplicate detection...')
desc = conn.execute(f'DESCRIBE {view_name}').fetchall()
column_names = [col[0] for col in desc]
cols_quoted = ', '.join(f'"{col}"' for col in column_names)
exact_dup_rows = conn.execute(f'SELECT COUNT(*) - COUNT(DISTINCT hash({cols_quoted})) FROM {view_name}').fetchone()[0]
log(f'Exact dup rows: {exact_dup_rows} in {time.time()-t0:.2f}s')

for col in column_names:
    log(f'Profiling column: {col}...')
    quoted = f'"{col}"'
    str_val = f"try_cast({quoted} AS VARCHAR)"

    t0 = time.time()
    log('  - Subquery 1 (nulls, distinct, ws, tokens)...')
    token_cases = ", ".join(
        [f"SUM(CASE WHEN lower(trim({str_val})) = '{tok}' THEN 1 ELSE 0 END) AS tok_{i}"
         for i, tok in enumerate(NULL_TOKENS)]
    )
    query = f"""
        SELECT
            COUNT({quoted}) AS non_null_count,
            COUNT(DISTINCT {quoted}) AS distinct_count,
            SUM(CASE WHEN {quoted} IS NOT NULL AND length({str_val}) != length(trim({str_val})) THEN 1 ELSE 0 END) AS ws_issues,
            {token_cases}
        FROM {view_name};
    """
    res = conn.execute(query).fetchone()
    log(f'    Subquery 1 took {time.time()-t0:.2f}s (distinct={res[1]})')

    t0 = time.time()
    log('  - Subquery 2 (type test query)...')
    type_test_query = f"""
        SELECT
            COUNT(try_cast({quoted} AS BIGINT)) AS int_count,
            COUNT(try_cast({quoted} AS DOUBLE)) AS dbl_count,
            COUNT(try_cast({quoted} AS BOOLEAN)) AS bool_count
        FROM {view_name}
        WHERE {quoted} IS NOT NULL AND lower(trim({str_val})) NOT IN ({','.join(f"'{t}'" for t in NULL_TOKENS)});
    """
    type_res = conn.execute(type_test_query).fetchone()
    log(f'    Subquery 2 took {time.time()-t0:.2f}s')

    t0 = time.time()
    log('  - Subquery 3 (sample values)...')
    sample_q = f"""
        SELECT DISTINCT {quoted}
        FROM {view_name}
        WHERE {quoted} IS NOT NULL
          AND lower(trim({str_val})) NOT IN ({','.join(f"'{t}'" for t in NULL_TOKENS)})
        LIMIT 5;
    """
    sample_rows = conn.execute(sample_q).fetchall()
    log(f'    Subquery 3 took {time.time()-t0:.2f}s')

conn.close()
log('ALL DONE!')
