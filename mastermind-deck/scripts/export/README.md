# Export Layer — mastermind-deck scripts

Three commands to go from validated HTML slides to a final `.pptx`.

---

## Prerequisites

```bash
cd skills/mastermind-deck/scripts
npm install
npx playwright install chromium
```

Node 20+ required.

---

## Command 1: Font check (run first)

Scans all HTML slides for non-web-safe fonts and recommends screenshot-mode
for slides that would corrupt in the editable PPTX path.

```bash
node export/fonts-check.mjs \
  --slides-dir projects/my-deck/deck/slides \
  --out projects/my-deck/deck/fonts-report.json
```

Exit codes: 0 = all fonts web-safe, 2 = some slides need screenshot-mode.

---

## Command 2: Assemble full deck (recommended — handles both paths)

Single command that:
1. Classifies each slide as editable or screenshot-mode.
2. Renders screenshot-mode slides to 3840x2160 PNG via Playwright.
3. Builds editable slides via Playwright DOM extraction + PptxGenJS.
4. Mixes both into one `.pptx` in correct slide order.
5. Injects speaker notes if `notes/` or `speaker-notes.md` are present.

```bash
node assemble-deck.mjs \
  --project projects/my-deck/deck \
  --out projects/my-deck/My-Deck-Research-Wednesday.pptx
```

Project directory layout expected by `--project`:

```
deck/
  slides/           slide-01.html ... slide-NN.html  (required)
  tokens.json                                         (required)
  layouts-registry.json                               (optional)
  brief.yaml                                          (optional)
  screenshots/      slide-01.png ... (auto-created if missing)
  notes/            slide-01.notes.md ... (optional speaker notes)
  speaker-notes.md  unified notes file (alternative to notes/)
```

---

## Command 3: Editable-only build (skips screenshot slides)

Faster when you only need the editable path and will handle screenshot slides
separately. Outputs a partial PPTX (screenshot slides are absent).

```bash
node html2pptx-build.mjs \
  --slides-dir projects/my-deck/deck/slides \
  --tokens     projects/my-deck/deck/tokens.json \
  --registry   projects/my-deck/deck/layouts-registry.json \
  --brief      projects/my-deck/deck/brief.yaml \
  --out        projects/my-deck/deck/editable-only.pptx
```

---

## Command 4: Screenshot-only render

Renders specified (or all) HTML slides to PNG without building a PPTX.
Useful for visual QA before final assembly.

```bash
node screenshot-export.mjs \
  --slides-dir projects/my-deck/deck/slides \
  --out        projects/my-deck/deck/screenshots \
  --slides     1,3,5
```

---

## font_fidelity in brief.yaml

Controls which path each slide takes:

```yaml
font_fidelity: editable   # (default) fallback non-web-safe -> Arial
font_fidelity: strict     # ALL slides use screenshot-mode (pixel-perfect)
```

Per-slide override (not yet supported in v1 — use global flag).

---

## Speaker notes injection

Notes can be provided in two formats:

**Per-slide files** (`notes/slide-NN.notes.md`):
```
notes/
  slide-01.notes.md
  slide-02.notes.md
  ...
```

**Single unified file** (`speaker-notes.md`):
```markdown
## Slide 1
Opening remarks about the project context...

## Slide 2
Key metric: 40% reduction in time-to-close...
```

Markdown is stripped to plain text before injection (PPTX notes are plain).

---

## TODO / known limitations

- **html2pptx.js npm package**: Not yet available as a public module (April 2026).
  The current implementation uses Playwright + getBoundingClientRect for coordinate
  extraction, which is functionally equivalent. When the package becomes available
  (`npm i html2pptx`), replace the extraction logic in `html2pptx-build.mjs` with
  the official API call: `await html2pptx(htmlPath, pptx)`.

- **CSS gradients**: Slides with `linear-gradient` backgrounds should be pre-rasterized
  via Sharp before html2pptx-build. The preprocess-images.mjs script handles this.

- **Image resolution**: Relative `<img src="...">` paths in HTML are not resolved by
  assemble-deck. Use absolute paths or data URIs in slides for production.

- **Per-slide font_fidelity**: Currently only the global `brief.yaml` flag is supported.
  Per-slide overrides in `brief.yaml[slides][N]` are partially wired but not tested.
