# 1. Update ConvertPage.tsx
convert_path = 'frontend/src/pages/ConvertPage.tsx'
with open(convert_path, 'r', encoding='utf-8') as f:
    convert_code = f.read()

t1 = "High-performance, in-process format conversion powered by DuckDB."
r1 = "High-performance, in-process format conversion."
assert t1 in convert_code, "t1 not found in ConvertPage.tsx"
convert_code = convert_code.replace(t1, r1, 1)

t2 = "Converting via DuckDB streaming engine · Zero-copy"
r2 = "Converting via streaming engine · Zero-copy"
if t2 in convert_code:
    convert_code = convert_code.replace(t2, r2, 1)

t3 = "Engine: In-process streaming DuckDB"
r3 = "Engine: In-process streaming"
if t3 in convert_code:
    convert_code = convert_code.replace(t3, r3, 1)

t4 = "Dataset staged and converted via DuckDB columnar streaming"
r4 = "Dataset staged and converted via columnar streaming"
if t4 in convert_code:
    convert_code = convert_code.replace(t4, r4, 1)

with open(convert_path, 'w', encoding='utf-8', newline='') as f:
    f.write(convert_code)

print("Updated ConvertPage.tsx successfully")

# 2. Update QueryPage.tsx
query_path = 'frontend/src/pages/QueryPage.tsx'
with open(query_path, 'r', encoding='utf-8') as f:
    query_code = f.read()

qt1 = "Upload any dataset to ask questions in natural English with our AI Analyst or write sandboxed DuckDB SQL queries directly against your data without cleaning or converting."
qr1 = "Upload any dataset to ask questions in natural English with our AI Analyst or write sandboxed SQL queries directly against your data without cleaning or converting."
assert qt1 in query_code, "qt1 not found in QueryPage.tsx"
query_code = query_code.replace(qt1, qr1, 1)

qt2 = "Streaming dataset to DuckDB sandbox..."
qr2 = "Streaming dataset to sandbox..."
if qt2 in query_code:
    query_code = query_code.replace(qt2, qr2, 1)

with open(query_path, 'w', encoding='utf-8', newline='') as f:
    f.write(query_code)

print("Updated QueryPage.tsx successfully")
