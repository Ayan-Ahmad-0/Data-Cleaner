"""Chart specification models and schema validation."""

from __future__ import annotations
from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, Field, field_validator, model_validator

from charts.errors import InvalidChartSpecError
from charts.limits import ChartLimits

# Supported cast options
CastType = Literal["number", "date", "timestamp", "text"]

# Supported time buckets
TimeBucketType = Literal[
    "hour", "day", "week", "month", "quarter", "year",
    "hour_of_day", "day_of_week"
]

# Supported filter operators
FilterOp = Literal["=", "!=", "<", "<=", ">", ">=", "in", "between", "is_null", "not_null"]

# Supported chart types
ChartType = Literal[
    "bar", "hbar", "line", "area", "histogram", "scatter",
    "pie", "donut", "box", "heatmap", "big_number"
]

# Supported aggregations
AggregationType = Literal["count", "count_distinct", "sum", "avg", "min", "max", "median", "none"]

# Sort options
SortType = Literal["x", "y_desc", "y_asc"]


class FieldRef(BaseModel):
    """Reference to a dataset column with optional type-casting, bucketing, or binning."""
    column: str
    cast_as: Optional[CastType] = None
    time_bucket: Optional[TimeBucketType] = None
    bins: Optional[int] = Field(None, ge=5, le=200)

    @field_validator("column")
    @classmethod
    def validate_column_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Column name cannot be empty.")
        return v.strip()


