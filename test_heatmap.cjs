const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  // Create an HTML page loading plotly.js and rendering the exact Currency vs Status heatmap
  const htmlContent = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <title>Heatmap Test</title>
    <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
    <style>
      body {
        background-color: #0f172a;
        margin: 40px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .card {
        background: #18181b;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 20px;
        width: 800px;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div id="chart" style="width: 760px; height: 380px;"></div>
    </div>
    <script>
      const xSet = ['CAD', 'AUD', 'EUR', 'GBP', 'USD'];
      const ySet = ['completed', 'pending', 'failed', 'refunded'];
      // Currency vs Status data from user screenshot:
      // z around 2131 to 2250
      const zMatrix = [
        [2235, 2240, 2160, 2210, 2225], // completed
        [2220, 2150, 2228, 2215, 2230], // pending
        [2215, 2232, 2145, 2131, 2220], // failed
        [2242, 2225, 2140, 2220, 2218], // refunded
      ];

      const textMatrix = zMatrix.map(row => row.map(v => Number(v).toLocaleString()));

      // Power BI color scale: Light ice-tint to Vibrant Power BI Blue
      const powerBiBlueScaleDark = [
        [0, '#132238'],
        [0.2, '#1a365d'],
        [0.5, '#1e4f8a'],
        [0.8, '#0d6efd'],
        [1.0, '#38bdf8']
      ];

      const data = [{
        type: 'heatmap',
        x: xSet,
        y: ySet,
        z: zMatrix,
        text: textMatrix,
        texttemplate: '<b>%{text}</b>',
        textfont: {
          family: "Segoe UI, -apple-system, BlinkMacSystemFont, sans-serif",
          size: 13,
        },
        xgap: 3,
        ygap: 3,
        colorscale: powerBiBlueScaleDark,
        colorbar: {
          thickness: 12,
          len: 0.85,
          outlinewidth: 0,
          tickfont: { color: '#94a3b8', size: 10, family: 'Segoe UI, sans-serif' },
          tickformat: ',d',
          xpad: 12,
        },
        hovertemplate: '<b>%{y}</b> • <b>%{x}</b><br><span style="opacity:0.8">Count:</span> <b>%{z:,.0f}</b><extra></extra>',
      }];

      const layout = {
        paper_bgcolor: 'transparent',
        plot_bgcolor: 'transparent',
        margin: { l: 90, r: 20, t: 30, b: 50 },
        xaxis: {
          side: 'bottom',
          tickfont: { color: '#cbd5e1', size: 12, family: 'Segoe UI, sans-serif' },
          showgrid: false,
          zeroline: false,
          ticks: '',
        },
        yaxis: {
          autorange: 'reversed', // Display top-down like Power BI matrix
          tickfont: { color: '#cbd5e1', size: 12, family: 'Segoe UI, sans-serif' },
          showgrid: false,
          zeroline: false,
          ticks: '',
        },
      };

      Plotly.newPlot('chart', data, layout, { responsive: true, displayModeBar: false });
    </script>
  </body>
  </html>
  `;

  const htmlPath = path.resolve(__dirname, 'test_heatmap.html');
  fs.writeFileSync(htmlPath, htmlContent);

  await page.goto('file:///' + htmlPath.replace(/\\\\/g, '/'));
  await page.waitForTimeout(1000);
  
  const outShot = path.resolve(__dirname, 'test_heatmap.png');
  await page.screenshot({ path: outShot });
  console.log('Saved test screenshot to', outShot);

  await browser.close();
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
