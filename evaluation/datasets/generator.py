"""Clean dataset generator for baseline benchmarks and evaluation."""

from __future__ import annotations
import csv
import os
import random
import time
from datetime import datetime, timedelta
from pathlib import Path


def generate_events(
    target_path: str | Path,
    num_rows: int = 100_000,
    seed: int = 42,
) -> Path:
    """Generate clean events dataset."""
    random.seed(seed)
    path = Path(target_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    event_types = ["page_view", "click", "signup", "checkout", "search", "logout"]
    platforms = ["web", "ios", "android", "macos", "windows"]
    base_time = datetime(2025, 1, 1, 0, 0, 0)

    fieldnames = [
        "event_id",
        "user_id",
        "event_type",
        "timestamp",
        "platform",
        "session_duration_sec",
    ]

    with open(path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(fieldnames)
        for i in range(num_rows):
            event_id = f"evt_{i + 1000000}"
            user_id = f"usr_{random.randint(1000, 50000)}"
            event_type = random.choice(event_types)
            ts = (base_time + timedelta(seconds=random.randint(0, 31536000))).strftime(
                "%Y-%m-%d %H:%M:%S"
            )
            platform = random.choice(platforms)
            duration = random.randint(1, 3600)
            writer.writerow([event_id, user_id, event_type, ts, platform, duration])

    return path


def generate_transactions(
    target_path: str | Path,
    num_rows: int = 100_000,
    seed: int = 42,
) -> Path:
    """Generate clean transactions dataset."""
    random.seed(seed)
    path = Path(target_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    currencies = ["USD", "EUR", "GBP", "CAD", "AUD"]
    statuses = ["completed", "pending", "failed", "refunded"]
    payment_methods = ["credit_card", "paypal", "apple_pay", "bank_transfer"]
    base_time = datetime(2025, 1, 1, 0, 0, 0)

    fieldnames = [
        "transaction_id",
        "customer_id",
        "amount",
        "currency",
        "status",
        "payment_method",
        "created_at",
    ]

    with open(path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(fieldnames)
        for i in range(num_rows):
            txn_id = f"txn_{i + 5000000}"
            cust_id = f"cst_{random.randint(500, 30000)}"
            amount = round(random.uniform(5.0, 1500.0), 2)
            currency = random.choice(currencies)
            status = random.choice(statuses)
            method = random.choice(payment_methods)
            ts = (base_time + timedelta(seconds=random.randint(0, 31536000))).strftime(
                "%Y-%m-%d %H:%M:%S"
            )
            writer.writerow([txn_id, cust_id, amount, currency, status, method, ts])

    return path


def generate_reviews(
    target_path: str | Path,
    num_rows: int = 100_000,
    seed: int = 42,
) -> Path:
    """Generate clean ratings/reviews dataset."""
    random.seed(seed)
    path = Path(target_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    base_time = datetime(2025, 1, 1, 0, 0, 0)
    fieldnames = [
        "review_id",
        "product_id",
        "user_id",
        "rating",
        "helpful_votes",
        "review_date",
    ]

    with open(path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(fieldnames)
        for i in range(num_rows):
            rev_id = f"rev_{i + 100000}"
            prod_id = f"prd_{random.randint(100, 5000)}"
            user_id = f"usr_{random.randint(1000, 50000)}"
            rating = random.randint(1, 5)
            helpful = random.randint(0, 250)
            rev_date = (base_time + timedelta(days=random.randint(0, 365))).strftime(
                "%Y-%m-%d"
            )
            writer.writerow([rev_id, prod_id, user_id, rating, helpful, rev_date])

    return path


if __name__ == "__main__":
    out_dir = Path("data/samples")
    out_dir.mkdir(parents=True, exist_ok=True)
    print("Generating sample clean datasets...")
    generate_events(out_dir / "clean_events_100k.csv", num_rows=100_000)
    generate_transactions(out_dir / "clean_transactions_100k.csv", num_rows=100_000)
    generate_reviews(out_dir / "clean_reviews_100k.csv", num_rows=100_000)
    print("Generation complete.")
