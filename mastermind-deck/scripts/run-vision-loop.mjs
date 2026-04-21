/**
 * run-vision-loop.mjs
 * Orchestrator for the vision-loop validation of HTML slides.
 *
 * CLI usage:
 *   node run-vision-loop.mjs \
 *     --slides-dir <dir> \
 *     --out-audit  <audit.json> \
 *     [--max-iter 3] \
 *     [--budget-tokens 100000]
 *
 * For each slide-NN.html in <slides-dir>:
 *   1. Open via Playwright at 1920x1080
 *   2. Inject overflow-detector.js → "OK" or JSON bug report
 *   3. Take screenshot (once per iteration, saved as screenshots/slide-NN-iter-M.png)
 *   4. If detector says "OK" → call vision critic
 *   5. If critic score >= 9 AND issues == [] → converged
 *   6. Otherwise → call fixer, apply patched HTML, repeat (max_iter)
 *   7. After max_iter on Sonnet → escalate to Opus (2 more iterations)
 *   8. After 5 total iterations without convergence → needs_human_review: true
 *   9. Write per-slide metrics to audit.json
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY  — required
 */

import fs   from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { callCritic, callFixer } from "./lib/anthropic-client.mjs";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SONNET_MAX_ITER = 3;          // max iterations on Sonnet 4.6
const OPUS_MAX_ITER   = 2;          // additional iterations on Opus 4.7 after escalation
const TOTAL_MAX_ITER  = SONNET_MAX_ITER + OPUS_MAX_ITER;   // 5 total
const CONVERGENCE_SCORE = 9;        // critic score threshold for convergence

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    "slides-dir":    { type: "string" },
    "out-audit":     { type: "string", default: "audit.json" },
    "max-iter":      { type: "string", default: String(SONNET_MAX_ITER) },
    "budget-tokens": { type: "string", default: "100000" }
  },
  strict: false
});

const slidesDir    = args["slides-dir"];
const outAudit     = args["out-audit"];
const maxIterSonnet = Math.min(parseInt(args["max-iter"] ?? SONNET_MAX_ITER, 10), SONNET_MAX_ITER);
const budgetTokens = parseInt(args["budget-tokens"] ?? "100000", 10);

