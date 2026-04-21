/**
 * screenshot-export.mjs
 * Renders HTML slides to high-resolution PNG via Playwright.
 * Output: 3840x2160 (deviceScaleFactor 2 at 1920x1080 viewport) PNG files,
 * one per slide, ready for PptxGenJS addImage() full-bleed insertion.
 *
 * This path is NOT a fallback — it is the PREFERRED path for slides with
 * brand fonts, CSS gradients, SVG filters, or font_fidelity: strict.
 *
 * Usage:
 *   node screenshot-export.mjs \
 *     --slides-dir <dir> \
 *     --out <screenshots-dir> \
 *     [--slides 1,3,5] \
 *     [--scale 2] \
 *     [--width 1920] \
 *     [--height 1080]
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    "slides-dir": { type: "string" },
    "out":        { type: "string" },
    "slides":     { type: "string" },   // comma-separated slide numbers
    "scale":      { type: "string", default: "2" },
    "width":      { type: "string", default: "1920" },
    "height":     { type: "string", default: "1080" },
    "help":       { type: "boolean", short: "h", default: false },
  },
  strict: false,
});

if (args.help || !args["slides-dir"] || !args.out) {
  console.log(`
screenshot-export.mjs — render HTML slides to high-res PNG via Playwright

Options:
  --slides-dir <dir>     Directory with slide-NN.html files (required)
  --out <dir>            Output directory for PNG files (required)
  --slides <list>        Comma-separated slide numbers to render (default: all)
  --scale <n>            deviceScaleFactor for Playwright (default: 2 → 3840x2160)
  --width <px>           Viewport width in px (default: 1920)
  --height <px>          Viewport height in px (default: 1080)
  --help                 Show this help
`);
  process.exit(args.help ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLIDES_DIR = path.resolve(args["slides-dir"]);
const OUT_DIR    = path.resolve(args.out);
const SCALE      = parseFloat(args.scale);
const WIDTH      = parseInt(args.width, 10);
const HEIGHT     = parseInt(args.height, 10);

// Parse optional slide filter
let SLIDE_FILTER = null;
if (args.slides) {
  SLIDE_FILTER = new Set(
    args.slides.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n))
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function enumerateSlides(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => /^slide-\d+\.html$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)[0], 10);
      const nb = parseInt(b.match(/\d+/)[0], 10);
      return na - nb;
    });
}

function slideNumber(filename) {
  return parseInt(filename.match(/\d+/)[0], 10);
}

/**
 * Resolve absolute file URL for Playwright navigation.
 * Playwright requires file:// URIs on all platforms.
 */
function toFileUrl(absolutePath) {
  // On Windows, paths like C:\... need proper escaping
  const normalised = absolutePath.replace(/\\/g, "/");
  return normalised.startsWith("/")
    ? `file://${normalised}`
    : `file:///${normalised}`;
}

// ---------------------------------------------------------------------------
// Screenshot logic
// ---------------------------------------------------------------------------

/**
 * Render a single HTML file to PNG and save it.
 * Returns the output file path.
 */
async function renderSlide(page, htmlPath, outPath) {
  const fileUrl = toFileUrl(htmlPath);

  console.log(`[screenshot] Rendering ${path.basename(htmlPath)} ...`);

  await page.goto(fileUrl, { waitUntil: "networkidle", timeout: 30_000 });

  // Wait for fonts and layout to settle
  await page.waitForTimeout(200);

  // Ensure slide fills the viewport exactly (no scrollbars, no overflow)
  await page.evaluate(() => {
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    // Remove any scrollbar-induced layout shift
    document.body.style.margin = "0";
    document.body.style.padding = "0";
  });

  await page.screenshot({
    path: outPath,
    type: "png",
    fullPage: false,       // capture exactly the viewport (1920x1080 logical)
    omitBackground: false, // preserve background colors
    clip: {
      x: 0,
      y: 0,
      width: WIDTH,
      height: HEIGHT,
    },
  });

  console.log(
    `[screenshot] Saved ${path.basename(outPath)} ` +
    `(${WIDTH * SCALE}x${HEIGHT * SCALE} effective pixels)`
  );

  return outPath;
}

// ---------------------------------------------------------------------------
// Optional Sharp post-processing
// ---------------------------------------------------------------------------

async function optimizeWithSharp(pngPath) {
  let sharp;
  try {
    const sharpModule = await import("sharp");
    sharp = sharpModule.default;
  } catch {
    // Sharp is optional — skip silently
    return;
  }

  const meta = await sharp(pngPath).metadata();
  console.log(
    `[sharp] ${path.basename(pngPath)}: ${meta.width}x${meta.height} ${meta.format}`
  );

  // Verify expected dimensions
  const expectedW = WIDTH * SCALE;
  const expectedH = HEIGHT * SCALE;
  if (meta.width !== expectedW || meta.height !== expectedH) {
    console.warn(
      `[sharp] Unexpected dimensions: got ${meta.width}x${meta.height}, ` +
      `expected ${expectedW}x${expectedH}`
    );
  }

  // Optimize PNG in-place (lossless)
  const tempPath = pngPath + ".tmp.png";
  await sharp(pngPath)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(tempPath);

  fs.renameSync(tempPath, pngPath);
  console.log(`[sharp] Optimized ${path.basename(pngPath)}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(SLIDES_DIR)) {
    console.error(`[ERROR] slides-dir not found: ${SLIDES_DIR}`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const allSlides = enumerateSlides(SLIDES_DIR);
  if (allSlides.length === 0) {
    console.error(`[ERROR] No slide-NN.html files in ${SLIDES_DIR}`);
    process.exit(1);
  }

  // Apply slide filter
  const slidesToRender = SLIDE_FILTER
    ? allSlides.filter((f) => SLIDE_FILTER.has(slideNumber(f)))
    : allSlides;

  if (slidesToRender.length === 0) {
    console.error(
      `[ERROR] --slides filter matched no files. ` +
      `Available: ${allSlides.map(slideNumber).join(", ")}`
    );
    process.exit(1);
  }

  console.log(
    `[screenshot] Rendering ${slidesToRender.length} of ${allSlides.length} slides ` +
    `at ${WIDTH}x${HEIGHT} (scale=${SCALE} → ${WIDTH * SCALE}x${HEIGHT * SCALE})`
  );

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      // Ensure fonts are rendered consistently
      "--font-render-hinting=none",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: SCALE,
    // Disable animations for deterministic screenshots
    reducedMotion: "reduce",
  });

  const page = await context.newPage();
  const results = [];

  try {
    for (const filename of slidesToRender) {
      const htmlPath = path.join(SLIDES_DIR, filename);
      const num = slideNumber(filename);
      const outFilename = `slide-${String(num).padStart(2, "0")}.png`;
      const outPath = path.join(OUT_DIR, outFilename);

      try {
        await renderSlide(page, htmlPath, outPath);
        await optimizeWithSharp(outPath);
        results.push({ slide: num, path: outPath, status: "ok" });
      } catch (err) {
        console.error(`[ERROR] Failed to render ${filename}: ${err.message}`);
        results.push({ slide: num, path: outPath, status: "error", error: err.message });
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  // Summary
  const ok = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "error").length;
  console.log(`\n[screenshot] Done: ${ok} OK, ${failed} errors`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
