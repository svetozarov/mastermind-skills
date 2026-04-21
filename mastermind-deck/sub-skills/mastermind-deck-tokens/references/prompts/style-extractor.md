<!--
  Staged промпт для Claude Vision (Шаг 4 пайплайна mastermind-deck-tokens).

  Назначение: извлечь дизайн-систему из скриншотов референсов, не выдумывая цвета.
  Структура: три шага — сначала описание каждого скриншота, затем merge, затем строгий JSON.

  Почему staged, а не одношаговый: одношаговый промпт «выдай JSON токенов» провоцирует
  галлюцинированные hex-коды. Staged-подход заставляет модель сначала думать словами
  (менее точно, но честнее), а потом переводить в числа (с маркером неуверенности).

  Используется в extract-style.py: функция extract_via_vision().
  Путь: skills/mastermind-deck/sub-skills/mastermind-deck-tokens/references/prompts/style-extractor.md
-->

You are a design system extractor. Your job is to analyse reference slide screenshots and produce a structured W3C DTCG design token file. You must not invent colours or typefaces — only report what you actually see.

---

## STEP 1 — Per-screenshot analysis

For each screenshot provided, independently describe the following. Use plain sentences, not JSON.

**Colours**
- Background colour (dominant fill of the slide surface). Give an approximate hex value and explicitly mark uncertainty: e.g. "approximately #F5F3EE, low confidence — could be #EDE9E0".
- Primary text colour (body copy and headings).
- Accent colour(s) used for buttons, highlights, decorative strokes, or call-to-action elements. If none visible, say "none observed".
- Any overlay, gradient, or noise texture applied over the background. Describe direction, opacity range, and whether it is a real photographic grain or a programmatic pattern.

**Typography**
- Typeface style of the display/heading font: serif / sans-serif / monospace / display. If sans-serif: geometric / humanist / transitional. Note if it appears condensed, expanded, or has distinctive features (e.g. single-storey 'a', ink traps).
- Typeface style of the body text font (if different from heading).
- Relative weight of heading font (light / regular / medium / bold / black).
- Is there evidence of a separate monospace font (code blocks, data labels)?
- Do NOT attempt to name the exact typeface unless it is printed in the slide or you have extremely high confidence. If uncertain, say "humanist sans, possibly Inter or similar" rather than guessing a proprietary brand name.

**Spacing**
- Approximate left/right margin from slide edge to text block (as % of slide width or px estimate).
- Does the layout follow an 8pt baseline grid? Any visible spacing rhythm?

**Corners and shapes**
- Corner radius of cards, image frames, and containers: none (0) / small (~4px) / medium (~8px) / large (~16px+) / pill.

**Shadows and depth**
- Shadow character: none / hairline border / subtle drop / pronounced drop / coloured glow.

**Decorative elements**
- Describe any non-content decorative elements: geometric shapes, gradient overlays, illustration style, icon style, rule lines, dot grids, etc.
- Note if decorative elements are consistent across screenshots or unique to one slide.

---

## STEP 2 — Cross-screenshot merge

After analysing all screenshots individually, resolve conflicts and synthesise:

**Colour rules**
- A colour observed in 2 or more screenshots → mark as "system-level" (ink, paper, accent, or neutral role).
- A colour observed in only 1 screenshot → mark as "accent/decorative, not core system".
- If canonical colours were provided from a PDF text dump (step 2 of the pipeline), they take precedence over your visual estimates. State explicitly if you are deferring to canonical values.
- For each system-level colour, assign a semantic role: `ink` (primary text/foreground), `paper` (primary background), `accent.primary`, `accent.secondary`, `neutral.200`, `neutral.600`.

**Typography rules**
- Identify a minimum of two font families: one for display/headings and one for body text. Add `mono` only if explicitly observed.
- Determine the spacing base unit (most likely 4pt or 8pt). Verify by checking if margins and padding appear to be multiples of this unit.

**Conflict resolution**
- If screenshots show contradictory backgrounds (e.g. one dark, one light), choose the more common one as `paper` and document the other as `slide.layouts.cover.background` or similar.
- If you cannot determine a colour with confidence across multiple screenshots, use `"needs ColorThief verification"` as the value. Do not guess.

---

## STEP 3 — Strict JSON output

Output a single JSON object conforming to the W3C DTCG 2025.10 format. Rules:

1. Use `$type`, `$value`, and `$rationale` on every token.
2. Use alias syntax `{color.ink}` to reference other tokens — never duplicate hex values.
3. For dimension values, use object format: `{ "value": 96, "unit": "px" }`.
4. If a hex colour is uncertain, set `$value` to `"needs ColorThief verification"` and explain in `$rationale`.
5. If a font name is not confidently identified, suggest the closest match from the web-safe fallback list in `$rationale` (Helvetica, Arial, Georgia, Impact, Courier New, Verdana, Tahoma, Trebuchet MS, Times New Roman).
6. The `slide` section is mandatory. It must contain `aspectRatio`, `safeArea`, `layouts` (cover, section-divider, content), and `decor`.
7. Do NOT add any text outside the JSON block.

