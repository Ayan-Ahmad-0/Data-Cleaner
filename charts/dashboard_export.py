"""Standalone Executive Dashboard HTML Generator.

Generates self-contained, interactive HTML dashboards with embedded Plotly charts,
executive summary KPI headers, dark/light theme switching, and print-ready PDF styling.
"""

from __future__ import annotations
import json
import time
from typing import Any, Dict, List, Optional


def generate_dashboard_html(
    title: str,
    dataset_name: str,
    cards_data: List[Dict[str, Any]],
    metadata: Optional[Dict[str, Any]] = None,
) -> str:
    """Generate standalone HTML document containing the entire interactive dashboard.
    
    Args:
        title: Title of the dashboard or executive briefing.
        dataset_name: Name of the active dataset file.
        cards_data: List of card objects containing spec, title, and aggregated data {columns, rows}.
        metadata: Optional metadata dictionary with row_count, column_count, page_options, etc.
    
    Returns:
        Full self-contained HTML string.
    """
    meta = metadata or {}
    row_count = meta.get("row_count", "N/A")
    formatted_rows = f"{row_count:,}" if isinstance(row_count, (int, float)) else str(row_count)
    col_count = meta.get("column_count", "N/A")
    timestamp = meta.get("generated_at", time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()))

    safe_title = title.strip() or "Executive Data Intelligence Briefing"
    escaped_title = safe_title.replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")
    escaped_ds = dataset_name.replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

    payload_json = (
        json.dumps(
            {
                "title": safe_title,
                "dataset_name": dataset_name,
                "metadata": meta,
                "cards": cards_data,
            },
            default=str,
        )
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )

    # HTML template with embedded dark/light styling and Plotly initialization
    html = f"""<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{escaped_title} — Data Cleaner Report</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
  <style>
    :root {{
      --bg-page: #09090b;
      --bg-surface: #121215;
      --bg-subtle: #18181b;
      --border-hairline: rgba(255, 255, 255, 0.08);
      --border-strong: rgba(255, 255, 255, 0.16);
      --text-primary: #f4f4f5;
      --text-secondary: #a1a1aa;
      --text-muted: #71717a;
      --accent: #FF4B3E;
      --accent-subtle: rgba(255, 75, 62, 0.12);
      --card-shadow: 0 4px 20px -2px rgba(0, 0, 0, 0.5);
    }}

    html.light {{
      --bg-page: #f8fafc;
      --bg-surface: #ffffff;
      --bg-subtle: #f1f5f9;
      --border-hairline: rgba(0, 0, 0, 0.08);
      --border-strong: rgba(0, 0, 0, 0.16);
      --text-primary: #0f172a;
      --text-secondary: #475569;
      --text-muted: #64748b;
      --accent: #FF4B3E;
      --accent-subtle: rgba(255, 75, 62, 0.08);
      --card-shadow: 0 4px 16px -2px rgba(0, 0, 0, 0.06);
    }}

    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: var(--bg-page);
      color: var(--text-primary);
      line-height: 1.5;
      padding: 2rem 1.5rem 4rem 1.5rem;
      min-height: 100vh;
      transition: background-color 0.2s ease, color 0.2s ease;
    }}

    .container {{
      max-width: 1400px;
      margin: 0 auto;
    }}

    /* Top Executive Header */
    .header-bar {{
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--border-hairline);
      margin-bottom: 2rem;
    }}

    .header-titles h1 {{
      font-size: 1.75rem;
      font-weight: 700;
      letter-spacing: -0.025em;
      margin-bottom: 0.35rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }}

    .badge-confidential {{
      font-size: 0.65rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
      background-color: var(--accent-subtle);
      color: var(--accent);
      border: 1px solid rgba(255, 75, 62, 0.25);
    }}

    .meta-tags {{
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      font-size: 0.8125rem;
      color: var(--text-secondary);
    }}

    .meta-tag {{
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.15rem 0.6rem;
      border-radius: 0.375rem;
      background-color: var(--bg-subtle);
      border: 1px solid var(--border-hairline);
      font-family: 'IBM Plex Mono', monospace;
      font-size: 0.75rem;
    }}

    .header-actions {{
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }}

    .btn {{
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.8125rem;
      font-weight: 600;
      padding: 0.45rem 0.9rem;
      border-radius: 0.5rem;
      border: 1px solid var(--border-hairline);
      background-color: var(--bg-surface);
      color: var(--text-primary);
      cursor: pointer;
      transition: all 0.15s ease;
      text-decoration: none;
    }}

    .btn:hover {{
      border-color: var(--border-strong);
      background-color: var(--bg-subtle);
    }}

    .btn-primary {{
      background-color: var(--accent);
      border-color: var(--accent);
      color: #ffffff;
    }}

    .btn-primary:hover {{
      background-color: #e03b2f;
      border-color: #e03b2f;
    }}

    /* Grid of Charts */
    .dashboard-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(620px, 1fr));
      gap: 1.5rem;
    }}

    @media (max-width: 768px) {{
      .dashboard-grid {{
        grid-template-columns: 1fr;
      }}
    }}

    .chart-card {{
      background-color: var(--bg-surface);
      border: 1px solid var(--border-hairline);
      border-radius: 0.75rem;
      padding: 1.25rem;
      box-shadow: var(--card-shadow);
      display: flex;
      flex-col: column;
      justify-content: space-between;
      break-inside: avoid;
      page-break-inside: avoid;
      transition: border-color 0.15s ease;
    }}

    .chart-card-header {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 0.75rem;
      padding-bottom: 0.65rem;
      border-bottom: 1px solid var(--border-hairline);
    }}

    .chart-card-title {{
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }}

    .chart-pill {{
      font-size: 0.6875rem;
      font-weight: 600;
      text-transform: uppercase;
      padding: 0.15rem 0.5rem;
      border-radius: 9999px;
      background-color: var(--bg-subtle);
      border: 1px solid var(--border-hairline);
      color: var(--text-muted);
    }}

    .chart-pill-formula {{
      background-color: rgba(99, 102, 241, 0.1);
      color: #818cf8;
      border-color: rgba(99, 102, 241, 0.25);
      font-family: 'IBM Plex Mono', monospace;
    }}

    .chart-pill-trend {{
      background-color: rgba(245, 158, 11, 0.1);
      color: #fbbf24;
      border-color: rgba(245, 158, 11, 0.25);
      font-family: 'IBM Plex Mono', monospace;
    }}

    .chart-body {{
      width: 100%;
      min-height: 380px;
    }}

    /* Big number styling */
    .kpi-container {{
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 320px;
      text-align: center;
    }}

    .kpi-value {{
      font-size: 3.5rem;
      font-weight: 700;
      font-family: 'IBM Plex Mono', monospace;
      color: var(--accent);
      line-height: 1.1;
      margin-bottom: 0.5rem;
    }}

    .kpi-label {{
      font-size: 0.875rem;
      color: var(--text-secondary);
      max-width: 380px;
    }}

    /* Print Briefing Layout Styles */
    @media print {{
      @page {{
        size: letter landscape;
        margin: 1cm;
      }}
      body {{
        background: #ffffff !important;
        color: #0f172a !important;
        padding: 0 !important;
      }}
      .no-print {{
        display: none !important;
      }}
      .chart-card {{
        background: #ffffff !important;
        border: 1px solid #cbd5e1 !important;
        box-shadow: none !important;
        margin-bottom: 1.5rem !important;
      }}
      .chart-card-title {{
        color: #0f172a !important;
      }}
      .chart-pill {{
        background: #f1f5f9 !important;
        color: #334155 !important;
        border-color: #cbd5e1 !important;
      }}
    }}
  </style>
</head>
<body>
  <div class="container">
    <!-- Top Executive Briefing Bar -->
    <header class="header-bar">
      <div class="header-titles">
        <h1>
          <span>{escaped_title}</span>
          <span class="badge-confidential">Executive Briefing</span>
        </h1>
        <div class="meta-tags">
          <span class="meta-tag"><strong>File:</strong> {escaped_ds}</span>
          <span class="meta-tag"><strong>Rows:</strong> {formatted_rows}</span>
          <span class="meta-tag"><strong>Cols:</strong> {col_count}</span>
          <span class="meta-tag"><strong>Generated:</strong> {timestamp}</span>
        </div>
      </div>

      <div class="header-actions no-print">
        <button id="theme-toggle-btn" class="btn" title="Toggle dark/light mode">
          <span id="theme-icon">☀️</span>
          <span id="theme-text">Light Mode</span>
        </button>
        <button onclick="window.print()" class="btn btn-primary" title="Print or save as PDF executive report">
          <span>🖨️ Print / Save PDF</span>
        </button>
      </div>
    </header>

    <!-- Chart Cards Grid -->
    <main class="dashboard-grid" id="charts-container">
      <!-- Populated dynamically by Plotly loader script below -->
    </main>
  </div>

  <!-- Embedded Dashboard Dataset -->
  <script id="dashboard-data" type="application/json">
{payload_json}
  </script>

  <script>
    (function() {{
      const dataPayload = JSON.parse(document.getElementById('dashboard-data').textContent);
      const container = document.getElementById('charts-container');
      const themeToggleBtn = document.getElementById('theme-toggle-btn');
      const themeIcon = document.getElementById('theme-icon');
      const themeText = document.getElementById('theme-text');

      let isDark = document.documentElement.classList.contains('dark');

      function updateThemeButtons() {{
        if (isDark) {{
          themeIcon.textContent = '☀️';
          themeText.textContent = 'Light Mode';
        }} else {{
          themeIcon.textContent = '🌙';
          themeText.textContent = 'Dark Mode';
        }}
      }}

      themeToggleBtn.addEventListener('click', () => {{
        isDark = !isDark;
        if (isDark) {{
          document.documentElement.classList.add('dark');
          document.documentElement.classList.remove('light');
        }} else {{
          document.documentElement.classList.remove('dark');
          document.documentElement.classList.add('light');
        }}
        updateThemeButtons();
        renderAllCharts();
      }});

      function calculateSMA(x, y, windowSize) {{
        const w = Math.max(2, Math.floor(windowSize));
        if (!y || y.length < w) return null;
        const resX = [], resY = [];
        let sum = 0;
        for (let i = 0; i < w; i++) sum += y[i];
        resX.push(x[w - 1]);
        resY.push(Number((sum / w).toFixed(2)));
        for (let i = w; i < y.length; i++) {{
          sum += y[i] - y[i - w];
          resX.push(x[i]);
          resY.push(Number((sum / w).toFixed(2)));
        }}
        return {{ x: resX, y: resY }};
      }}

      function renderAllCharts() {{
        container.innerHTML = '';
        const textColor = isDark ? '#e2e8f0' : '#1e293b';
        const tickColor = isDark ? '#94a3b8' : '#64748b';
        const gridColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)';
        const cardBg = isDark ? '#121215' : '#ffffff';

        dataPayload.cards.forEach((card, idx) => {{
          const spec = card.spec || {{}};
          const data = card.data || {{ columns: [], rows: [] }};
          const cardEl = document.createElement('div');
          cardEl.className = 'chart-card';

          const cardHeader = document.createElement('div');
          cardHeader.className = 'chart-card-header';

          const titleEl = document.createElement('div');
          titleEl.className = 'chart-card-title';
          titleEl.textContent = card.title || spec.title || `${{spec.chart_type.toUpperCase()}} Chart`;
          cardHeader.appendChild(titleEl);

          const pillsEl = document.createElement('div');
          pillsEl.style.display = 'flex';
          pillsEl.style.gap = '0.35rem';

          const typePill = document.createElement('span');
          typePill.className = 'chart-pill';
          typePill.textContent = spec.chart_type;
          pillsEl.appendChild(typePill);

          if (spec.y && spec.y.formula) {{
            const fxPill = document.createElement('span');
            fxPill.className = 'chart-pill chart-pill-formula';
            fxPill.textContent = `fx ${{spec.y.column}}`;
            pillsEl.appendChild(fxPill);
          }}

          if (spec.trendline && spec.trendline.type !== 'none') {{
            const trPill = document.createElement('span');
            trPill.className = 'chart-pill chart-pill-trend';
            trPill.textContent = spec.trendline.type.toUpperCase();
            pillsEl.appendChild(trPill);
          }}

          cardHeader.appendChild(pillsEl);
          cardEl.appendChild(cardHeader);

          const chartDiv = document.createElement('div');
          chartDiv.className = 'chart-body';
          chartDiv.id = `chart-elem-${{idx}}`;
          cardEl.appendChild(chartDiv);
          container.appendChild(cardEl);

          // Big number card
          if (spec.chart_type === 'big_number') {{
            const val = data.rows && data.rows.length > 0 && data.rows[0].length > 0 ? data.rows[0][0] : 0;
            const formatted = typeof val === 'number' ? Number(val).toLocaleString() : String(val);
            chartDiv.innerHTML = `
              <div class="kpi-container">
                <div class="kpi-value">${{formatted}}</div>
                <div class="kpi-label">${{spec.title || 'Summary Total'}}</div>
              </div>
            `;
            return;
          }}

          // Build Plotly layout & traces
          const primaryColor = spec.custom_color || '#FF4B3E';
          const baseLayout = {{
            autosize: true,
            height: 380,
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: {{ family: 'IBM Plex Sans, sans-serif', color: textColor, size: 11 }},
            margin: {{ l: 45, r: 20, t: 15, b: 40 }},
            xaxis: {{ gridcolor: gridColor, tickfont: {{ color: tickColor, size: 10 }}, automargin: true }},
            yaxis: {{ gridcolor: gridColor, tickfont: {{ color: tickColor, size: 10 }}, automargin: true }},
            showlegend: !!spec.color || spec.chart_type === 'pie' || spec.chart_type === 'donut' || (!!spec.trendline && spec.trendline.type !== 'none'),
            legend: {{ font: {{ color: textColor, size: 10 }}, orientation: 'h', y: -0.15 }}
          }};

          const rows = data.rows || [];
          const traces = [];

          if (spec.chart_type === 'bar') {{
            traces.push({{
              type: 'bar',
              x: rows.map(r => r[0]),
              y: rows.map(r => Number(r[1]) || 0),
              marker: {{ color: primaryColor }}
            }});
          }} else if (spec.chart_type === 'hbar') {{
            traces.push({{
              type: 'bar',
              orientation: 'h',
              y: rows.map(r => String(r[0])).reverse(),
              x: rows.map(r => Number(r[1]) || 0).reverse(),
              marker: {{ color: primaryColor }}
            }});
            baseLayout.margin.l = 95;
          }} else if (spec.chart_type === 'line' || spec.chart_type === 'area') {{
            const xVals = rows.map(r => r[0]);
            const yVals = rows.map(r => Number(r[1]) || 0);
            traces.push({{
              type: 'scatter',
              mode: 'lines+markers',
              name: 'Series',
              x: xVals,
              y: yVals,
              fill: spec.chart_type === 'area' ? 'tozeroy' : undefined,
              line: {{ color: primaryColor, width: 2.5 }},
              marker: {{ color: primaryColor, size: 5 }}
            }});

            // Trendline overlay
            if (spec.trendline && spec.trendline.type === 'sma') {{
              const sma = calculateSMA(xVals, yVals, spec.trendline.window || 7);
              if (sma) {{
                traces.push({{
                  type: 'scatter',
                  mode: 'lines',
                  name: `SMA (${{spec.trendline.window || 7}})`,
                  x: sma.x,
                  y: sma.y,
                  line: {{ color: spec.trendline.color || '#f59e0b', width: 2, dash: 'dash' }}
                }});
              }}
            }}
          }} else if (spec.chart_type === 'pie' || spec.chart_type === 'donut') {{
            traces.push({{
              type: 'pie',
              labels: rows.map(r => String(r[0])),
              values: rows.map(r => Number(r[1]) || 0),
              hole: spec.chart_type === 'donut' ? 0.55 : 0
            }});
          }} else if (spec.chart_type === 'scatter') {{
            traces.push({{
              type: 'scatter',
              mode: 'markers',
              x: rows.map(r => Number(r[0])),
              y: rows.map(r => Number(r[1])),
              marker: {{ color: primaryColor, size: 7 }}
            }});
          }} else {{
            // Fallback generic bar
            traces.push({{
              type: 'bar',
              x: rows.map(r => r[0]),
              y: rows.map(r => Number(r[1]) || 0),
              marker: {{ color: primaryColor }}
            }});
          }}

          Plotly.newPlot(chartDiv.id, traces, baseLayout, {{ responsive: true, displayModeBar: false }});
        }});
      }}

      renderAllCharts();
      window.addEventListener('resize', () => {{
        dataPayload.cards.forEach((_, idx) => {{
          const elem = document.getElementById(`chart-elem-${{idx}}`);
          if (elem && window.Plotly) Plotly.Plots.resize(elem);
        }});
      }});
    }})();
  </script>
</body>
</html>
"""
    return html