class Filter(BaseModel):
    """Filter condition for chart data compilation."""
    column: str
    op: FilterOp
    value: Optional[Union[str, float, int, List[Union[str, float, int]]]] = None

    @field_validator("column")
    @classmethod
    def validate_filter_column(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Filter column name cannot be empty.")
        return v.strip()

    @model_validator(mode="after")
    def check_filter_value(self) -> Filter:
        if self.op in ("is_null", "not_null"):
            return self
        if self.op == "in":
            if not isinstance(self.value, list) or len(self.value) == 0:
                raise ValueError("Filter operator 'in' requires a non-empty list value.")
        elif self.op == "between":
            if not isinstance(self.value, list) or len(self.value) != 2:
                raise ValueError("Filter operator 'between' requires a list of exactly 2 values [min, max].")
        else:
            if self.value is None:
                raise ValueError(f"Filter operator '{self.op}' requires a value.")
        return self


class ChartSpec(BaseModel):
    """Specification of a chart to be compiled and rendered."""
    chart_type: ChartType
    x: Optional[FieldRef] = None
    y: Optional[FieldRef] = None
    color: Optional[FieldRef] = None
    aggregation: AggregationType = "count"
    filters: List[Filter] = Field(default_factory=list)
    sort: SortType = "y_desc"
    top_n: Optional[int] = Field(20, ge=1, le=50)
    log_y: bool = False
    title: Optional[str] = Field(None, max_length=120)
    exclude_nulls: bool = False
    hide_outliers: bool = False  # Clip numeric axes to 1st..99th percentile
    custom_color: Optional[str] = Field(None, max_length=32)

    @field_validator("filters")
    @classmethod
    def validate_filter_count(cls, v: List[Filter]) -> List[Filter]:
        if len(v) > ChartLimits().max_filters:
            raise ValueError(f"A maximum of {ChartLimits().max_filters} filters is allowed.")
        return v


def _is_numeric_type(dtype: str, cast_as: Optional[str]) -> bool:
    if cast_as == "number":
        return True
    if cast_as in ("date", "timestamp", "text"):
        return False
    dt = dtype.upper()
    numeric_prefixes = (
        "INT", "BIGINT", "SMALLINT", "TINYINT", "HUGEINT",
        "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC", "REAL"
    )
    return any(dt.startswith(p) for p in numeric_prefixes)


def _is_datetime_type(dtype: str, cast_as: Optional[str]) -> bool:
    if cast_as in ("date", "timestamp"):
        return True
    if cast_as in ("number", "text"):
        return False
    dt = dtype.upper()
    return any(keyword in dt for keyword in ("DATE", "TIME", "TIMESTAMP"))


def validate_spec(spec: ChartSpec, schema: Dict[str, str], limits: Optional[ChartLimits] = None) -> None:
    """Validate a ChartSpec against the active dataset schema and semantic rules.
    
    Args:
        spec: The ChartSpec to validate.
        schema: Mapping from column name to DuckDB type (e.g. {"age": "INTEGER", "city": "VARCHAR"}).
        limits: Optional custom ChartLimits instance.
    
    Raises:
        InvalidChartSpecError: If any structural, column-existence, or semantic rule fails.
    """
    lim = limits or ChartLimits()

    # 1. Validate column existence
    def check_col(field_ref: Optional[FieldRef], role: str) -> None:
        if field_ref is not None:
            if field_ref.column not in schema:
                raise InvalidChartSpecError(
                    f"Column '{field_ref.column}' used for {role} does not exist in dataset schema."
                )

    check_col(spec.x, "X axis")
    check_col(spec.y, "Y axis")
    check_col(spec.color, "Color / grouping")
    for f in spec.filters:
        if f.column not in schema:
            raise InvalidChartSpecError(f"Column '{f.column}' in filter does not exist in dataset schema.")

    # 2. Aggregations vs column types
    if spec.y is not None:
        y_type = schema[spec.y.column]
        is_num = _is_numeric_type(y_type, spec.y.cast_as)
        if spec.aggregation in ("sum", "avg", "median") and not is_num:
            if y_type.upper() == "VARCHAR":
                spec.y.cast_as = "number"
                is_num = True
            else:
                raise InvalidChartSpecError(
                    f"Aggregation '{spec.aggregation}' requires a numeric column, but '{spec.y.column}' is '{y_type}'."
                )

    # 3. Time bucket requires datetime (or cast_as date/timestamp)
    for field_ref, role in ((spec.x, "X axis"), (spec.y, "Y axis")):
        if field_ref and field_ref.time_bucket:
            col_type = schema[field_ref.column]
            if not _is_datetime_type(col_type, field_ref.cast_as):
                raise InvalidChartSpecError(
                    f"Time bucket '{field_ref.time_bucket}' on {role} requires a date or timestamp column, but '{field_ref.column}' is '{col_type}'. Use cast_as='date' or 'timestamp'."
                )

    # 4. Chart-type semantic rules
    ctype = spec.chart_type

    if ctype in ("pie", "donut"):
        name_label = "Donut" if ctype == "donut" else "Pie"
        if spec.x is None:
            raise InvalidChartSpecError(f"{name_label} chart requires a categorical X axis column.")
        if spec.aggregation == "none":
            raise InvalidChartSpecError(f"{name_label} chart requires an aggregation (such as 'count' or 'sum').")
        if spec.top_n and spec.top_n > lim.max_pie_slices:
            raise InvalidChartSpecError(f"{name_label} chart allows at most {lim.max_pie_slices} slices.")

    elif ctype == "histogram":
        if spec.x is None:
            raise InvalidChartSpecError("Histogram requires an X axis column.")
        x_type = schema[spec.x.column]
        if not _is_numeric_type(x_type, spec.x.cast_as):
            raise InvalidChartSpecError(
                f"Histogram requires a numeric X axis column, but '{spec.x.column}' is '{x_type}'."
            )

    elif ctype == "scatter":
        if spec.x is None or spec.y is None:
            raise InvalidChartSpecError("Scatter plot requires both X and Y axis columns.")
        x_type = schema[spec.x.column]
        y_type = schema[spec.y.column]
        if not _is_numeric_type(x_type, spec.x.cast_as):
            if x_type.upper() == "VARCHAR":
                spec.x.cast_as = "number"
            else:
                raise InvalidChartSpecError(
                    f"Scatter plot requires a numeric X column, but '{spec.x.column}' is '{x_type}'."
                )
        if not _is_numeric_type(y_type, spec.y.cast_as):
            if y_type.upper() == "VARCHAR":
                spec.y.cast_as = "number"
            else:
                raise InvalidChartSpecError(
                    f"Scatter plot requires a numeric Y column, but '{spec.y.column}' is '{y_type}'."
                )

    elif ctype == "box":
        if spec.y is None:
            raise InvalidChartSpecError("Box plot requires a numeric Y axis column.")
        y_type = schema[spec.y.column]
        if not _is_numeric_type(y_type, spec.y.cast_as):
            if y_type.upper() == "VARCHAR":
                spec.y.cast_as = "number"
            else:
                raise InvalidChartSpecError(
                    f"Box plot requires a numeric Y axis column, but '{spec.y.column}' is '{y_type}'."
                )

    elif ctype == "heatmap":
        if spec.x is None or spec.y is None:
            raise InvalidChartSpecError("Heatmap requires both X and Y axis columns.")

    elif ctype == "big_number":
        if spec.x is not None:
            raise InvalidChartSpecError("Big number cards show a single summary metric and cannot take an X axis.")
        if spec.aggregation == "none":
            raise InvalidChartSpecError("Big number card requires an aggregate function (e.g. 'count', 'sum').")

    elif ctype in ("line", "area"):
        if spec.x is None:
            raise InvalidChartSpecError(f"{ctype.capitalize()} chart requires an X axis column.")