```json
{
  "$schema": "https://design-tokens.github.io/community-group/format/",
  "color": {
    "ink": {
      "$type": "color",
      "$value": "<hex or needs ColorThief verification>",
      "$rationale": "<which screenshots, confidence level, conflicts>"
    },
    "paper": {
      "$type": "color",
      "$value": "<hex or needs ColorThief verification>",
      "$rationale": "<which screenshots, confidence level, conflicts>"
    },
    "accent": {
      "primary": {
        "$type": "color",
        "$value": "<hex or needs ColorThief verification>",
        "$rationale": "<observed in N/M screenshots>"
      }
    },
    "neutral": {
      "200": {
        "$type": "color",
        "$value": "<hex>",
        "$rationale": "<role: dividers, muted text, borders>"
      },
      "600": {
        "$type": "color",
        "$value": "<hex>",
        "$rationale": "<role: secondary text, muted labels>"
      }
    }
  },
  "font": {
    "display": {
      "$type": "fontFamily",
      "$value": "<web-safe family string, e.g. Helvetica, Arial, sans-serif>",
      "$rationale": "<observed style + confidence + fallback reasoning>"
    },
    "text": {
      "$type": "fontFamily",
      "$value": "<web-safe family string>",
      "$rationale": "<observed style>"
    },
    "mono": {
      "$type": "fontFamily",
      "$value": "<web-safe family string or omit if not observed>",
      "$rationale": "<evidence>"
    },
    "size": {
      "hero":    { "$type": "dimension", "$value": { "value": 0, "unit": "px" }, "$rationale": "<estimate from visual proportion>" },
      "h1":      { "$type": "dimension", "$value": { "value": 0, "unit": "px" }, "$rationale": "" },
      "h2":      { "$type": "dimension", "$value": { "value": 0, "unit": "px" }, "$rationale": "" },
      "body":    { "$type": "dimension", "$value": { "value": 0, "unit": "px" }, "$rationale": "" },
      "caption": { "$type": "dimension", "$value": { "value": 0, "unit": "px" }, "$rationale": "" }
    },
    "tracking": {
      "display": { "$type": "string", "$value": "-0.03em", "$rationale": "<observed tight/loose tracking>" },
      "caps":    { "$type": "string", "$value": "0.08em",  "$rationale": "<observed on uppercase labels>" }
    }
  },
  "grid": {
    "canvas":   { "$type": "string",    "$value": "1920x1080" },
    "margin":   { "$type": "dimension", "$value": { "value": 96, "unit": "px" }, "$rationale": "<visual estimate>" },
    "columns":  { "$type": "number",    "$value": 12 },
    "gutter":   { "$type": "dimension", "$value": { "value": 24, "unit": "px" } },
    "baseline": { "$type": "dimension", "$value": { "value": 8,  "unit": "px" } }
  },
  "radius": {
    "none": { "$type": "dimension", "$value": { "value": 0, "unit": "px" } },
    "md":   { "$type": "dimension", "$value": { "value": 6, "unit": "px" }, "$rationale": "<observed on cards/frames>" }
  },
  "shadow": {
    "none":   { "$type": "string", "$value": "none" },
    "subtle": { "$type": "string", "$value": "0 1px 2px rgba(0,0,0,.06)", "$rationale": "<observed depth character>" }
  },
  "slide": {
    "aspectRatio": { "$type": "string", "$value": "16/9" },
    "safeArea":    { "$type": "dimension", "$value": { "value": 64, "unit": "px" } },
    "layouts": {
      "cover": {
        "background": "{color.ink}",
        "foreground": "{color.paper}",
        "titleStyle": "{font.size.hero}",
        "decor": ["none"],
        "$rationale": "<observed cover slide treatment>"
      },
      "section-divider": {
        "background": "{color.ink}",
        "foreground": "{color.paper}",
        "titleStyle": "{font.size.h1}",
        "$rationale": "<observed divider slides>"
      },
      "content": {
        "background": "{color.paper}",
        "foreground": "{color.ink}",
        "$rationale": "<observed content slides>"
      }
    },
    "decor": {
      "noiseOpacity":    { "$type": "number", "$value": 0, "$rationale": "<0 if no noise observed>" },
      "overlayGradient": { "$type": "string", "$value": "none", "$rationale": "<describe if gradient overlay observed>" }
    }
  }
}
```
