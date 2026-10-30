import duckdb
conn = duckdb.connect()
print(conn.execute("SELECT hash(1, 'test', 3.5)").fetchall())
