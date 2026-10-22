"""Limits configuration for chart compilation, execution, and rendering."""

from dataclasses import dataclass


@dataclass
class ChartLimits:
    """Resource and rendering caps for chart execution."""
    max_points_line: int = 2000
    max_categories_bar: int = 50       # maximum allowed top_n (default 20)
    max_pie_slices: int = 6
    max_series_color: int = 12
    scatter_sample_size: int = 5000     # default sample size
    scatter_max_sample_size: int = 10000
    histogram_default_bins: int = 30
    histogram_max_bins: int = 200
    heatmap_max_cells: int = 900        # e.g. 30x30
    chart_query_timeout_seconds: float = 60.0
    stats_query_timeout_seconds: float = 120.0
    max_filters: int = 10
    chart_cache_ttl_seconds: int = 600
