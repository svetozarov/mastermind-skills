/**
 * fonts-check.mjs
 * Scans HTML slides for all font-family values, cross-checks against the
 * web-safe list, and warns which slides need screenshot-mode.
 *
 * Usage:
 *   node fonts-check.mjs --slides-dir <dir> [--fallback-db <json>] [--out <report.json>]
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    "slides-dir":   { type: "string" },
    "fallback-db":  { type: "string" },
    "out":          { type: "string" },
    "help":         { type: "boolean", short: "h", default: false },
  },
  strict: false,
});

if (args.help || !args["slides-dir"]) {
  console.log(`
fonts-check.mjs — scan HTML slides for non-web-safe fonts

Options:
  --slides-dir <dir>      Directory containing slide-NN.html files (required)
  --fallback-db <json>    Path to fallback-fonts.json (auto-detected if omitted)
  --out <report.json>     Where to write the JSON report (default: stdout only)
`);
  process.exit(args.help ? 0 : 1);
}

// ---------------------------------------------------------------------------
// Web-safe font list (canonical names, case-insensitive match)
// ---------------------------------------------------------------------------

const WEB_SAFE_FONTS = new Set([
  "arial",
  "helvetica",
  "times new roman",
  "georgia",
  "courier new",
  "verdana",
  "tahoma",
  "trebuchet ms",
  "impact",
  // Common generic keywords — always safe
  "sans-serif",
  "serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve path to fallback-fonts.json relative to this script's location.
 * Falls back gracefully if file is missing.
 */
function resolveFallbackDb(userPath) {
  if (userPath) {
    const resolved = path.resolve(userPath);
    if (fs.existsSync(resolved)) return resolved;
    console.warn(`[WARN] --fallback-db not found: ${resolved}`);
    return null;
  }
  // Auto-detect: look two levels up for sub-skills/.../references/fallback-fonts.json
  const candidates = [
    path.resolve(
      import.meta.dirname,
      "../../sub-skills/mastermind-deck-tokens/references/fallback-fonts.json"
    ),
    path.resolve(import.meta.dirname, "../fallback-fonts.json"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

/**
 * Parse font-family values from a CSS string.
 * Returns a list of individual font names (without quotes, lowercased).
 */
function parseFontFamilies(cssValue) {
  return cssValue
    .split(",")
    .map((f) =>
      f
        .trim()
        .replace(/^['"]|['"]$/g, "")
        .toLowerCase()
    )
    .filter(Boolean);
}

/**
 * Extract all font-family occurrences from raw HTML text via regex.
 * Does NOT load a browser — purely textual scan (fast, no network).
 */
function extractFontFamiliesFromHtml(html) {
  const families = new Set();

  // Match inline styles: font-family: ...;
  const inlineRe = /font-family\s*:\s*([^;}"']+)/gi;
  let m;
  while ((m = inlineRe.exec(html)) !== null) {
    for (const f of parseFontFamilies(m[1])) {
      families.add(f);
    }
  }

  // Match Tailwind-like class names: font-[...]
  const twRe = /font-\[([^\]]+)\]/g;
  while ((m = twRe.exec(html)) !== null) {
    families.add(m[1].replace(/^['"]|['"]$/g, "").toLowerCase());
  }

  return families;
}

/**
 * Determine whether a font name is web-safe.
 * Also accepts names that are in the fallback mapping (mapped to web-safe).
 */
function isWebSafe(fontName, fallbackMap) {
  if (WEB_SAFE_FONTS.has(fontName)) return true;
  if (fallbackMap && fallbackMap[fontName]) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const slidesDir = path.resolve(args["slides-dir"]);

  if (!fs.existsSync(slidesDir)) {
    console.error(`[ERROR] slides-dir not found: ${slidesDir}`);
    process.exit(1);
  }

  // Load fallback DB
  const fallbackDbPath = resolveFallbackDb(args["fallback-db"]);
  let fallbackMap = null;
  if (fallbackDbPath) {
    try {
      fallbackMap = JSON.parse(fs.readFileSync(fallbackDbPath, "utf8"));
      console.log(`[INFO] Loaded fallback-fonts.json from ${fallbackDbPath}`);
    } catch (err) {
      console.warn(`[WARN] Could not parse fallback-fonts.json: ${err.message}`);
    }
  } else {
    console.log("[INFO] No fallback-fonts.json found — using web-safe list only.");
  }

  // Enumerate slide files
  const slideFiles = fs
    .readdirSync(slidesDir)
    .filter((f) => /^slide-\d+\.html$/i.test(f))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)[0], 10);
      const nb = parseInt(b.match(/\d+/)[0], 10);
      return na - nb;
    });

  if (slideFiles.length === 0) {
    console.error(`[ERROR] No slide-NN.html files found in ${slidesDir}`);
    process.exit(1);
  }

  console.log(`[INFO] Scanning ${slideFiles.length} slides...`);

  const report = {
    scanned_at: new Date().toISOString(),
    slides_dir: slidesDir,
    total_slides: slideFiles.length,
    slides: [],
    summary: {
      all_web_safe: 0,
      needs_screenshot: 0,
      warnings: [],
    },
  };

  for (const filename of slideFiles) {
    const filePath = path.join(slidesDir, filename);
    const html = fs.readFileSync(filePath, "utf8");
    const families = extractFontFamiliesFromHtml(html);

    const slideResult = {
      filename,
      fonts_found: [...families],
      non_web_safe: [],
      recommended_action: "editable",
      fallback_suggestions: {},
    };

    for (const font of families) {
      if (!isWebSafe(font, fallbackMap)) {
        slideResult.non_web_safe.push(font);
        // Suggest fallback from DB if available
        if (fallbackMap) {
          // Case-insensitive lookup
          const key = Object.keys(fallbackMap).find(
            (k) => k.toLowerCase() === font
          );
          if (key) {
            slideResult.fallback_suggestions[font] = fallbackMap[key];
          } else {
            slideResult.fallback_suggestions[font] =
              "UNKNOWN — add to fallback-fonts.json or use screenshot-mode";
          }
        }
      }
    }

    if (slideResult.non_web_safe.length > 0) {
      slideResult.recommended_action = "screenshot-mode";
      report.summary.needs_screenshot += 1;
      const warning = `${filename}: non-web-safe fonts [${slideResult.non_web_safe.join(", ")}] — screenshot-mode recommended`;
      report.summary.warnings.push(warning);
      console.log(`[WARN] ${warning}`);
    } else {
      report.summary.all_web_safe += 1;
      console.log(
        `[OK]   ${filename}: all fonts web-safe [${[...families].join(", ") || "none detected"}]`
      );
    }

    report.slides.push(slideResult);
  }

  // Print summary
  console.log("\n--- Font Check Summary ---");
  console.log(`  Slides OK (editable PPTX):      ${report.summary.all_web_safe}`);
  console.log(`  Slides needing screenshot-mode: ${report.summary.needs_screenshot}`);

  if (report.summary.needs_screenshot > 0) {
    console.log(
      "\n[ACTION] Set font_fidelity: strict in deck-brief.yaml OR apply fallback fonts in HTML."
    );
    console.log("         Slides flagged for screenshot-mode:");
    for (const w of report.summary.warnings) {
      console.log(`    - ${w}`);
    }
  }

  // Write report JSON if requested
  if (args.out) {
    const outPath = path.resolve(args.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`\n[INFO] Report written to ${outPath}`);
  }

  // Exit with non-zero if any slide needs screenshot — useful for CI
  process.exit(report.summary.needs_screenshot > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