if (!slidesDir) {
  console.error("[run-vision-loop] ERROR: --slides-dir is required.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Paths to prompts
// ---------------------------------------------------------------------------

const SKILL_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
  "sub-skills",
  "mastermind-deck-visionloop",
  "references",
  "prompts"
);

function readPrompt(filename) {
  const p = path.join(SKILL_DIR, filename);
  if (!fs.existsSync(p)) {
    throw new Error(`[run-vision-loop] Prompt file not found: ${p}`);
  }
  return fs.readFileSync(p, "utf8");
}

// ---------------------------------------------------------------------------
// Playwright loader (graceful degradation)
// ---------------------------------------------------------------------------

async function loadPlaywright() {
  try {
    const mod = await import("playwright");
    return mod.chromium ?? mod.default?.chromium;
  } catch (_) {
    console.error(
      "[run-vision-loop] Playwright is not installed.\n" +
      "Install with: npm install playwright && npx playwright install chromium"
    );
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Overflow detector loader
// ---------------------------------------------------------------------------

const DETECTOR_PATH = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "overflow-detector.js"
);

function loadDetectorSource() {
  if (!fs.existsSync(DETECTOR_PATH)) {
    throw new Error(
      `[run-vision-loop] overflow-detector.js not found at: ${DETECTOR_PATH}`
    );
  }
  return fs.readFileSync(DETECTOR_PATH, "utf8");
}

// ---------------------------------------------------------------------------
// Screenshot directory
// ---------------------------------------------------------------------------

const screenshotsDir = path.join(slidesDir, "..", "screenshots");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Token budget tracker
// ---------------------------------------------------------------------------

let totalTokensUsed = 0;

function trackTokens(usage) {
  totalTokensUsed +=
    (usage.input_tokens  ?? 0) +
    (usage.output_tokens ?? 0);
}

function budgetExceeded() {
  return totalTokensUsed >= budgetTokens;
}

// ---------------------------------------------------------------------------
// Convergence check
// ---------------------------------------------------------------------------

/**
 * Returns true if the slide has converged.
 * Conditions: detector = "OK" AND critic score >= 9 AND issues = []
 */
function isConverged(detectorResult, criticResult) {
  if (detectorResult !== "OK") return false;
  if (!criticResult) return false;
  return (
    criticResult.overall_score >= CONVERGENCE_SCORE &&
    Array.isArray(criticResult.issues) &&
    criticResult.issues.length === 0
  );
}

// ---------------------------------------------------------------------------
// Build fixer user message
// ---------------------------------------------------------------------------

function buildFixerUserMessage(slideId, layout, iteration, levelHistory, bugReport) {
  return [
    `Slide: ${slideId}`,
    `Layout: ${layout}`,
    `Iteration: ${iteration} of max 5 (Levels used so far: ${JSON.stringify(levelHistory)})`,
    `cascade_level_history shows what was tried. Choose the next appropriate level.`,
    ``,
    `Bug report:`,
    `{BUG_REPORT_JSON}`,
    ``,
    `Full HTML:`,
    `{HTML_CONTENT}`
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Extract system section from a prompt file (everything after first ---\n)
// ---------------------------------------------------------------------------

function extractSystemSection(promptText) {
  // The prompt files begin with a preamble then "## System prompt (send as system)"
  // We extract everything after that heading as the system prompt.
  const marker = "## System prompt (send as system)";
  const idx = promptText.indexOf(marker);
  if (idx === -1) {
    // Fallback: return the whole file
    return promptText;
  }
  // Skip the heading line itself
  const afterHeading = promptText.slice(idx + marker.length).trimStart();
  return afterHeading;
}

// ---------------------------------------------------------------------------
// Derive layout from HTML (reads data-layout attribute)
// ---------------------------------------------------------------------------

function extractLayout(html) {
  const m = html.match(/data-layout="([^"]+)"/);
  return m ? m[1] : "unknown";
}

// ---------------------------------------------------------------------------
// Per-slide audit record
// ---------------------------------------------------------------------------

function makeAuditRecord(layout) {
  return {
    layout,
    iterations: 0,
    detector_passes: [],
    critic_scores: [],
    final_score: null,
    issues_resolved: [],
    issues_remaining: [],
    needs_human_review: false,
    use_opus: false,
    render_mode: "editable"
  };
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function main() {
  ensureDir(screenshotsDir);

  console.log("[run-vision-loop] Starting.");
  console.log(`  slides-dir   : ${slidesDir}`);
  console.log(`  out-audit    : ${outAudit}`);
  console.log(`  max-iter     : ${maxIterSonnet} Sonnet + ${OPUS_MAX_ITER} Opus`);
  console.log(`  budget-tokens: ${budgetTokens}`);

  // Load prompts
  const criticPromptRaw = readPrompt("visual-critic.md");
  const fixerPromptRaw  = readPrompt("fixer.md");
  const criticSystem    = extractSystemSection(criticPromptRaw);
  const fixerSystem     = extractSystemSection(fixerPromptRaw);

  // Load detector source
  const detectorSource = loadDetectorSource();

  // Collect slides
  const slideFiles = fs.readdirSync(slidesDir)
    .filter(f => f.endsWith(".html") && f.startsWith("slide-"))
    .sort();

  if (slideFiles.length === 0) {
    console.warn(`[run-vision-loop] No slide-*.html files found in: ${slidesDir}`);
    process.exit(0);
  }

  console.log(`[run-vision-loop] Found ${slideFiles.length} slide(s).`);

  // Launch Playwright
  const chromium = await loadPlaywright();
  const browser  = await chromium.launch({ headless: true });

  const audit = {};

  // Process each slide
  for (const slideFile of slideFiles) {
    const slideId   = path.basename(slideFile, ".html");
    const slidePath = path.join(slidesDir, slideFile);

    console.log(`\n[run-vision-loop] == Processing ${slideId} ==`);

    if (budgetExceeded()) {
      console.warn(
        `[run-vision-loop] Token budget (${budgetTokens}) exceeded. ` +
        `Stopping early at ${slideId}.`
      );
      break;
    }

    let html    = fs.readFileSync(slidePath, "utf8");
    const layout = extractLayout(html);
    const record = makeAuditRecord(layout);

    let converged   = false;
    let iteration   = 0;
    let levelHistory = [];
    let lastCriticResult = null;
    let bestHtml    = html;
    let bestScore   = -1;

    // Soft early-stop tracking: if score does not improve → rollback
    let prevScore = -1;

    while (iteration < TOTAL_MAX_ITER && !converged) {
      iteration++;

      const useOpus   = iteration > maxIterSonnet;
      const iterLabel = `iter-${iteration}`;

      console.log(
        `[run-vision-loop]   Iteration ${iteration}/${TOTAL_MAX_ITER} ` +
        `(model: ${useOpus ? "opus" : "sonnet"})`
      );

      // -- Step 1: Open slide in Playwright --
      const page = await browser.newPage();
      try {
        await page.setViewportSize({ width: 1920, height: 1080 });

        // Write current HTML to temp file (in-place update)
        fs.writeFileSync(slidePath, html, "utf8");

        const fileUrl = `file:///${slidePath.replace(/\\/g, "/")}`;
        await page.goto(fileUrl, { waitUntil: "networkidle" });

        // -- Step 2: Detector --
        let detectorResult;
        try {
          detectorResult = await page.evaluate(detectorSource);
        } catch (evalErr) {
          console.error(`[run-vision-loop]   Detector eval failed: ${evalErr.message}`);
          detectorResult = { eval_error: evalErr.message };
        }

        const detectorPassed = detectorResult === "OK";
        record.detector_passes.push(detectorPassed);
        console.log(
          `[run-vision-loop]   Detector: ${detectorPassed ? "OK" : "issues found"}`
        );

        // -- Step 3: Screenshot (once per slide iteration) --
        const screenshotPath = path.join(
          screenshotsDir,
          `${slideId}-${iterLabel}.png`
        );
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`[run-vision-loop]   Screenshot saved: ${screenshotPath}`);

        // -- Step 4: If detector passed, call vision critic --
        let criticResult = null;
        if (detectorPassed) {
          const userMsg = [
            `Slide: ${slideId} (layout: ${layout})`,
            `Evaluate per the system prompt. Output JSON only.`
          ].join("\n");

          try {
            const res = await callCritic(
              screenshotPath,
              criticSystem,
              userMsg,
              { useOpus }
            );
            trackTokens(res.usage);
            criticResult = res.parsed;
            lastCriticResult = criticResult;

            if (criticResult) {
              const score = criticResult.overall_score ?? 0;
              record.critic_scores.push(score);
              console.log(
                `[run-vision-loop]   Critic score: ${score} ` +
                `issues: ${criticResult.issues?.length ?? "?"}`
              );

              // Track best result for soft early-stop rollback
              if (score > bestScore) {
                bestScore = score;
                bestHtml  = html;
              }

              // Soft early-stop: if score did not improve vs previous iteration
              if (score <= prevScore && iteration > 1) {
                console.log(
                  "[run-vision-loop]   Score did not improve. Rolling back to best HTML."
                );
                html = bestHtml;
                fs.writeFileSync(slidePath, html, "utf8");
                record.issues_remaining = criticResult.issues ?? [];
                break;
              }
              prevScore = score;
            }
          } catch (criticErr) {
            console.error(`[run-vision-loop]   Critic call failed: ${criticErr.message}`);
          }
        }

        // -- Step 5: Check convergence --
        if (detectorPassed && isConverged("OK", criticResult)) {
          converged = true;
          record.final_score          = criticResult.overall_score;
          record.issues_remaining     = [];
          record.issues_resolved      = criticResult.issues ?? [];
          if (useOpus) record.use_opus = true;
          console.log("[run-vision-loop]   CONVERGED.");
          break;
        }

        // -- Step 6: Call fixer (if not converged and not last iteration) --
        if (iteration < TOTAL_MAX_ITER) {
          const bugReport = {
            slide_id: slideId,
            layout,
            iteration,
            cascade_level_history: levelHistory,
            bug_report: {
              detector: detectorPassed ? "OK" : detectorResult,
              critic:   criticResult ?? null
            }
          };

          const userMsg = buildFixerUserMessage(
            slideId,
            layout,
            iteration,
            levelHistory,
            bugReport
          );

          // Build a filled-in user message template
          const fixerUserTemplate =
            userMsg +
            "\n\nBug report:\n{BUG_REPORT_JSON}\n\nFull HTML:\n{HTML_CONTENT}";

          try {
            const fixerRes = await callFixer(
              html,
              bugReport,
              fixerSystem,
              fixerUserTemplate,
              { useOpus }
            );
            trackTokens(fixerRes.usage);

            if (fixerRes.parsed) {
              const fix = fixerRes.parsed;
              levelHistory.push(fix.level ?? 1);
              console.log(
                `[run-vision-loop]   Fixer applied: Level ${fix.level} — ${fix.action}`
              );

              if (fix.level === 4 && fix.action === "split" && Array.isArray(fix.slides)) {
                // Handle split: write slide-NN-a.html and slide-NN-b.html
                const baseNoExt = path.join(slidesDir, slideId);
                const pathA = baseNoExt + "-a.html";
                const pathB = baseNoExt + "-b.html";
                fs.writeFileSync(pathA, fix.slides[0], "utf8");
                fs.writeFileSync(pathB, fix.slides[1] || "", "utf8");
                // Mark original as split
                html = fix.slides[0];
                fs.writeFileSync(slidePath, html, "utf8");
                record.render_mode = "split";
                record.issues_remaining = [];
                console.log(
                  `[run-vision-loop]   Slide split into ${slideId}-a.html and ${slideId}-b.html`
                );
                // Add the new slides to the queue at the end so they get validated too
                slideFiles.push(
                  path.basename(pathA),
                  path.basename(pathB)
                );
                converged = true; // consider split as convergence for this slide
                break;
              } else if (typeof fix.patched_html === "string" && fix.patched_html.length > 0) {
                html = fix.patched_html;
              } else {
                console.warn("[run-vision-loop]   Fixer returned no patched_html.");
              }
            } else {
              console.warn("[run-vision-loop]   Fixer response could not be parsed.");
            }
          } catch (fixerErr) {
            console.error(`[run-vision-loop]   Fixer call failed: ${fixerErr.message}`);
          }
        }

        if (useOpus) record.use_opus = true;

      } finally {
        await page.close();
      }
    } // end while

    record.iterations = iteration;

    // Finalize audit record
    if (!converged) {
      record.needs_human_review = true;
      record.final_score = lastCriticResult?.overall_score ?? null;
      record.issues_remaining = lastCriticResult?.issues ?? [];
      console.log(
        `[run-vision-loop]   Did not converge after ${iteration} iterations. ` +
        `needs_human_review = true`
      );
      // Write best HTML back
      fs.writeFileSync(slidePath, bestHtml, "utf8");
    }

    audit[slideId] = record;

    console.log(
      `[run-vision-loop]   Done: iterations=${record.iterations}, ` +
      `final_score=${record.final_score ?? "N/A"}, ` +
      `human_review=${record.needs_human_review}`
    );
  }

  await browser.close();

  // Write audit
  const auditPath = path.isAbsolute(outAudit)
    ? outAudit
    : path.join(slidesDir, "..", outAudit);
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2), "utf8");

  console.log(`\n[run-vision-loop] Audit written to: ${auditPath}`);
  console.log(`[run-vision-loop] Total tokens used: ${totalTokensUsed}`);
  console.log("[run-vision-loop] Done.");
}

main().catch(err => {
  console.error("[run-vision-loop] FATAL:", err);
  process.exit(1);
});
