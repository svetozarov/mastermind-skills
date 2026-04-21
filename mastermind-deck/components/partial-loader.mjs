/**
 * partial-loader.mjs
 * Mastermind Deck — programmatic slot substitution for HTML partials.
 *
 * Usage:
 *   import { loadPartial } from './partial-loader.mjs';
 *
 *   const html = await loadPartial('cover.html', {
 *     title: 'Как мы переосмыслили дворовое пространство',
 *     date:  '21 апреля 2026',
 *     code:  'MR-042'
 *   }, { registryPath: './layouts-registry.json' });
 *
 * Behaviour:
 *   - Reads HTML partial, finds all [data-slot] elements
 *   - Substitutes text content or src attribute from values map
 *   - Enforces max_chars from registry (applies ellipsis CSS class, never truncates string)
 *   - Hides optional elements whose slot value is empty/undefined (sets display:none)
 *   - Hides [data-optional="true"] items when their slot values are all empty
 *   - Injects Fitty script stub for [data-fitty="true"] elements
 *   - Returns sanitised HTML string ready for Playwright or file write
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Load a partial and substitute slot values.
 *
 * @param {string} partialFile  — filename (e.g. 'cover.html'), relative to components/
 * @param {Object} values       — map of slot name → string or image src
 * @param {Object} [options]
 * @param {string} [options.componentsDir] — override components directory path
 * @param {string} [options.registryPath]  — override registry JSON path
 * @param {boolean} [options.injectFitty]  — inject Fitty CDN script (default: true)
 * @returns {Promise<string>}   — complete HTML string (no <html>/<head>)
 */
export async function loadPartial(partialFile, values = {}, options = {}) {
  const componentsDir = options.componentsDir ?? __dirname;
  const registryPath  = options.registryPath  ?? path.join(__dirname, 'layouts-registry.json');
  const injectFitty   = options.injectFitty   ?? true;

  // Load partial HTML
  const partialPath = path.join(componentsDir, partialFile);
  let html = await fs.readFile(partialPath, 'utf8');

  // Strip HTML comments up-front. Without this step, the slot-substitution regex
  // `<[^>]+data-slot="..."[^>]*>...</tag>` can match across a commented-out slot
  // tag at the top of a partial and consume the real opening tag of the slide,
  // destroying the structure.
  html = stripHtmlComments(html);

  // Load registry for max_chars metadata
  const registry = await loadRegistry(registryPath);
  const layoutKey = partialFile.replace(/\.html$/, '');
  const slotMeta  = registry[layoutKey]?.slots ?? {};

  // Parse with lightweight regex-based substitution
  // (No DOM parser dependency — keeps this script zero-dep)
  html = substituteSlots(html, values, slotMeta);
  html = hideEmptyOptionals(html);

  // Inject Fitty for hero titles / stat numbers
  if (injectFitty) {
    html = injectFittyScript(html, values, slotMeta);
  }

  return html;
}

/**
 * Batch-load multiple partials and write to output directory.
 *
 * @param {Array<{file: string, values: Object, outName: string}>} slides
 * @param {string} outDir
 * @param {Object} [options]
 * @returns {Promise<string[]>} — list of written file paths
 */
export async function buildSlides(slides, outDir, options = {}) {
  await fs.mkdir(outDir, { recursive: true });

  // Resolve CSS hrefs once. Priority order:
  //   1. Explicit options.globalsHref / options.baseCssHref — used as-is
  //   2. options.cssBasePath — absolute base, emit file:// URLs
  //   3. Default: copy base.css next to slides and use sibling hrefs
  const cssHrefs = await resolveCssHrefs(outDir, options);

  const written = [];
  for (const slide of slides) {
    const html     = await loadPartial(slide.file, slide.values, options);
    const outPath  = path.join(outDir, slide.outName ?? slide.file);
    await fs.writeFile(outPath, wrapSlide(html, cssHrefs), 'utf8');
    written.push(outPath);
  }
  return written;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Load and parse registry JSON (cached per process) */
const _registryCache = new Map();
async function loadRegistry(registryPath) {
  if (_registryCache.has(registryPath)) return _registryCache.get(registryPath);
  const raw = await fs.readFile(registryPath, 'utf8');
  const parsed = JSON.parse(raw);
  _registryCache.set(registryPath, parsed);
  return parsed;
}

/**
 * Substitute [data-slot="name"] elements.
 * - Text slots: replaces text content between tags
 * - Image slots: sets src attribute
 * - Alt slots: sets alt attribute on sibling img via data-slot-alt
 * - Overflow guard: adds .slot--overflow class (not truncation) when text exceeds max_chars
 */
function substituteSlots(html, values, slotMeta) {
  // Text content substitution: data-slot="name">...old...</tag>
  html = html.replace(
    /(<[^>]+data-slot="([^"]+)"[^>]*>)([\s\S]*?)(<\/[a-zA-Z]+>)/g,
    (match, openTag, slotName, _content, closeTag) => {
      const value = values[slotName];

      // Skip image-type slots (handled separately)
      if (openTag.includes('type="image"')) return match;

      // Empty optional slot: leave content blank (hideEmptyOptionals will handle display)
      if (value === undefined || value === null || value === '') {
        return `${openTag}${closeTag}`;
      }

      const meta    = slotMeta[slotName] ?? {};
      const maxChars = meta.max_chars;
      const textVal  = String(value);

      // Apply overflow CSS class if text exceeds max_chars (no string truncation)
      let overflowClass = '';
      if (maxChars && textVal.length > maxChars) {
        overflowClass = ' slot--overflow';
        // Add class to opening tag
        const tagWithClass = addClassToTag(openTag, 'slot--overflow');
        return `${tagWithClass}${textVal}${closeTag}`;
      }

      return `${openTag}${textVal}${closeTag}`;
    }
  );

  // Image src substitution: <img data-slot="name" src="" ...>
  for (const [slotName, value] of Object.entries(values)) {
    if (!value || typeof value !== 'string') continue;
    // Match img with data-slot="slotName"
    html = html.replace(
      new RegExp(`(<img[^>]*data-slot="${escapeRe(slotName)}"[^>]*)(src="[^"]*")`, 'g'),
      (match, before, _src) => `${before}src="${escapeHtml(value)}"`
    );
  }

  // Alt attribute substitution: data-slot-alt="altSlotName" on img tags
  html = html.replace(
    /(<img[^>]*data-slot-alt="([^"]+)"[^>]*)(alt="[^"]*")/g,
    (match, before, altSlotName, _alt) => {
      const altValue = values[altSlotName] ?? '';
      return `${before}alt="${escapeHtml(String(altValue))}"`;
    }
  );

  return html;
}

