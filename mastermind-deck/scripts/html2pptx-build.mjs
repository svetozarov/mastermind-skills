/**
 * html2pptx-build.mjs
 * Converts validated HTML slides to an editable PPTX via PptxGenJS.
 *
 * PRIMARY path: element-by-element coordinate extraction via Playwright
 * (getBoundingClientRect) + PptxGenJS text/image/shape placement.
 * This avoids reliance on the external html2pptx.js npm package
 * (not yet available as a public module as of April 2026).
 *
 * Slides flagged for screenshot-mode (font_fidelity: strict, or non-web-safe
 * fonts detected) are SKIPPED here and handled by assemble-deck.mjs instead.
 *
 * CLI:
 *   node html2pptx-build.mjs \
 *     --slides-dir <dir> \
 *     --tokens <tokens.json> \
 *     --registry <layouts-registry.json> \
 *     --out <deck.pptx> \
 *     [--brief <deck-brief.yaml>]
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "playwright";
import pptxgen from "pptxgenjs";
import { parse as parseYaml } from "yaml";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    "slides-dir": { type: "string" },
    "tokens":     { type: "string" },
    "registry":   { type: "string" },
    "out":        { type: "string" },
    "brief":      { type: "string" },
    "help":       { type: "boolean", short: "h", default: false },
  },
  strict: false,
});

if (args.help || !args["slides-dir"] || !args.tokens || !args.out) {
  console.log(`
html2pptx-build.mjs — convert HTML slides to editable PPTX

Options:
  --slides-dir <dir>     Directory with slide-NN.html files (required)
  --tokens <json>        Path to tokens.json (required)
  --registry <json>      Path to layouts-registry.json (optional)
  --out <pptx>           Output PPTX file path (required)
  --brief <yaml>         Path to deck-brief.yaml (optional)
  --help                 Show this help

Slides with font_fidelity: strict or non-web-safe fonts are skipped (handled
by assemble-deck.mjs via screenshot path).
`);
  process.exit(args.help ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// PPTX 16:9 Widescreen: 13.33" x 7.5" (exact mapping from 1920x1080 HTML)
const PPTX_WIDTH_IN  = 13.33;
const PPTX_HEIGHT_IN = 7.5;

// HTML slide canonical dimensions
const HTML_WIDTH_PX  = 1920;
const HTML_HEIGHT_PX = 1080;

// Web-safe fonts accepted by html2pptx / PptxGenJS without corruption
const WEB_SAFE_FONTS = new Set([
  "arial", "helvetica", "times new roman", "georgia", "courier new",
  "verdana", "tahoma", "trebuchet ms", "impact",
  "sans-serif", "serif", "monospace", "cursive", "fantasy",
  "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace",
]);

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

/**
 * Convert px coordinates to PPTX inches, given HTML canvas dimensions.
 */
function toInches(px, axis) {
  if (axis === "x") return (px / HTML_WIDTH_PX)  * PPTX_WIDTH_IN;
  if (axis === "y") return (px / HTML_HEIGHT_PX) * PPTX_HEIGHT_IN;
  if (axis === "w") return (px / HTML_WIDTH_PX)  * PPTX_WIDTH_IN;
  if (axis === "h") return (px / HTML_HEIGHT_PX) * PPTX_HEIGHT_IN;
  throw new Error(`Unknown axis: ${axis}`);
}

/**
 * Convert px font size to PPTX points.
 * PPTX points and CSS px are numerically equal (both 1/72 inch
 * at 96 DPI: 1px ≈ 0.75pt, but PptxGenJS accepts pt directly).
 * Approximation: pt = px * 0.75 (at standard 96 DPI screen).
 */
function pxToPt(px) {
  return Math.round(px * 0.75 * 10) / 10;
}

// ---------------------------------------------------------------------------
// Tokens + brief loading
// ---------------------------------------------------------------------------

function loadTokens(tokensPath) {
  const raw = fs.readFileSync(path.resolve(tokensPath), "utf8");
  return JSON.parse(raw);
}

function loadBrief(briefPath) {
  if (!briefPath || !fs.existsSync(path.resolve(briefPath))) return {};
  const raw = fs.readFileSync(path.resolve(briefPath), "utf8");
  return parseYaml(raw) || {};
}

function loadRegistry(registryPath) {
  if (!registryPath || !fs.existsSync(path.resolve(registryPath))) return null;
  const raw = fs.readFileSync(path.resolve(registryPath), "utf8");
  return JSON.parse(raw);
}

/**
 * Resolve a token alias like {color.ink} to its $value.
 */
function resolveToken(ref, tokens) {
  if (typeof ref !== "string" || !ref.startsWith("{")) return ref;
  const keys = ref.replace(/^\{|\}$/g, "").split(".");
  let node = tokens;
  for (const k of keys) {
    if (!node || typeof node !== "object") return ref;
    node = node[k];
  }
  return node?.$value ?? node ?? ref;
}

