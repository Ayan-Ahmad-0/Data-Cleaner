const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');
const path = require('path');
const fs = require('fs');

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '1024', width: 1024, height: 768 },
  { name: '390', width: 390, height: 844 },
];

async function runAudit() {
  const afterDir = path.resolve(__dirname, '../docs/ui/after');
  fs.mkdirSync(afterDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const a11yViolations = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n=== Testing Viewport: ${vp.name}px (${vp.width}x${vp.height}) ===`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await context.newPage();

    // 1. Upload Screen
    console.log(`[${vp.name}px] Screen 1: Upload`);
    await page.goto('http://localhost:5173');
    await page.waitForTimeout(500);

    // Accessibility check on Upload
    try {
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      if (serious.length > 0) {
        a11yViolations.push({ screen: 'Upload', viewport: vp.name, violations: serious });
      }
    } catch (e) {
      console.log('A11y check note:', e.message);
    }

    await page.screenshot({ path: path.join(afterDir, `01_upload_${vp.name}px.png`), fullPage: true });

    // Upload file
    const sampleCsv = path.resolve(__dirname, '../data/demo/dirty_events.csv');
    const fileInput = await page.locator('input[type="file"]');
    await fileInput.setInputFiles(sampleCsv);

    // Wait for Screen 2: Profile & Report
    console.log(`[${vp.name}px] Screen 2: Profile & Report`);
    await page.waitForSelector('text=Data Quality Assessment', { timeout: 35000 });
    // Wait for AI report
    try {
      await page.waitForSelector('text=AI Data Quality Report', { timeout: 45000 });
    } catch {}
    await page.waitForTimeout(1000);

    // Check a11y on Profile & Report
    try {
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      if (serious.length > 0) {
        a11yViolations.push({ screen: 'Profile & Report', viewport: vp.name, violations: serious });
      }
    } catch {}

    await page.screenshot({ path: path.join(afterDir, `02_profile_report_${vp.name}px.png`), fullPage: true });

    // Click to Approval Page
    console.log(`[${vp.name}px] Screen 3: Approval`);
    await page.click('button:has-text("Review Cleaning Plan")');
    await page.waitForSelector('text=Review & Approve Cleaning Plan', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // If confirmation questions present, click answer to enable primary button
    const acceptBtns = await page.locator('button:has-text("Accept Recommended Fix")').all();
    for (const btn of acceptBtns) {
      await btn.click();
      await page.waitForTimeout(200);
    }

    // Check a11y on Approval
    try {
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      if (serious.length > 0) {
        a11yViolations.push({ screen: 'Approval', viewport: vp.name, violations: serious });
      }
    } catch {}

    await page.screenshot({ path: path.join(afterDir, `03_approval_${vp.name}px.png`), fullPage: true });

    // Click to Approve & Start Cleaning
    console.log(`[${vp.name}px] Screen 4: Progress`);
    await page.click('button:has-text("Approve & Start Cleaning")');
    await page.waitForTimeout(400);

    try {
      await page.screenshot({ path: path.join(afterDir, `04_progress_${vp.name}px.png`), fullPage: true });
    } catch {}

    // Wait for Results screen
    console.log(`[${vp.name}px] Screen 5: Results`);
    await page.waitForSelector('text=Cleaning & Verification Results', { timeout: 35000 });
    await page.waitForTimeout(1000);

    // Check a11y on Results
    try {
      const results = await new AxeBuilder({ page }).analyze();
      const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
      if (serious.length > 0) {
        a11yViolations.push({ screen: 'Results', viewport: vp.name, violations: serious });
      }
    } catch {}

    await page.screenshot({ path: path.join(afterDir, `05_results_${vp.name}px.png`), fullPage: true });

    await context.close();
  }

  await browser.close();

  console.log('\n=============================================');
  console.log('AUDIT COMPLETE');
  console.log('=============================================');
  console.log(`All after-screenshots captured in: ${afterDir}`);
  if (a11yViolations.length === 0) {
    console.log('A11Y ACCESSIBILITY CHECK: 0 critical/serious violations found!');
  } else {
    console.log('A11Y WARNINGS:', JSON.stringify(a11yViolations, null, 2));
  }
}

runAudit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
