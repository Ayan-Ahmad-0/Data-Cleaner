"""Chart AI package public exports (AI-assisted charts, auto-visualize, advice)."""

from charts_ai.errors import AIChartsDisabledError
from charts_ai.limits import ChartsAILimits
from charts_ai.models import (
    ChartFromTextResult,
    ChartRecommendation,
    DataPrepTip,
    VisualizationPlan,
)
from charts_ai.service import (
    auto_visualize,
    chart_from_text,
    plan_visualization,
)

__all__ = [
    "AIChartsDisabledError",
    "ChartsAILimits",
    "ChartRecommendation",
    "DataPrepTip",
    "VisualizationPlan",
    "ChartFromTextResult",
    "plan_visualization",
    "auto_visualize",
    "chart_from_text",
]