/**
 * Extract a flat color palette from tokens for use in slide background detection.
 */
function extractPalette(tokens) {
  const palette = {};
  function walk(obj, prefix) {
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === "object") {
        if (v.$type === "color" && v.$value) {
          palette[key] = v.$value;
        } else {
          walk(v, key);
        }
      }
    }
  }
  walk(tokens, "");
  return palette;
}

// ---------------------------------------------------------------------------
// Font safety
// ---------------------------------------------------------------------------

function isWebSafe(fontFamily) {
  if (!fontFamily) return true;
  // font-family may be a comma-separated stack; check at least the first
  const first = fontFamily.split(",")[0].trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  return WEB_SAFE_FONTS.has(first);
}

function resolveFont(rawFamily, tokens) {
  // Prefer explicit token values; fallback to Arial if not web-safe
  const resolved = rawFamily || resolveToken(tokens?.font?.text?.$value, tokens) || "Arial";
  if (!isWebSafe(resolved)) {
    const first = resolved.split(",")[0].trim();
    console.warn(`[html2pptx] Non-web-safe font "${first}" — falling back to Arial`);
    return "Arial";
  }
  return resolved.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
}

// ---------------------------------------------------------------------------
// Playwright element extraction
// ---------------------------------------------------------------------------

/**
 * Extract all meaningful elements from a rendered HTML slide via Playwright.
 * Returns an array of element descriptors with bounding boxes, text, and styles.
 */
