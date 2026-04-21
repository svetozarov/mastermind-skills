/**
 * notes-injector.mjs
 * Injects speaker notes into a PptxGenJS presentation object.
 *
 * Supported input formats:
 *   1. Per-slide files: slides-dir/slide-NN.notes.md
 *   2. Single unified file with headings: ## Slide NN  (or ## Slide N)
 *
 * Notes are converted from Markdown to plain text (PPTX notes are always plain).
 *
 * Usage (as module):
 *   import { injectNotes } from "./export/notes-injector.mjs";
 *   await injectNotes(pptx, { notesDir, unifiedFile, slideCount });
 *
 * Usage (CLI):
 *   node notes-injector.mjs --pptx <deck.pptx> --notes-dir <dir>
 *   node notes-injector.mjs --pptx <deck.pptx> --notes-file <speaker-notes.md>
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// Markdown to plain text (minimal, no external deps)
// ---------------------------------------------------------------------------

/**
 * Strip Markdown formatting from a string, returning clean plain text.
 * PPTX notes are always rendered as plain — no need for full parsing.
 */
function markdownToPlain(md) {
  return md
    // Remove headings (#, ##, etc.)
    .replace(/^#{1,6}\s+/gm, "")
    // Bold + italic combinations
    .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
    .replace(/_{1,3}([^_]+)_{1,3}/g, "$1")
    // Inline code
    .replace(/`([^`]+)`/g, "$1")
    // Code blocks
    .replace(/```[\s\S]*?```/g, "")
    // Links: [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Images: ![alt](src) -> alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    // Blockquotes
    .replace(/^>\s+/gm, "")
    // Horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, "")
    // List markers (unordered)
    .replace(/^[\s]*[-*+]\s+/gm, "- ")
    // List markers (ordered)
    .replace(/^[\s]*\d+\.\s+/gm, "")
    // Collapse multiple blank lines
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Notes loading
// ---------------------------------------------------------------------------

/**
 * Load notes from per-slide files in a directory.
 * Returns Map<slideIndex (1-based), string>
 */
function loadNotesFromDir(notesDir) {
  const map = new Map();
  if (!fs.existsSync(notesDir)) return map;

  const files = fs.readdirSync(notesDir).filter((f) =>
    /^slide-(\d+)\.notes\.md$/i.test(f)
  );

  for (const file of files) {
    const m = file.match(/^slide-(\d+)\.notes\.md$/i);
    if (!m) continue;
    const idx = parseInt(m[1], 10);
    const raw = fs.readFileSync(path.join(notesDir, file), "utf8");
    map.set(idx, markdownToPlain(raw));
  }

  console.log(`[notes-injector] Loaded ${map.size} per-slide note files from ${notesDir}`);
  return map;
}

/**
 * Load notes from a single unified Markdown file.
 * Sections are separated by ## Slide N or ## Slide NN headings.
 * Returns Map<slideIndex (1-based), string>
 */
function loadNotesFromUnifiedFile(filePath) {
  const map = new Map();
  if (!fs.existsSync(filePath)) {
    console.warn(`[notes-injector] Unified notes file not found: ${filePath}`);
    return map;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  // Split by "## Slide N" headings (case-insensitive)
  const sections = raw.split(/^##\s+slide\s+(\d+)/im);

  // sections[0] = content before first heading (preamble, skip)
  // sections[1] = slide number, sections[2] = content, ...
  for (let i = 1; i < sections.length - 1; i += 2) {
    const idx = parseInt(sections[i], 10);
    const content = sections[i + 1] || "";
    map.set(idx, markdownToPlain(content));
  }

  console.log(
    `[notes-injector] Loaded ${map.size} slide sections from ${filePath}`
  );
  return map;
}

// ---------------------------------------------------------------------------
// Core injection
// ---------------------------------------------------------------------------

/**
 * Inject speaker notes into a PptxGenJS presentation object.
 *
 * @param {object} pptx - PptxGenJS instance (slides must already be added)
 * @param {object} opts
 * @param {string} [opts.notesDir]      - Directory with slide-NN.notes.md files
 * @param {string} [opts.notesFile]     - Unified speaker-notes.md file
 * @param {number} [opts.slideCount]    - Total slides expected (for validation)
 * @returns {{ injected: number, missing: number[] }}
 */
export async function injectNotes(pptx, opts = {}) {
  const { notesDir, notesFile, slideCount } = opts;

  let notesMap = new Map();

  // Per-slide directory takes precedence; unified file as fallback
  if (notesDir && fs.existsSync(notesDir)) {
    notesMap = loadNotesFromDir(notesDir);
  } else if (notesFile && fs.existsSync(notesFile)) {
    notesMap = loadNotesFromUnifiedFile(notesFile);
  } else if (notesDir) {
    notesMap = loadNotesFromDir(notesDir);
  } else if (notesFile) {
    notesMap = loadNotesFromUnifiedFile(notesFile);
  } else {
    console.warn("[notes-injector] No notes source provided (notesDir or notesFile).");
    return { injected: 0, missing: [] };
  }

  if (notesMap.size === 0) {
    console.warn("[notes-injector] No notes found — nothing to inject.");
    return { injected: 0, missing: [] };
  }

  const slides = pptx.slides;
  if (!slides || slides.length === 0) {
    throw new Error(
      "[notes-injector] pptx.slides is empty — inject notes AFTER adding slides."
    );
  }

  let injected = 0;
  const missing = [];

  for (let i = 0; i < slides.length; i++) {
    const slideNum = i + 1;
    const note = notesMap.get(slideNum);
    if (note) {
      slides[i].addNotes(note);
      injected++;
      console.log(
        `[notes-injector] Slide ${slideNum}: injected ${note.length} chars`
      );
    } else {
      missing.push(slideNum);
      console.log(`[notes-injector] Slide ${slideNum}: no notes found`);
    }
  }

  if (slideCount && slides.length !== slideCount) {
    console.warn(
      `[notes-injector] Expected ${slideCount} slides, found ${slides.length}`
    );
  }

  console.log(
    `[notes-injector] Done: ${injected} injected, ${missing.length} missing [${missing.join(", ")}]`
  );
  return { injected, missing };
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

async function runCli() {
  const { values: args } = parseArgs({
    options: {
      "pptx":        { type: "string" },
      "notes-dir":   { type: "string" },
      "notes-file":  { type: "string" },
      "out":         { type: "string" },
      "help":        { type: "boolean", short: "h", default: false },
    },
    strict: false,
  });

  if (args.help || !args.pptx) {
    console.log(`
notes-injector.mjs — inject speaker notes into an existing .pptx

Options:
  --pptx <file>         Input .pptx file (required)
  --notes-dir <dir>     Directory with slide-NN.notes.md per-slide files
  --notes-file <md>     Single unified speaker-notes.md file
  --out <file>          Output .pptx path (default: overwrites input)
  --help                Show this help
`);
    process.exit(args.help ? 0 : 1);
  }

  // Dynamic import to avoid requiring pptxgenjs at module-level
  const { default: pptxgen } = await import("pptxgenjs");

  const inputPath = path.resolve(args.pptx);
  if (!fs.existsSync(inputPath)) {
    console.error(`[ERROR] PPTX not found: ${inputPath}`);
    process.exit(1);
  }

  // Load existing PPTX
  const pptx = new pptxgen();
  await pptx.load(inputPath);

  await injectNotes(pptx, {
    notesDir: args["notes-dir"] ? path.resolve(args["notes-dir"]) : undefined,
    notesFile: args["notes-file"] ? path.resolve(args["notes-file"]) : undefined,
  });

  const outPath = path.resolve(args.out || inputPath);
  await pptx.writeFile({ fileName: outPath });
  console.log(`[notes-injector] Saved to ${outPath}`);
}

// Only run CLI when executed directly (not imported as a module)
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(import.meta.filename || "")
) {
  runCli().catch((err) => {
    console.error("[FATAL]", err);
    process.exit(1);
  });
}
