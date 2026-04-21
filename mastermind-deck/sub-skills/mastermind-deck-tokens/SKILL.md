---
name: mastermind-deck-tokens
description: >
  Извлекает дизайн-систему из визуальных референсов (скриншоты слайдов,
  PDF-брендбук, существующие презентации, URL сайтов) в формат W3C DTCG
  tokens. 7-шаговый пайплайн: нормализация входа → canonical values из PDF
  через pdfplumber → Color Thief на кластеризованных скриншотах → Claude
  Vision со staged промптом → web-safe fallback для шрифтов → merge в
  tokens.json → Style Dictionary → Tailwind config. Вызывается из
  mastermind-deck Phase 1.
status: concept
---

# mastermind-deck-tokens

**Статус:** концепт, детальный пайплайн описан в `docs/concept/mastermind-deck.md` секция 3.

## Входы

- `references/` — скриншоты (`*.png`/`*.jpg`), `brandbook.pdf`, существующие `*.pptx`, URL сайтов.
- `deck-brief.yaml` — опциональный `font_fidelity: editable | strict`.

## Выходы

- `deck/tokens.json` — W3C DTCG формат с обязательной секцией `slide.*`.
- `deck/tailwind.config.js` — Tailwind preset.
- `deck/globals.css` — CSS custom properties + overflow-safe base.

## Пайплайн

1. **Нормализация входа** — pdf2image 200 DPI, soffice → pdf → pdftoppm, Playwright для URL. Результат: `references/_normalized/`.
2. **Canonical values из PDF** — pdfplumber.extract_text() + regex по hex/rgb/cmyk/pantone. Counter((fontname, size)) → топ-3. `_text_canonical.json`.
3. **Color Thief** на 3–5 кластеризованных скриншотах. Агрегация по повторяемости. `_colors_extracted.json`.
4. **Claude Vision** со staged промптом из `references/prompts/style-extractor.md`. Сначала describe per-screenshot, потом merge и strict DTCG JSON output.
5. **Web-safe fallback** по таблице в `references/fallback-fonts.md`. Если `font_fidelity: strict` — помечаем слайды для screenshot-режима.
6. **Merge** — canonical > vision > color-thief в случае конфликтов. Обязательная секция `slide.layouts` с per-layout background/foreground/titleStyle.
7. **Style Dictionary** → `tailwind.config.js` + `globals.css`.

## Критические правила

- Никогда не выдумывать цвета «для красоты».
- Если hex неуверен — `"$rationale": "needs ColorThief verification"`.
- Минимум 3 скриншота для merge. На 1–2 — user warning.
- Обязательная секция `slide.*` (layouts + decor), без неё возвращаем к пункту 6.

## Реализация

См. `scripts/extract-style.py` (планируется в этапе A плана сборки).
