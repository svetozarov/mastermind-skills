/**
 * assemble-deck.mjs
 * Orchestrator for the export phase.
 *
 * Reads brief.yaml + tokens.json + layouts-registry.json + slides/.
 * Determines which slides use the editable path (html2pptx → PptxGenJS)
 * and which use the screenshot path (Playwright PNG → addImage full-bleed).
 * Mixes both types into a single .pptx in correct slide order.
 *
 * Screenshot slides: inserted as full-bleed background image.
 * Optionally, text blocks marked with data-slot attributes are duplicated
 * as invisible (opacity 0) text shapes on top for accessibility/search.
 *
 * CLI:
 *   node assemble-deck.mjs --project <project-dir> --out <deck.pptx>
 *   node assemble-deck.mjs \
 *     --slides-dir <dir> \
 *     --tokens <tokens.json> \
 *     --registry <registry.json> \
 *     --brief <brief.yaml> \
 *     --screenshots-dir <dir> \
 *     --notes-dir <dir> \
 *     --out <deck.pptx>
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import pptxgen from "pptxgenjs";
import { parse as parseYaml } from "yaml";

import { injectNotes } from "./export/notes-injector.mjs";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    // Convenience: --project <dir> auto-resolves all sub-paths
    "project":           { type: "string" },
    // Or specify individually:
    "slides-dir":        { type: "string" },
    "tokens":            { type: "string" },
    "registry":          { type: "string" },
    "brief":             { type: "string" },
    "screenshots-dir":   { type: "string" },
    "notes-dir":         { type: "string" },
    "notes-file":        { type: "string" },
    "out":               { type: "string" },
    "help":              { type: "boolean", short: "h", default: false },
  },
  strict: false,
});

if (args.help || (!args.project && !args["slides-dir"]) || !args.out) {
  console.log(`
assemble-deck.mjs — orchestrate the full export phase into a single PPTX

Options (convenience):
  --project <dir>         Project directory containing:
                            slides/, tokens.json, layouts-registry.json,
                            brief.yaml, screenshots/ (optional)
  --out <pptx>            Output PPTX file path (required)

Options (manual):
  --slides-dir <dir>      Directory with slide-NN.html files
  --tokens <json>         Path to tokens.json
  --registry <json>       Path to layouts-registry.json
  --brief <yaml>          Path to deck-brief.yaml
  --screenshots-dir <dir> Pre-rendered PNGs (if omitted, will render on demand)
  --notes-dir <dir>       Directory with slide-NN.notes.md files
  --notes-file <md>       Unified speaker-notes.md file
  --help                  Show this help
`);
  process.exit(args.help ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Resolve paths
// ---------------------------------------------------------------------------

function resolvePaths() {
  if (args.project) {
    const p = path.resolve(args.project);
    return {
      slidesDir:      path.join(p, "slides"),
      tokensPath:     path.join(p, "tokens.json"),
      registryPath:   path.join(p, "layouts-registry.json"),
      briefPath:      path.join(p, "brief.yaml"),
      screenshotsDir: path.join(p, "screenshots"),
      notesDir:       path.join(p, "notes"),
      notesFile:      path.join(p, "speaker-notes.md"),
    };
  }
  return {
    slidesDir:      args["slides-dir"] ? path.resolve(args["slides-dir"]) : null,
    tokensPath:     args.tokens        ? path.resolve(args.tokens)        : null,
    registryPath:   args.registry      ? path.resolve(args.registry)      : null,
    briefPath:      args.brief         ? path.resolve(args.brief)         : null,
    screenshotsDir: args["screenshots-dir"] ? path.resolve(args["screenshots-dir"]) : null,
    notesDir:       args["notes-dir"]  ? path.resolve(args["notes-dir"])  : null,
    notesFile:      args["notes-file"] ? path.resolve(args["notes-file"]) : null,
  };
}

const PATHS = resolvePaths();
const OUT_PATH = path.resolve(args.out);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PPTX_WIDTH_IN  = 13.33;
const PPTX_HEIGHT_IN = 7.5;
const HTML_WIDTH_PX  = 1920;
const HTML_HEIGHT_PX = 1080;

const WEB_SAFE_FONTS = new Set([
  "arial", "helvetica", "times new roman", "georgia", "courier new",
  "verdana", "tahoma", "trebuchet ms", "impact",
  "sans-serif", "serif", "monospace", "cursive", "fantasy",
  "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace",
]);

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

function loadTokens() {
  if (!PATHS.tokensPath || !fs.existsSync(PATHS.tokensPath)) {
    console.warn("[assemble] tokens.json not found — using empty tokens");
    return {};
  }
  return JSON.parse(fs.readFileSync(PATHS.tokensPath, "utf8"));
}

function loadBrief() {
  if (!PATHS.briefPath || !fs.existsSync(PATHS.briefPath)) return {};
  return parseYaml(fs.readFileSync(PATHS.briefPath, "utf8")) || {};
}

function loadRegistry() {
  if (!PATHS.registryPath || !fs.existsSync(PATHS.registryPath)) return null;
  return JSON.parse(fs.readFileSync(PATHS.registryPath, "utf8"));
}

// ---------------------------------------------------------------------------
// Slide enumeration and classification
// ---------------------------------------------------------------------------

function enumerateSlides() {
  if (!fs.existsSync(PATHS.slidesDir)) {
    console.error(`[ERROR] slides-dir not found: ${PATHS.slidesDir}`);
    process.exit(1);
  }
  return fs
    .readdirSync(PATHS.slidesDir)
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
 * Detect non-web-safe fonts in HTML source via regex.
 */
