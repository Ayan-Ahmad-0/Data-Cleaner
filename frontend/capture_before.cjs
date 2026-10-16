const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

async function main() {
  const outDir = path.resolve(__dirname, '../docs/ui/before');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  console.log('Navigating to http://localhost:5173...');
  await page.goto('http://localhost:5173');
  await page.waitForTimeout(1000);

  // 1. Upload screen
  console.log('Capturing screen 1: Upload');
  await page.screenshot({ path: path.join(outDir, '01_upload.png'), fullPage: true });

  // Upload dirty_events.csv
  const sampleCsvPath = path.resolve(__dirname, '../data/demo/dirty_events.csv');
  console.log('Uploading sample CSV:', sampleCsvPath);
  const fileInput = await page.locator('input[type="file"]');
  await fileInput.setInputFiles(sampleCsvPath);

  // Wait for transition to Screen 2: Profile & Report and ensure recipe is drafted
  console.log('Waiting for Profile & Report screen and AI report...');
  await page.waitForSelector('text=AI Quality Report', { timeout: 60000 });
  await page.waitForTimeout(2000); // let UI settle

  console.log('Capturing screen 2: Profile & Report');
  await page.screenshot({ path: path.join(outDir, '02_profile_report.png'), fullPage: true });

  // Click proceed to approval
  console.log('Clicking Review Proposed Recipe...');
  await page.click('button:has-text("Review Proposed Recipe")');
  await page.waitForSelector('text=Review & Approve Cleaning Recipe', { timeout: 10000 });
  await page.waitForTimeout(1000);

  console.log('Capturing screen 3: Approval');
  await page.screenshot({ path: path.join(outDir, '03_approval.png'), fullPage: true });

  // Click approve and clean
  console.log('Clicking Approve & Execute Clean...');
  await page.click('button:has-text("Approve & Execute Clean")');
  await page.waitForTimeout(500);

  console.log('Capturing screen 4: Progress (if caught before finish)');
  try {
    await page.screenshot({ path: path.join(outDir, '04_progress.png'), fullPage: true });
  } catch (e) {
    console.log('Could not capture progress screen in time:', e.message);
  }

  // Wait for results screen
  console.log('Waiting for Results screen...');
  await page.waitForSelector('text=Cleaning & Verification Results', { timeout: 30000 });
  await page.waitForTimeout(1000);

  console.log('Capturing screen 5: Results');
  await page.screenshot({ path: path.join(outDir, '05_results.png'), fullPage: true });

  await browser.close();
  console.log('All before screenshots captured successfully in', outDir);
}

main().catch((err) => {
  console.error('Error capturing before screenshots:', err);
  process.exit(1);
});
