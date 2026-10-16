"""Synthetic data corruption injector with ground-truth manifest generation."""

from __future__ import annotations
import csv
import json
import random
from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class CorruptionRecord:
    row_index: int
    column_name: str
    original_value: Any
    corrupted_value: Any
    corruption_type: str


@dataclass
class InjectionConfig:
    seed: int = 42
    null_token_rate: float = 0.05
    null_token_choices: Tuple[str, ...] = ("N/A", "none", "null", "-", "?", "")
    exact_duplicate_rate: float = 0.03
    near_duplicate_rate: float = 0.02
    whitespace_rate: float = 0.04
    negative_outlier_rate: float = 0.02
    mixed_date_rate: float = 0.30
    date_columns: Tuple[str, ...] = ("timestamp", "created_at", "review_date", "signup_date")
    numeric_columns: Tuple[str, ...] = ("session_duration_sec", "amount", "helpful_votes", "age", "score")


class CorruptionInjector:
    """Injects controlled data corruptions into clean CSV datasets and logs a manifest."""

    def __init__(self, config: Optional[InjectionConfig] = None) -> None:
        self.config = config or InjectionConfig()

    def inject_from_file(
        self,
        input_csv: str | Path,
        output_csv: str | Path,
        manifest_json: str | Path,
    ) -> Tuple[int, List[CorruptionRecord]]:
        random.seed(self.config.seed)
        input_path = Path(input_csv).resolve()
        output_path = Path(output_csv).resolve()
        manifest_path = Path(manifest_json).resolve()

        output_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.parent.mkdir(parents=True, exist_ok=True)

        with open(input_path, mode="r", newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            header = next(reader)
            rows = [row for row in reader]

        manifest: List[CorruptionRecord] = []
        corrupted_rows: List[List[str]] = []

        for row_idx, row in enumerate(rows):
            new_row = list(row)
            for col_idx, col_name in enumerate(header):
                orig_val = row[col_idx]
                val = orig_val

                # 1. Whitespace padding on strings
                if random.random() < self.config.whitespace_rate and val.strip():
                    pad_type = random.choice(["leading", "trailing", "both"])
                    if pad_type == "leading":
                        val = "  " + val
                    elif pad_type == "trailing":
                        val = val + "   "
                    else:
                        val = " " + val + " "
                    manifest.append(CorruptionRecord(
                        row_index=row_idx,
                        column_name=col_name,
                        original_value=orig_val,
                        corrupted_value=val,
                        corruption_type="whitespace_issue"
                    ))

                # 2. Null-like tokens
                if random.random() < self.config.null_token_rate:
                    token = random.choice(self.config.null_token_choices)
                    manifest.append(CorruptionRecord(
                        row_index=row_idx,
                        column_name=col_name,
                        original_value=val,
                        corrupted_value=token,
                        corruption_type="null_token"
                    ))
                    val = token

                # 3. Numeric negative outliers
                if (col_name in self.config.numeric_columns and
                        random.random() < self.config.negative_outlier_rate and
                        val not in self.config.null_token_choices):
                    try:
                        num = float(val.strip())
                        neg_val = str(-abs(int(num)) if num.is_integer() else -abs(num))
                        manifest.append(CorruptionRecord(
                            row_index=row_idx,
                            column_name=col_name,
                            original_value=val,
                            corrupted_value=neg_val,
                            corruption_type="negative_outlier"
                        ))
                        val = neg_val
                    except ValueError:
                        pass

                # 4. Mixed date formatting & ambiguity
                if (col_name in self.config.date_columns and
                        random.random() < self.config.mixed_date_rate and
                        val not in self.config.null_token_choices):
                    try:
                        clean_dt_str = val.strip()
                        # Parse known standard formats
                        parsed_dt = None
                        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
                            try:
                                parsed_dt = datetime.strptime(clean_dt_str, fmt)
                                break
                            except ValueError:
                                continue

                        if parsed_dt:
                            # Reformat into ambiguous DD/MM or slash formats
                            new_fmt = random.choice(("%d/%m/%Y", "%d/%m/%Y %H:%M:%S", "%Y/%m/%d"))
                            alt_date_str = parsed_dt.strftime(new_fmt)
                            manifest.append(CorruptionRecord(
                                row_index=row_idx,
                                column_name=col_name,
                                original_value=val,
                                corrupted_value=alt_date_str,
                                corruption_type="mixed_date_format"
                            ))
                            val = alt_date_str
                    except Exception:
                        pass

                new_row[col_idx] = val
            corrupted_rows.append(new_row)

        # 5. Inject exact duplicates
        num_exact_dups = int(len(corrupted_rows) * self.config.exact_duplicate_rate)
        dup_indices = random.sample(range(len(corrupted_rows)), min(num_exact_dups, len(corrupted_rows)))
        for idx in dup_indices:
            dup_row = list(corrupted_rows[idx])
            corrupted_rows.append(dup_row)
            manifest.append(CorruptionRecord(
                row_index=len(corrupted_rows) - 1,
                column_name="__row__",
                original_value=None,
                corrupted_value=dup_row[0] if dup_row else "",
                corruption_type="exact_duplicate"
            ))

        # 6. Inject near duplicates (same key, modified casing or whitespace in other cols)
        num_near_dups = int(len(rows) * self.config.near_duplicate_rate)
        near_indices = random.sample(range(len(rows)), min(num_near_dups, len(rows)))
        for idx in near_indices:
            near_row = list(corrupted_rows[idx])
            # Modify non-key column
            if len(near_row) > 2:
                near_row[2] = near_row[2].upper() + " "
            corrupted_rows.append(near_row)
            manifest.append(CorruptionRecord(
                row_index=len(corrupted_rows) - 1,
                column_name="__row__",
                original_value=None,
                corrupted_value=near_row[0] if near_row else "",
                corruption_type="near_duplicate"
            ))

        # Write corrupted CSV
        with open(output_path, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(header)
            writer.writerows(corrupted_rows)

        # Save manifest
        manifest_data = {
            "config": asdict(self.config),
            "original_rows": len(rows),
            "total_corrupted_rows": len(corrupted_rows),
            "total_corruptions": len(manifest),
            "corruptions_by_type": {},
            "records": [asdict(r) for r in manifest],
        }

        counts: Dict[str, int] = {}
        for r in manifest:
            counts[r.corruption_type] = counts.get(r.corruption_type, 0) + 1
        manifest_data["corruptions_by_type"] = counts

        with open(manifest_path, mode="w", encoding="utf-8") as f:
            json.dump(manifest_data, f, indent=2)

        return len(corrupted_rows), manifest