function hasNonWebSafeFonts(htmlContent) {
  const re = /font-family\s*:\s*([^;}"']+)/gi;
  let m;
  while ((m = re.exec(htmlContent)) !== null) {
    const families = m[1]
      .split(",")
      .map((f) => f.trim().replace(/^['"]|['"]$/g, "").toLowerCase());
    for (const f of families) {
      if (!WEB_SAFE_FONTS.has(f)) return true;
    }
  }
  return false;
}

function classifySlide(slideNum, htmlContent, brief) {
  if (brief.font_fidelity === "strict") return "screenshot";
  if (brief.slides?.[slideNum]?.font_fidelity === "strict") return "screenshot";
  if (hasNonWebSafeFonts(htmlContent)) return "screenshot";
  return "editable";
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

function toInches(px, axis) {
  return axis === "x" || axis === "w"
    ? (px / HTML_WIDTH_PX)  * PPTX_WIDTH_IN
    : (px / HTML_HEIGHT_PX) * PPTX_HEIGHT_IN;
}

function pxToPt(px) {
  return Math.round(px * 0.75 * 10) / 10;
}

function cssColorToHex(cssColor) {
  if (!cssColor || cssColor === "transparent" || cssColor === "rgba(0, 0, 0, 0)") return null;
  const rgb = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) {
    const [, r, g, b] = rgb;
    return `#${parseInt(r).toString(16).padStart(2, "0")}${parseInt(g).toString(16).padStart(2, "0")}${parseInt(b).toString(16).padStart(2, "0")}`.toUpperCase();
  }
  if (/^#[0-9A-Fa-f]{3,8}$/.test(cssColor)) return cssColor.toUpperCase();
  return null;
}

function resolveFont(rawFamily) {
  if (!rawFamily) return "Arial";
  const first = rawFamily.split(",")[0].trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  return WEB_SAFE_FONTS.has(first) ? rawFamily.split(",")[0].trim().replace(/^['"]|['"]$/g, "") : "Arial";
}

// ---------------------------------------------------------------------------
// DOM element extraction (Playwright)
// ---------------------------------------------------------------------------

async function extractElements(page, htmlPath) {
  const fileUrl = htmlPath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:");
  await page.goto(fileUrl, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(150);

  return page.evaluate(() => {
    const results = [];

    // Background
    const root = document.querySelector(".slide, section, body");
    if (root) {
      const cs = window.getComputedStyle(root);
      const r  = root.getBoundingClientRect();
      results.push({
        type: "background",
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        backgroundColor: cs.backgroundColor,
      });
    }

    // Text
    const TEXT_SELS = ["h1","h2","h3","h4","h5","h6","p","li","figcaption","[data-slot]"];
    for (const sel of TEXT_SELS) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1 || r.x > 1920 || r.y > 1080) continue;
        const text = el.innerText?.trim();
        if (!text) continue;
        const cs = window.getComputedStyle(el);
        results.push({
          type: "text",
          rect: { x: r.x, y: r.y, w: r.width, h: r.height },
          text,
          style: {
            fontFamily:   cs.fontFamily,
            fontSize:     parseFloat(cs.fontSize),
            fontWeight:   cs.fontWeight,
            fontStyle:    cs.fontStyle,
            color:        cs.color,
            textAlign:    cs.textAlign,
            textTransform: cs.textTransform,
          },
          dataSlot: el.dataset?.slot || null,
        });
      }
    }

    // Images
    for (const el of document.querySelectorAll("img")) {
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      results.push({
        type: "image",
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        src: el.src,
        objectFit: window.getComputedStyle(el).objectFit,
      });
    }

    return results;
  });
}

// ---------------------------------------------------------------------------
// Build one editable slide
// ---------------------------------------------------------------------------

function buildEditableSlide(pptx, elements, slideNum) {
  const slide = pptx.addSlide();

  for (const el of elements) {
    if (el.type === "background") {
      const hex = cssColorToHex(el.backgroundColor);
      if (hex) slide.background = { color: hex.replace("#", "") };
      continue;
    }

    const { rect } = el;
    const pos = {
      x: toInches(Math.max(0, rect.x), "x"),
      y: toInches(Math.max(0, rect.y), "y"),
      w: toInches(Math.min(rect.w, HTML_WIDTH_PX  - Math.max(0, rect.x)), "w"),
      h: toInches(Math.min(rect.h, HTML_HEIGHT_PX - Math.max(0, rect.y)), "h"),
    };
    if (pos.x >= PPTX_WIDTH_IN || pos.y >= PPTX_HEIGHT_IN) continue;
    pos.w = Math.min(pos.w, PPTX_WIDTH_IN  - pos.x);
    pos.h = Math.min(pos.h, PPTX_HEIGHT_IN - pos.y);
    if (pos.w <= 0.01 || pos.h <= 0.01) continue;

    if (el.type === "text") {
      const { style } = el;
      const alignMap = { left: "left", center: "ctr", right: "right", justify: "justify" };
      slide.addText(el.text, {
        ...pos,
        fontFace:   resolveFont(style.fontFamily),
        fontSize:   pxToPt(style.fontSize || 20),
        color:      (cssColorToHex(style.color) || "#0A0A0A").replace("#", ""),
        bold:       parseInt(style.fontWeight || "400", 10) >= 600,
        italic:     style.fontStyle === "italic",
        align:      alignMap[style.textAlign] || "left",
        wrap:       true,
        autoFit:    false,
        shrinkText: false,
      });
    } else if (el.type === "image" && el.src) {
      if (el.src.startsWith("data:") && el.src.length > 5_000_000) continue;
      try {
        slide.addImage({
          ...pos,
          data: el.src.startsWith("data:") ? el.src : undefined,
          path: el.src.startsWith("file:")
            ? el.src.replace(/^file:\/\/\//, "").replace(/^file:\/\//, "")
            : undefined,
        });
      } catch (imgErr) {
        console.warn(`[assemble] Slide ${slideNum}: image insert failed — ${imgErr.message}`);
      }
    }
  }

  return slide;
}

// ---------------------------------------------------------------------------
// Build one screenshot slide (full-bleed PNG)
// ---------------------------------------------------------------------------

function buildScreenshotSlide(pptx, pngPath, elements, slideNum) {
  const slide = pptx.addSlide();

  // Full-bleed background image
  slide.addImage({
    path: pngPath,
    x: 0,
    y: 0,
    w: PPTX_WIDTH_IN,
    h: PPTX_HEIGHT_IN,
    sizing: { type: "cover", w: PPTX_WIDTH_IN, h: PPTX_HEIGHT_IN },
  });

  // Optional: invisible text layer for accessibility/search from data-slot elements
  if (elements) {
    const slotElements = elements.filter(
      (e) => e.type === "text" && e.dataSlot !== null
    );
    for (const el of slotElements) {
      const { rect } = el;
      const pos = {
        x: toInches(Math.max(0, rect.x), "x"),
        y: toInches(Math.max(0, rect.y), "y"),
        w: toInches(Math.min(rect.w, HTML_WIDTH_PX  - Math.max(0, rect.x)), "w"),
        h: toInches(Math.min(rect.h, HTML_HEIGHT_PX - Math.max(0, rect.y)), "h"),
      };
      if (pos.w <= 0.01 || pos.h <= 0.01) continue;
      // White text on white background at 0% opacity — invisible but searchable
      // NOTE: PptxGenJS does not directly support opacity on text boxes;
      // instead use a transparent color (same as background) to make text
      // effectively invisible while remaining in the OOXML for search/a11y.
      slide.addText(el.text, {
        ...pos,
        fontFace: "Arial",
        fontSize: pxToPt(el.style?.fontSize || 16),
        color:    "FFFFFF",
        // Transparency via color that matches slide background — best effort
        transparency: 100,
        wrap: true,
      });
    }
  }

  return slide;
}

// ---------------------------------------------------------------------------
// Screenshot rendering for slides that need it
// ---------------------------------------------------------------------------

async function renderScreenshots(slideFiles, screenshotsDir, slidesDir) {
  fs.mkdirSync(screenshotsDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--font-render-hinting=none"],
  });
  const context = await browser.newContext({
    viewport: { width: HTML_WIDTH_PX, height: HTML_HEIGHT_PX },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();

  try {
    for (const { filename, slideNum } of slideFiles) {
      const pngName = `slide-${String(slideNum).padStart(2, "0")}.png`;
      const pngPath = path.join(screenshotsDir, pngName);

      if (fs.existsSync(pngPath)) {
        console.log(`[assemble] Screenshot exists, reusing: ${pngName}`);
        continue;
      }

      const htmlPath = path.join(slidesDir, filename);
      const fileUrl  = htmlPath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:");

      console.log(`[assemble] Rendering screenshot for slide ${slideNum}...`);
      await page.goto(fileUrl, { waitUntil: "networkidle", timeout: 30_000 });
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        document.body.style.overflow = "hidden";
        document.documentElement.style.overflow = "hidden";
        document.body.style.margin = "0";
      });
      await page.screenshot({
        path: pngPath,
        type: "png",
        fullPage: false,
        omitBackground: false,
        clip: { x: 0, y: 0, width: HTML_WIDTH_PX, height: HTML_HEIGHT_PX },
      });
      console.log(`[assemble] Screenshot saved: ${pngName} (3840x2160 effective)`);
    }
  } finally {
    await context.close();
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("[assemble] Starting export phase...");

  const tokens   = loadTokens();
  const brief    = loadBrief();
  const registry = loadRegistry();

  const slideFiles = enumerateSlides();
  console.log(`[assemble] ${slideFiles.length} slides found in ${PATHS.slidesDir}`);

  // Classify each slide
  const classified = slideFiles.map((filename) => {
    const slideNum    = slideNumber(filename);
    const htmlContent = fs.readFileSync(path.join(PATHS.slidesDir, filename), "utf8");
    const mode        = classifySlide(slideNum, htmlContent, brief);
    console.log(`[assemble] Slide ${slideNum}: ${mode}`);
    return { slideNum, filename, mode, htmlContent };
  });

  const editableSlides   = classified.filter((s) => s.mode === "editable");
  const screenshotSlides = classified.filter((s) => s.mode === "screenshot");

  console.log(
    `[assemble] Editable: ${editableSlides.length}, Screenshot: ${screenshotSlides.length}`
  );

  // Render screenshots for screenshot-mode slides
  const screenshotsDir = PATHS.screenshotsDir || path.join(PATHS.slidesDir, "../screenshots");
  if (screenshotSlides.length > 0) {
    await renderScreenshots(screenshotSlides, screenshotsDir, PATHS.slidesDir);
  }

  // Set up PptxGenJS
  const pptx = new pptxgen();
  pptx.defineLayout({
    name: "WIDESCREEN_16x9",
    width:  PPTX_WIDTH_IN,
    height: PPTX_HEIGHT_IN,
  });
  pptx.layout = "WIDESCREEN_16x9";
  pptx.title  = brief.title || tokens?.meta?.title || "Mastermind Deck";

  // Launch browser for editable slide element extraction
  let browser = null;
  let context = null;
  let page    = null;

  if (editableSlides.length > 0) {
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--font-render-hinting=none"],
    });
    context = await browser.newContext({
      viewport: { width: HTML_WIDTH_PX, height: HTML_HEIGHT_PX },
      deviceScaleFactor: 1,
    });
    page = await context.newPage();
  }

  try {
    // Process all slides in original order
    for (const slide of classified) {
      const { slideNum, filename, mode } = slide;

      if (mode === "editable") {
        console.log(`[assemble] Building editable slide ${slideNum}...`);
        try {
          const elements = await extractElements(page, path.join(PATHS.slidesDir, filename));
          buildEditableSlide(pptx, elements, slideNum);
        } catch (err) {
          console.error(`[assemble] Slide ${slideNum} failed: ${err.message}`);
          const errSlide = pptx.addSlide();
          errSlide.addText(`[Slide ${slideNum} render error: ${err.message}]`, {
            x: 0.5, y: 3, w: 12, h: 1.5,
            fontFace: "Arial", fontSize: 18, color: "FF0000",
          });
        }
      } else {
        // Screenshot mode
        const pngName = `slide-${String(slideNum).padStart(2, "0")}.png`;
        const pngPath = path.join(screenshotsDir, pngName);

        if (!fs.existsSync(pngPath)) {
          console.error(`[assemble] PNG not found for screenshot slide ${slideNum}: ${pngPath}`);
          const errSlide = pptx.addSlide();
          errSlide.addText(`[Slide ${slideNum}: screenshot PNG missing]`, {
            x: 0.5, y: 3, w: 12, h: 1.5, fontFace: "Arial", fontSize: 18, color: "FF0000",
          });
          continue;
        }

        console.log(`[assemble] Building screenshot slide ${slideNum} from ${pngName}...`);

        // Optionally extract data-slot elements for invisible a11y text layer
        let elements = null;
        if (page) {
          try {
            elements = await extractElements(page, path.join(PATHS.slidesDir, filename));
          } catch {
            // Non-critical — proceed without a11y layer
          }
        }

        buildScreenshotSlide(pptx, pngPath, elements, slideNum);
      }
    }
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
  }

  // Inject speaker notes
  const notesDir  = PATHS.notesDir  && fs.existsSync(PATHS.notesDir)  ? PATHS.notesDir  : null;
  const notesFile = PATHS.notesFile && fs.existsSync(PATHS.notesFile) ? PATHS.notesFile : null;

  if (notesDir || notesFile) {
    await injectNotes(pptx, {
      notesDir,
      notesFile,
      slideCount: classified.length,
    });
  }

  // Write output PPTX
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  await pptx.writeFile({ fileName: OUT_PATH });

  console.log(`\n[assemble] PPTX assembled: ${OUT_PATH}`);
  console.log(`[assemble] Total slides: ${classified.length}`);
  console.log(`[assemble]   Editable:   ${editableSlides.length}`);
  console.log(`[assemble]   Screenshot: ${screenshotSlides.length}`);

  if (screenshotSlides.length > 0) {
    console.log(
      `[assemble] Screenshot slides (non-editable, pixel-perfect): ` +
      screenshotSlides.map((s) => s.slideNum).join(", ")
    );
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
