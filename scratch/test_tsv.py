import duckdb
from pathlib import Path

con = duckdb.connect()
con.execute("CREATE TABLE t AS SELECT 1 as id, 'hello' as msg")
con.execute("COPY t TO 'scratch/test_tsv.tsv' (FORMAT CSV, DELIMITER '\t', HEADER true);")
p = Path('scratch/test_tsv.tsv')
print("Content:\n" + p.read_text())
p.unlink()
