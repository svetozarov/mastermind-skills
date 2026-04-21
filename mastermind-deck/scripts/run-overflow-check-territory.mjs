/**
 * run-overflow-check.mjs
 * Прогоняет overflow-detector.js на всех слайдах через Playwright.
 * Не требует ANTHROPIC_API_KEY — детерминистический, 0 токенов.
 * Генерирует: audit.json + qa/slide_NN.png
 */

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname    = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR  = path.resolve(__dirname, '../../../projects/territory-research-v5-htmldeck');
const SLIDES_DIR   = path.join(PROJECT_DIR, 'slides');
const QA_DIR       = path.join(PROJECT_DIR, 'qa');
const DETECTOR_JS  = path.join(__dirname, 'overflow-detector.js');
const AUDIT_PATH   = path.join(PROJECT_DIR, 'audit.json');

async function main() {
  console.log('[overflow-check] Запускаем Playwright Chromium...');

  const detectorCode = await fs.readFile(DETECTOR_JS, 'utf8');

  await fs.mkdir(QA_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1
  });

  // Найдём все слайды
  const files = (await fs.readdir(SLIDES_DIR))
    .filter(f => f.endsWith('.html'))
    .sort();

  console.log(`[overflow-check] Слайдов для проверки: ${files.length}`);

  const auditResults = [];

  for (const file of files) {
    const slidePath = path.join(SLIDES_DIR, file);
    const slideUrl  = `file:///${slidePath.replace(/\\/g, '/')}`;
    const slideNum  = file.replace('.html', '');

    const page = await context.newPage();

    try {
      await page.goto(slideUrl, { waitUntil: 'networkidle', timeout: 15000 });

      // Ждём рендер
      await page.waitForTimeout(500);

      // Screenshot
      const screenshotPath = path.join(QA_DIR, `${slideNum}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });

      // Запускаем overflow-detector
      const result = await page.evaluate(detectorCode);

      const entry = {
        slide: file,
        path:  slidePath,
        status: result === 'OK' ? 'PASS' : 'FAIL',
        issues: result === 'OK' ? null : result
      };

      auditResults.push(entry);

      if (result === 'OK') {
        console.log(`  PASS  ${file}`);
      } else {
        const overflowCount   = (result.overflow   || []).length;
        const contrastCount   = (result.contrast   || []).length;
        const clippedCount    = (result.clipped_text || []).length;
        const offCanvasCount  = (result.off_canvas  || []).length;
        const overlapCount    = (result.overlap     || []).length;
        console.log(`  FAIL  ${file} — overflow:${overflowCount} contrast:${contrastCount} clipped:${clippedCount} off_canvas:${offCanvasCount} overlap:${overlapCount}`);
      }

    } catch (err) {
      console.error(`  ERROR ${file}: ${err.message}`);
      auditResults.push({ slide: file, status: 'ERROR', error: err.message });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  // Записываем audit.json
  const summary = {
    generated_at: new Date().toISOString(),
    total: auditResults.length,
    passed: auditResults.filter(r => r.status === 'PASS').length,
    failed: auditResults.filter(r => r.status === 'FAIL').length,
    errors: auditResults.filter(r => r.status === 'ERROR').length,
    slides: auditResults
  };

  await fs.writeFile(AUDIT_PATH, JSON.stringify(summary, null, 2), 'utf8');
  console.log(`\n[overflow-check] Готово.`);
  console.log(`  PASS: ${summary.passed}/${summary.total}`);
  console.log(`  FAIL: ${summary.failed}/${summary.total}`);
  console.log(`  Audit: ${AUDIT_PATH}`);
  console.log(`  Screenshots: ${QA_DIR}`);
}

main().catch(err => {
  console.error('[overflow-check] КРИТИЧЕСКАЯ ОШИБКА:', err);
  process.exit(1);
});
