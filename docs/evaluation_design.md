# Evaluation Harness Design Note

## 1. Ground Truth & Corruption Methodology

The evaluation harness measures whether the profiler, recipe generator, compiler, and verification tests perform accurately against verifiable ground-truth datasets.

### Workflow:
1. **Source Clean Datasets**: Maintain clean baseline datasets (events, retail transactions, ratings/reviews).
2. **Inject Controlled Corruptions**: A reproducible script (`evaluation/injector.py`) takes a seed and corrupts clean data, generating:
   - Corrupted CSV dataset.
   - Ground-truth **manifest** detailing row index, column name, original value, corrupted value, and corruption type.
3. **Execute Cleaning Pipeline**: Run conversion, profiling, recipe generation, SQL compilation, execution, and verification.
4. **Score Accuracy**: Compare output against the original clean data and the corruption manifest.

---

## 2. Injected Corruption Types

| Corruption Category | Specific Variants | Detection Target |
|---|---|---|
| **Null-like Tokens** | `'N/A'`, `'NA'`, `'none'`, `'null'`, `'-'`, `'?'`, empty strings `''` | Identify pseudo-null strings across columns |
| **Random Nulls** | Systematic null rates (1%, 5%, 12%, 30%) | Validate null detection and imputation policy |
| **Duplicates** | Exact row duplicates (1%, 5%, 10%); near duplicates with whitespace/casing differences | Deduplication recall without dropping non-duplicates |
| **Date/Time Formats** | Mixed formats (`%d/%m/%Y`, `%Y-%m-%d`, `%m/%d/%Y`, timestamps with `Z` or `+05:00` offsets) | Detect multi-format distributions and day/month ambiguity |
| **Outliers & Negatives** | Unrealistic bounds (e.g., negative ages `-4`, extreme values `311`) | Numeric outlier detection via range/IQR |
| **Whitespace & Case** | Leading/trailing spaces, inconsistent capitalization (`"US"`, `"us "`, `" Us"`) | Trimming & normalization detection |
| **Type Contamination** | Alphanumeric tokens in integer/float columns (`"12O"`, `"$45.00"`) | `try_cast` candidate type detection & rejection logging |

---

## 3. Metrics to Measure

### Profiler
- **Detection Precision & Recall**: Per corruption type and per column.

### Recipe & Cleaning
- **Rule Selection Accuracy**: Precision and recall of suggested macro rules compared to the injected corruption types.
- **Data Recovery Rate**: Percentage of corrupted cells restored to ground truth.
- **Collateral Damage**: Percentage of originally clean cells altered (target: < 0.01%).
- **Duplicate Removal Precision / Recall**: True duplicate rows removed vs non-duplicates preserved.
- **Ambiguity Escalation Rate**: Fraction of ambiguous cases correctly flagged for human confirmation.

### System & Performance
- **Throughput**: Rows per second across 1 GB, 5 GB, and 10 GB benchmarks.
- **Peak RAM & Disk Spilling**: Maximum memory used and scratch disk footprint under configured limits (`SET memory_limit = '8GB'`).
- **LLM Reliability**: First-turn valid JSON recipe generation rate vs validation retry rate.