async function extractSlideElements(page, htmlPath) {
  const fileUrl = htmlPath.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:");

  await page.goto(fileUrl, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(150); // let Fitty / layout settle

  const elements = await page.evaluate(() => {
    const results = [];

    // Selectors in priority order: text containers first, then images, then backgrounds
    const TEXT_SELECTORS = [
      "h1", "h2", "h3", "h4", "h5", "h6",
      "p", "li", "figcaption",
      "[data-slot]",
      ".slide-title", ".slide-body", ".slide-caption",
      ".text-block", ".stat-number", ".quote-text",
    ];

    const IMAGE_SELECTORS = ["img"];

    const BG_SELECTORS = [
      ".slide",
      "section.slide",
      "[class*='slide']",
    ];

    function rectToObj(rect) {
      return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
    }

    function getStyle(el) {
      const cs = window.getComputedStyle(el);
      return {
        fontFamily:   cs.fontFamily,
        fontSize:     parseFloat(cs.fontSize),
        fontWeight:   cs.fontWeight,
        fontStyle:    cs.fontStyle,
        color:        cs.color,
        textAlign:    cs.textAlign,
        lineHeight:   cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        backgroundColor: cs.backgroundColor,
        textTransform: cs.textTransform,
        display:      cs.display,
        opacity:      parseFloat(cs.opacity),
      };
    }

    // Background from slide root
    const slideRoot = document.querySelector(".slide, section, body");
    if (slideRoot) {
      const rect = rectToObj(slideRoot.getBoundingClientRect());
      const cs = window.getComputedStyle(slideRoot);
      results.push({
        type: "background",
        rect,
        backgroundColor: cs.backgroundColor,
        backgroundImage: cs.backgroundImage,
      });
    }

    // Text elements
    for (const sel of TEXT_SELECTORS) {
      const nodes = document.querySelectorAll(sel);
      for (const el of nodes) {
        const rect = el.getBoundingClientRect();
        // Skip zero-size or off-canvas elements
        if (rect.width < 1 || rect.height < 1) continue;
        if (rect.x > 1920 || rect.y > 1080) continue;

        const style = getStyle(el);
        const text = el.innerText?.trim();
        if (!text) continue;

        results.push({
          type: "text",
          tag: el.tagName.toLowerCase(),
          rect: rectToObj(rect),
          text,
          style,
          dataSlot: el.dataset?.slot || null,
        });
      }
    }

    // Image elements
    for (const sel of IMAGE_SELECTORS) {
      const nodes = document.querySelectorAll(sel);
      for (const el of nodes) {
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;

        results.push({
          type: "image",
          rect: rectToObj(rect),
          src: el.src || el.getAttribute("src"),
          alt: el.alt,
          objectFit: window.getComputedStyle(el).objectFit,
        });
      }
    }

    return results;
  });

  return elements;
}

// ---------------------------------------------------------------------------
// Color parsing helpers
// ---------------------------------------------------------------------------

function cssColorToHex(cssColor) {
  if (!cssColor || cssColor === "transparent" || cssColor === "rgba(0, 0, 0, 0)") return null;

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgb = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgb) {
    const r = parseInt(rgb[1], 10);
    const g = parseInt(rgb[2], 10);
    const b = parseInt(rgb[3], 10);
    return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`.toUpperCase();
  }

  // Already hex
  if (/^#[0-9A-Fa-f]{3,8}$/.test(cssColor)) return cssColor.toUpperCase();

  return null;
}

function fontWeightToString(fw) {
  const n = parseInt(fw, 10);
  if (isNaN(n)) return fw;
  return n >= 600 ? "bold" : "normal";
}

// ---------------------------------------------------------------------------
// PptxGenJS slide builder
// ---------------------------------------------------------------------------

/**
 * Build one PPTX slide from extracted DOM elements.
 */
function buildSlide(pptx, elements, tokens, slideIndex) {
  const slide = pptx.addSlide();

  for (const el of elements) {
    if (el.type === "background") {
      const bg = cssColorToHex(el.backgroundColor);
      if (bg) {
        slide.background = { color: bg.replace("#", "") };
      }
      continue;
    }

    const { rect } = el;
    // Convert px to inches for PptxGenJS (x, y, w, h)
    const pos = {
      x: toInches(Math.max(0, rect.x), "x"),
      y: toInches(Math.max(0, rect.y), "y"),
      w: toInches(Math.min(rect.w, HTML_WIDTH_PX  - rect.x), "w"),
      h: toInches(Math.min(rect.h, HTML_HEIGHT_PX - rect.y), "h"),
    };

    // Clamp to slide bounds
    if (pos.x >= PPTX_WIDTH_IN || pos.y >= PPTX_HEIGHT_IN) continue;
    pos.w = Math.min(pos.w, PPTX_WIDTH_IN  - pos.x);
    pos.h = Math.min(pos.h, PPTX_HEIGHT_IN - pos.y);
    if (pos.w <= 0 || pos.h <= 0) continue;

    if (el.type === "text") {
      const { style } = el;
      const fontFamily = resolveFont(style.fontFamily, tokens);
      const fontSize = pxToPt(style.fontSize || 20);
      const color = cssColorToHex(style.color);
      const isBold = fontWeightToString(style.fontWeight) === "bold";
      const isItalic = style.fontStyle === "italic";

      // Map CSS text-align to PptxGenJS align values
      const alignMap = { left: "left", center: "ctr", right: "right", justify: "justify" };
      const align = alignMap[style.textAlign] || "left";

      slide.addText(el.text, {
        ...pos,
        fontFace: fontFamily,
        fontSize,
        color: color ? color.replace("#", "") : "0A0A0A",
        bold: isBold,
        italic: isItalic,
        align,
        wrap: true,
        // Prevent PptxGenJS from adding auto-fit shrink (preserves layout intent)
        autoFit: false,
        shrinkText: false,
      });
    } else if (el.type === "image") {
      if (!el.src) continue;

      // Skip data URIs that are too large (>5MB)
      if (el.src.startsWith("data:") && el.src.length > 5_000_000) {
        console.warn(`[html2pptx] Slide ${slideIndex}: large data URI image skipped`);
        continue;
      }

      // Resolve relative paths against slides directory
      let imgPath = el.src;
      if (!imgPath.startsWith("http") && !imgPath.startsWith("data:") && !imgPath.startsWith("file:")) {
        // Relative — skip (no resolution context here; handled upstream)
        continue;
      }

      try {
        slide.addImage({
          ...pos,
          path: imgPath.startsWith("file:") ? imgPath.replace(/^file:\/\/\//, "") : undefined,
          data: imgPath.startsWith("data:") ? imgPath : undefined,
          hyperlink: undefined,
          sizing: {
            type: el.objectFit === "cover" ? "cover" : "contain",
            w: pos.w,
            h: pos.h,
          },
        });
      } catch (err) {
        console.warn(`[html2pptx] Slide ${slideIndex}: image insert failed — ${err.message}`);
      }
    }
  }

  return slide;
}

// ---------------------------------------------------------------------------
// Slide classification (screenshot vs editable)
// ---------------------------------------------------------------------------

/**
 * Determine if a slide should be handled via screenshot path.
 * Criteria:
 *   1. brief.font_fidelity === "strict"
 *   2. Per-slide font_fidelity in brief.slides[N]
 *   3. Non-web-safe fonts detected in HTML text
 */
function shouldUseScreenshot(slideNum, htmlContent, brief) {
  // Global strict
  if (brief.font_fidelity === "strict") return true;

  // Per-slide override
  if (brief.slides && brief.slides[slideNum]?.font_fidelity === "strict") return true;

  // Detect non-web-safe fonts via regex (mirrors fonts-check.mjs logic)
  const fontRe = /font-family\s*:\s*([^;}"']+)/gi;
  let m;
  while ((m = fontRe.exec(htmlContent)) !== null) {
    const families = m[1].split(",").map((f) => f.trim().replace(/^['"]|['"]$/g, "").toLowerCase());
    for (const f of families) {
      if (!WEB_SAFE_FONTS.has(f)) {
        console.log(`[html2pptx] Slide ${slideNum}: non-web-safe font "${f}" — screenshot-mode`);
        return true;
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const slidesDir  = path.resolve(args["slides-dir"]);
  const tokensPath = path.resolve(args.tokens);
  const outPath    = path.resolve(args.out);

  // Validate inputs
  if (!fs.existsSync(slidesDir)) {
    console.error(`[ERROR] slides-dir not found: ${slidesDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(tokensPath)) {
    console.error(`[ERROR] tokens.json not found: ${tokensPath}`);
    process.exit(1);
  }

  const tokens   = loadTokens(tokensPath);
  const brief    = loadBrief(args.brief);
  const registry = loadRegistry(args.registry);

  console.log(`[html2pptx] Tokens loaded from ${tokensPath}`);
  if (registry) console.log(`[html2pptx] Registry loaded from ${args.registry}`);
  if (brief.font_fidelity) console.log(`[html2pptx] font_fidelity: ${brief.font_fidelity}`);

  // Enumerate slides
  const slideFiles = fs
    .readdirSync(slidesDir)
    .filter((f) => /^slide-\d+\.html$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)[0], 10);
      const nb = parseInt(b.match(/\d+/)[0], 10);
      return na - nb;
    });

  if (slideFiles.length === 0) {
    console.error(`[ERROR] No slide-NN.html files in ${slidesDir}`);
    process.exit(1);
  }

  console.log(`[html2pptx] ${slideFiles.length} slides found`);

  // Classify slides
  const editableSlides    = [];
  const screenshotSlides  = [];

  for (const filename of slideFiles) {
    const slideNum = parseInt(filename.match(/\d+/)[0], 10);
    const htmlContent = fs.readFileSync(path.join(slidesDir, filename), "utf8");

    if (shouldUseScreenshot(slideNum, htmlContent, brief)) {
      screenshotSlides.push({ slideNum, filename });
    } else {
      editableSlides.push({ slideNum, filename });
    }
  }

  console.log(
    `[html2pptx] Editable: ${editableSlides.length} slides, Screenshot (skipped): ${screenshotSlides.length} slides`
  );

  if (screenshotSlides.length > 0) {
    console.log(
      `[html2pptx] Screenshot slides: ${screenshotSlides.map((s) => s.slideNum).join(", ")} — pass to assemble-deck.mjs`
    );
  }

  // Set up PptxGenJS with exact 16:9 Widescreen layout
  const pptx = new pptxgen();

  // Define custom 16:9 layout (13.33" x 7.5" = exact 1920:1080 mapping)
  pptx.defineLayout({
    name: "WIDESCREEN_16x9",
    width: PPTX_WIDTH_IN,
    height: PPTX_HEIGHT_IN,
  });
  pptx.layout = "WIDESCREEN_16x9";

  // Set presentation title from brief or tokens
  const title = brief.title || tokens?.meta?.title || "Mastermind Deck";
  pptx.title = title;

  // Launch Playwright browser
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--font-render-hinting=none",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: HTML_WIDTH_PX, height: HTML_HEIGHT_PX },
    deviceScaleFactor: 1,
  });

  const page = await context.newPage();

  try {
    // Process editable slides in order
    for (const { slideNum, filename } of editableSlides) {
      const htmlPath = path.join(slidesDir, filename);
      console.log(`[html2pptx] Processing slide ${slideNum}: ${filename}`);

      try {
        const elements = await extractSlideElements(page, htmlPath);
        console.log(
          `[html2pptx]   Extracted ${elements.length} elements ` +
          `(${elements.filter((e) => e.type === "text").length} text, ` +
          `${elements.filter((e) => e.type === "image").length} images)`
        );
        buildSlide(pptx, elements, tokens, slideNum);
      } catch (err) {
        console.error(`[ERROR] Slide ${slideNum}: ${err.message}`);
        // Add an empty placeholder slide rather than aborting
        const errSlide = pptx.addSlide();
        errSlide.addText(`[Slide ${slideNum} failed to render: ${err.message}]`, {
          x: 0.5, y: 3, w: 12, h: 1.5,
          fontFace: "Arial", fontSize: 18, color: "FF0000",
        });
      }
    }
  } finally {
    await context.close();
    await browser.close();
  }

  // Write PPTX
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await pptx.writeFile({ fileName: outPath });

  console.log(`\n[html2pptx] PPTX written to ${outPath}`);
  console.log(`[html2pptx] Slides: ${editableSlides.length} editable`);
  if (screenshotSlides.length > 0) {
    console.log(
      `[html2pptx] ${screenshotSlides.length} screenshot slides NOT included — ` +
      `use assemble-deck.mjs to merge all slides into final PPTX.`
    );
  }
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
