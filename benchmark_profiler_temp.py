import time
from pathlib import Path
from core.profiler import Profiler, NULL_TOKENS, COMMON_DATE_FORMATS

profiler = Profiler()
conn = profiler._get_connection()
dst = Path('data/benchmarks/events_1gb.parquet')
pq_sql = str(dst.resolve()).replace('\\', '/')
view_name = 'raw_data'
conn.execute(f"CREATE OR REPLACE VIEW {view_name} AS SELECT * FROM read_parquet('{pq_sql}');")

desc = conn.execute(f"DESCRIBE {view_name}").fetchall()
column_names = [col[0] for col in desc]
total_rows = conn.execute(f"SELECT COUNT(*) FROM {view_name}").fetchone()[0]

print(f"Total rows: {total_rows}")

# Step 1: Duplicate detection
t0 = time.time()
cols_quoted = ", ".join(f'"{col}"' for col in column_names)
exact_dup_rows = conn.execute(
    f"SELECT COUNT(*) - COUNT(DISTINCT hash({cols_quoted})) FROM {view_name}"
).fetchone()[0]
print(f"Duplicate hash took: {time.time()-t0:.2f}s (result: {exact_dup_rows})")

# Step 2: Per-column queries
for col in column_names:
    quoted = f'"{col}"'
    str_val = f"try_cast({quoted} AS VARCHAR)"

    # Q1: null, distinct, whitespace, token cases
    t0 = time.time()
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
    q1_time = time.time() - t0

    # Q2: type inference counts
    t0 = time.time()
    type_test_query = f"""
        SELECT
            COUNT(try_cast({quoted} AS BIGINT)) AS int_count,
            COUNT(try_cast({quoted} AS DOUBLE)) AS dbl_count,
            COUNT(try_cast({quoted} AS BOOLEAN)) AS bool_count
        FROM {view_name}
        WHERE {quoted} IS NOT NULL AND lower(trim({str_val})) NOT IN ({','.join(f"'{t}'" for t in NULL_TOKENS)});
    """
    type_res = conn.execute(type_test_query).fetchone()
    q2_time = time.time() - t0

    # Q3: stats (either numeric or date)
    t0 = time.time()
    # Let's see how long date or numeric takes
    num_q = f"""
        SELECT
            MIN(try_cast({quoted} AS BIGINT)),
            MAX(try_cast({quoted} AS BIGINT)),
            MEDIAN(try_cast({quoted} AS BIGINT)),
            SUM(CASE WHEN try_cast({quoted} AS BIGINT) < 0 THEN 1 ELSE 0 END)
        FROM {view_name}
        WHERE try_cast({quoted} AS BIGINT) IS NOT NULL;
    """
    conn.execute(num_q).fetchone()
    q3_time = time.time() - t0

    print(f"Col '{col}': Q1={q1_time:.2f}s, Q2={q2_time:.2f}s, Q3={q3_time:.2f}s | Total col = {q1_time+q2_time+q3_time:.2f}s", flush=True)

conn.close()
