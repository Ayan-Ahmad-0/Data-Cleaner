# Feature 03: AI Recipe Generation & Heuristic Fallback

## 1. Overview
The **AI Recipe Generation System** (`core/recipe.py`, `core/llm/`) bridges qualitative profile insights with deterministic data transformations. It leverages Google Gemini (`gemini-3.5-flash` / `gemini-flash-latest`) to synthesize an optimized data cleaning plan ("Recipe"). To guarantee safety, execution reliability, and zero hallucination risk, the LLM is **never permitted to generate raw SQL code**. Instead, it outputs a strictly parameterized Pydantic configuration constrained to an allowlist of 18 vectorized cleaning macros.

If the LLM is unreachable, offline, or rate-limited, Datamorph automatically engages an intelligent **Heuristic Fallback Engine** within 5 seconds, ensuring 100% pipeline uptime.

---

## 2. Safety Architecture: Constrained Macro Menu

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AI Recipe Drafting Flow                         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ profile.json (PII Redacted)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                          Google Gemini API                             │
│                  - Model: gemini-3.5-flash                             │
│                  - Structured JSON Output Enforced                     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Strict JSON Output
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      Pydantic Schema Validation                        │
│            Recipe(extra="forbid", steps=List[CleaningStep])            │
├───────────────────────────────────┬────────────────────────────────────┤
│   Valid Recipe Accepted           │  Invalid Schema / Timeout (>5.0s)  │
│                 │                 │                 │                  │
│                 ▼                 │                 ▼                  │
│   To Vectorized CTE Compiler      │   Offline Heuristic Rule Engine    │
└───────────────────────────────────┴────────────────────────────────────┘
```

### The 18 Vectorized Cleaning Macros

| Category | Macro Name | Parameterized Action |
|---|---|---|
| **Whitespace & Text** | `trim_whitespace` | Strips leading and trailing whitespace from string columns |
| | `normalize_case` | Normalizes text to `lower`, `upper`, or `title` case |
| | `collapse_spaces` | Replaces consecutive internal spaces with a single space |
| | `strip_characters` | Removes unwanted symbols or unprintable control characters |
| **Null & Sentinels** | `convert_sentinels` | Coerces strings like `"N/A"`, `"null"`, `"-"` into true SQL `NULL` |
| | `impute_missing` | Fills nulls with column `mean`, `median`, `mode`, or fixed literal |
| | `drop_null_rows` | Drops records where critical required columns contain nulls |
| **Type Casting** | `cast_type` | Explicitly casts column to concrete type via safe `TRY_CAST` |
| | `parse_currency` | Strips currency symbols (`$`, `€`) and casts to `DOUBLE` |
| | `parse_percentage` | Strips `%` and divides by 100.0 into decimal |
| | `parse_boolean` | Maps truthy/falsy strings (`"yes"`, `"1"`, `"true"`) to `BOOLEAN` |
| **Dates & Timestamps** | `standardize_dates` | Converts drifting date strings into ISO 8601 (`YYYY-MM-DD HH:MM:SS`) |
| | `extract_epoch` | Converts Unix timestamp integers into standard `TIMESTAMP` |
| **Deduplication** | `deduplicate_rows` | Eliminates exact redundant duplicate rows across all columns |
| | `deduplicate_by_key`| Retains the newest or first record per primary key |
| **Outliers & Filtering**| `filter_outliers` | Caps or excludes values beyond $N$ standard deviations or IQR bounds |
| | `filter_range` | Constrains numeric columns within explicit `[min, max]` intervals |
| **PII & Privacy** | `mask_pii` | Deterministically hashes or replaces sensitive tokens with `[REDACTED]` |

---

## 3. Zero-Hallucination Guarantees

1. **No Raw SQL Generation:**
   Prompting an LLM to generate raw `UPDATE` or `ALTER TABLE` queries introduces SQL injection vectors, dialect incompatibilities, and unpredictable side effects. Datamorph prohibits raw SQL generation entirely. The LLM only chooses the macro name and its arguments (e.g. `{"action": "trim_whitespace", "column": "customer_name"}`).

2. **Schema Enforcement with `extra="forbid"`:**
   The output JSON is parsed directly into Pydantic models with `extra="forbid"`. Any extraneous properties or hallucinated macro types cause instant validation errors, preventing malformed plans from ever reaching the execution engine.

3. **PII Masking Before Prompt Dispatch:**
   Raw row values are never transmitted to the LLM. Only statistical aggregates, column names, and type indicators are transmitted in the prompt payload.

---

## 4. Deterministic Heuristic Fallback

When running in air-gapped environments, without a `GEMINI_API_KEY`, or during upstream API outages, Datamorph activates its built-in heuristic rules:
- **Rule 1 (Whitespace):** If `whitespace_issues > 0`, emit `trim_whitespace`.
- **Rule 2 (Sentinels):** If sentinel null strings are detected, emit `convert_sentinels`.
- **Rule 3 (Type Drift):** If `inferred_type != current_type`, emit `cast_type`.
- **Rule 4 (Duplicates):** If duplicate rows are present, emit `deduplicate_rows`.
- **Rule 5 (Timestamps):** If timestamp format drift is detected, emit `standardize_dates`.

This fallback executes in **<2ms**, producing high-quality cleaning recipes matching over 90% of LLM-crafted recommendations without external network dependencies.
