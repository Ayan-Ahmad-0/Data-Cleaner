const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

function blendWithWhite(hex, alpha) {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  const num = parseInt(clean, 16);
  if (isNaN(num)) return '#f1f5f9';
  const r = Math.round(((num >> 16) & 255) * alpha + 255 * (1 - alpha));
  const g = Math.round(((num >> 8) & 255) * alpha + 255 * (1 - alpha));
  const b = Math.round((num & 255) * alpha + 255 * (1 - alpha));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function blendWithDark(hex, alpha) {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  const num = parseInt(clean, 16);
  if (isNaN(num)) return '#1e293b';
  const r = Math.round(((num >> 16) & 255) * alpha + 15 * (1 - alpha));
  const g = Math.round(((num >> 8) & 255) * alpha + 23 * (1 - alpha));
  const b = Math.round((num & 255) * alpha + 42 * (1 - alpha));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function adjustBrightness(hex, percent) {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
  const num = parseInt(clean, 16);
  if (isNaN(num)) return hex;
  const r = Math.max(0, Math.min(255, ((num >> 16) & 255) + Math.round(255 * (percent / 100))));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 255) + Math.round(255 * (percent / 100))));
  const b = Math.max(0, Math.min(255, (num & 255) + Math.round(255 * (percent / 100))));
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function buildHeatmapColorscale(primaryColor, isDark) {
  const norm = primaryColor.toLowerCase();
  if (norm === '#118dff' || norm === '#2563eb' || norm === '#0078d4') {
    return isDark
      ? [
          [0, '#132238'],
          [0.25, '#17365d'],
          [0.55, '#1a569b'],
          [0.8, '#0d6efd'],
          [1.0, '#38bdf8'],
        ]
      : [
          [0, '#ebf3fc'],
          [0.3, '#9ec5f7'],
          [0.65, '#3b8ded'],
          [1.0, '#005fb8'],
        ];
  }

  if (isDark) {
    return [
      [0, blendWithDark(primaryColor, 0.15)],
      [0.25, adjustBrightness(primaryColor, -55)],
      [0.6, adjustBrightness(primaryColor, -20)],
      [1.0, primaryColor],
    ];
  } else {
    return [
      [0, blendWithWhite(primaryColor, 0.1)],
      [0.3, blendWithWhite(primaryColor, 0.38)],
      [0.65, blendWithWhite(primaryColor, 0.72)],
      [1.0, adjustBrightness(primaryColor, -18)],
    ];
  }
}

async function testScarlet() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const scarletDark = buildHeatmapColorscale('#FF2400', true);
  const scarletLight = buildHeatmapColorscale('#FF2400', false);

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <script src="https://cdn.plot.ly/plotly-2.35.2.min.js"></script>
    <style>body { background: #09090b; padding: 20px; font-family: Segoe UI, sans-serif; }</style>
  </head>
  <body>
    <div style="background: #18181b; padding: 16px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #27272a;">
      <h3 style="color: #fff; margin:0 0 10px 0;">Scarlet Red #FF2400 (Dark Mode)</h3>
      <div id="chart_dark" style="width: 720px; height: 260px;"></div>
    </div>
    <div style="background: #fff; padding: 16px; border-radius: 12px; margin-bottom: 20px; border: 1px solid #e2e8f0;">
      <h3 style="color: #000; margin:0 0 10px 0;">Scarlet Red #FF2400 (Light Mode)</h3>
      <div id="chart_light" style="width: 720px; height: 260px;"></div>
    </div>

    <script>
      const xSet = ['CAD', 'AUD', 'EUR', 'GBP', 'USD'];
      const ySet = ['completed', 'pending', 'failed', 'refunded'];
      const zMatrix = [
        [2235, 2240, 2160, 2210, 2225],
        [2220, 2150, 2228, 2215, 2230],
        [2215, 2232, 2145, 2131, 2220],
        [2242, 2225, 2140, 2220, 2218],
      ];
      const textMatrix = zMatrix.map(row => row.map(v => Number(v).toLocaleString()));

      function render(id, scale, isDark) {
        Plotly.newPlot(id, [{
          type: 'heatmap',
          x: xSet,
          y: ySet,
          z: zMatrix,
          text: textMatrix,
          texttemplate: '<b>%{text}</b>',
          textfont: { family: 'Segoe UI, sans-serif', size: 12 },
          xgap: 3,
          ygap: 3,
          colorscale: scale,
          colorbar: {
            thickness: 12,
            len: 0.82,
            outlinewidth: 0,
            tickfont: { color: isDark ? '#94a3b8' : '#64748b', size: 10, family: 'Segoe UI, sans-serif' },
            tickformat: ',d',
            xpad: 10,
          },
          hovertemplate: '<b>%{y}</b> • <b>%{x}</b><br>Count: <b>%{z:,.0f}</b><extra></extra>',
        }], {
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent',
          margin: { l: 85, r: 20, t: 10, b: 40 },
          xaxis: {
            tickfont: { color: isDark ? '#cbd5e1' : '#334155', size: 11, family: 'Segoe UI, sans-serif' },
            showgrid: false,
            zeroline: false,
            ticks: '',
          },
          yaxis: {
            autorange: 'reversed',
            tickfont: { color: isDark ? '#cbd5e1' : '#334155', size: 11, family: 'Segoe UI, sans-serif' },
            showgrid: false,
            zeroline: false,
            ticks: '',
          },
        }, { responsive: true, displayModeBar: false });
      }

      render('chart_dark', ${JSON.stringify(scarletDark)}, true);
      render('chart_light', ${JSON.stringify(scarletLight)}, false);
    </script>
  </body>
  </html>
  `;

  fs.writeFileSync(path.resolve(__dirname, 'test_scarlet.html'), html);
  await page.goto('file:///' + path.resolve(__dirname, 'test_scarlet.html').replace(/\\/g, '/'));
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.resolve(__dirname, 'test_scarlet.png'), fullPage: true });
  await browser.close();
  console.log('Saved test_scarlet.png');
}

testScarlet().catch(console.error);