/**
 * Hide elements whose ALL data-slot children resolved to empty strings.
 * Strategy: add style="display:none" to [data-optional="true"] parent
 * when all its [data-slot] children are empty.
 */
function hideEmptyOptionals(html) {
  // Simple heuristic: if data-optional element has no non-whitespace text content
  // after substitution, mark it hidden.
  // This regex matches <div ... data-optional="true" ...>...</div> blocks
  return html.replace(
    /(<[a-zA-Z]+[^>]*data-optional="true"[^>]*>)([\s\S]*?)(<\/[a-zA-Z]+>)/g,
    (match, openTag, content, closeTag) => {
      // Check if content has any meaningful text (non-whitespace, non-empty-tag)
      const stripped = content.replace(/<[^>]+>/g, '').trim();
      if (!stripped) {
        const hiddenTag = addStyleToTag(openTag, 'display:none');
        return `${hiddenTag}${content}${closeTag}`;
      }
      return match;
    }
  );
}

/**
 * Inject Fitty initialisation for elements with data-fitty="true".
 * Uses CDN Fitty; in production replace with local copy.
 */
function injectFittyScript(html, values, slotMeta) {
  // Check if any fitty slot has a value
  const hasFitty = Object.entries(slotMeta).some(
    ([name, meta]) => meta.fitty && values[name]
  );
  if (!hasFitty) return html;

  const fittyScript = `
<script>
// Fitty: pixel-perfect font scaling for hero titles and stat numbers
(function() {
  function loadFitty(cb) {
    if (window.fitty) { cb(); return; }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/fitty@2/dist/fitty.min.js';
    s.onload = cb;
    document.head.appendChild(s);
  }
  loadFitty(function() {
    document.querySelectorAll('[data-fitty="true"]').forEach(function(el) {
      fitty(el, { minSize: 24, maxSize: 240, multiLine: false });
    });
  });
})();
</script>`;

  // Inject before closing </section>
  return html.replace(/<\/section>/, fittyScript + '\n</section>');
}

/**
 * Wrap partial fragment in minimal standalone HTML document for Playwright.
 * Accepts pre-resolved CSS hrefs (see resolveCssHrefs).
 */
function wrapSlide(partialHtml, cssHrefs = { globals: '../globals.css', base: '../components/base.css' }) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920" />
  <link rel="stylesheet" href="${cssHrefs.globals}" />
  <link rel="stylesheet" href="${cssHrefs.base}" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      width: 1920px;
      height: 1080px;
      overflow: hidden;
      display: flex;
    }
  </style>
</head>
<body>
${partialHtml}
</body>
</html>`;
}

/**
 * Decide how the generated slides reference globals.css and base.css.
 *
 * Priority:
 *   1. Explicit `options.globalsHref` / `options.baseCssHref` — respected verbatim
 *   2. `options.cssBasePath` (absolute path where both files live) — emit file:// URLs
 *   3. Default: copy base.css into `outDir/components/base.css` so `../components/base.css`
 *      resolves regardless of where the project directory sits
 */
async function resolveCssHrefs(outDir, options) {
  if (options.globalsHref && options.baseCssHref) {
    return { globals: options.globalsHref, base: options.baseCssHref };
  }

  if (options.cssBasePath) {
    const abs = path.resolve(options.cssBasePath);
    return {
      globals: pathToFileUrl(path.join(abs, 'globals.css')),
      base:    pathToFileUrl(path.join(abs, 'base.css')),
    };
  }

  // Default: copy base.css next to slides for reliable relative resolution
  const componentsDir = options.componentsDir ?? __dirname;
  const targetDir     = path.resolve(outDir, '..', 'components');
  await fs.mkdir(targetDir, { recursive: true });
  try {
    await fs.copyFile(
      path.join(componentsDir, 'base.css'),
      path.join(targetDir, 'base.css'),
    );
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  return { globals: '../globals.css', base: '../components/base.css' };
}

function pathToFileUrl(p) {
  const resolved = path.resolve(p).replace(/\\/g, '/');
  return resolved.startsWith('/') ? `file://${resolved}` : `file:///${resolved}`;
}

/**
 * Remove HTML comments (<!-- ... -->) from a string.
 * Used before slot substitution so the regex can't accidentally consume a
 * commented-out slot tag at the top of a partial.
 */
function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

// ─── String utilities ─────────────────────────────────────────────────────────

function addClassToTag(tag, cls) {
  if (tag.includes('class="')) {
    return tag.replace(/class="([^"]*)"/, `class="$1 ${cls}"`);
  }
  return tag.replace(/>$/, ` class="${cls}">`);
}

function addStyleToTag(tag, style) {
  if (tag.includes('style="')) {
    return tag.replace(/style="([^"]*)"/, `style="$1; ${style}"`);
  }
  return tag.replace(/>$/, ` style="${style}">`);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeRe(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
