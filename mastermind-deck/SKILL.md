---
name: mastermind-deck
description: >
  HTML-first движок генерации PPTX с vision-loop валидацией. Принимает
  готовый контент от mastermind-slides + визуальные референсы (скриншоты,
  PDF-брендбук, примеры презентаций) → извлекает дизайн-систему в W3C DTCG
  токены → генерирует HTML-слайды 1920×1080 на основе компонентной
  библиотеки → прогоняет каждый слайд через Playwright + детерминированный
  детектор overflow + мультимодальный критик (max 3 итерации) → экспортирует
  в editable PPTX через html2pptx.js + PptxGenJS. Альтернатива Gamma для
  локального режима, заменяет устаревший python-pptx. Триггеры:
  "сгенерировать презентацию локально", "html-first", "без gamma",
  "по референсу", "по брендбуку", "архитектурный альбом", "mastermind deck".
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, WebFetch, Skill, Agent
metadata:
  version: "1.0.0-draft"
  status: concept
  requires_mcp: [playwright, filesystem]
  requires_runtime: [node>=20, python>=3.11]
  model_hint: "claude-opus-4-7 (layout generation), claude-sonnet-4-6 (vision critic, fixer)"
---

# Mastermind Deck — HTML-first движок презентаций

**Статус:** концепт, v1 в разработке. Полная концепция — `docs/concept/mastermind-deck.md`. Решение — `docs/decisions/0002-html-first-deck-engine.md`.

## ОБЯЗАТЕЛЬНОЕ ПРАВИЛО

**Качество, не скорость.** Не сокращать итерации vision-loop ради быстроты. Не упрощать extraction design system. Не урезать компонентную библиотеку. Если есть выбор между «быстрее» и «лучше выглядит» — всегда второе.

## Что этот skill делает и чего НЕ делает

**Делает:**
1. Извлекает дизайн-систему из визуальных референсов в формат W3C DTCG.
2. Генерирует HTML-слайды 1920×1080 на overflow-safe компонентной библиотеке.
3. Валидирует каждый слайд через vision-loop (детектор + vision-критик + fixer).
4. Экспортирует в editable PPTX через html2pptx.js + PptxGenJS.

**НЕ делает:**
- Content planning — это уже делают `mastermind-concept` и `mastermind-slides`.
- Выбор угла подачи — это `mastermind-angle`.
- Речевые заметки — это `mastermind-cheatsheet`.
- Онлайн-генерацию — это Gamma Pro / Gamma Free, остаются как отдельные движки.

## Входы

1. `slides.md` от `mastermind-slides` — контент слайдов с полями `kind`, `title`, `subtitle`, `body`, `bullets`, `image`, и т.д.
2. Папка `references/` — скриншоты, `brandbook.pdf`, `.pptx`-образцы, URL сайтов.
3. `deck-brief.yaml` (опционально):
   ```yaml
   type: pitch | architectural-album | general
   language: ru | en
   font_fidelity: editable | strict   # editable = fallback на web-safe; strict = screenshot-режим
   special_requirements:
     - "brand font: Neue Haas Grotesk Display (если есть лицензия)"
     - "обязательный QR-код на закрывающем слайде"
   ```

## Выходы

- `deck/tokens.json` — W3C DTCG дизайн-система.
- `deck/tailwind.config.js` + `deck/globals.css` — preset.
- `deck/slides/slide-NN.html` — HTML на слайд.
- `deck/index.html` — навигируемая версия всех слайдов.
- `deck/audit.json` — отчёт vision-loop.
- `<slug>-Research-Wednesday.pptx` — финальный editable PPTX.

## Пайплайн (строго в этом порядке)

```
Phase 0: Infrastructure check
  ├─ Playwright MCP available? (Skill tool → claude mcp list)
  ├─ Node.js 20+? (node -v)
  ├─ Python 3.11+ with pdfplumber, pdf2image, Pillow? (pip show)
  └─ Sharp, PptxGenJS installed? (node -e "require('sharp'); require('pptxgenjs')")
  FAIL → fallback to python-pptx legacy mode with warning.

Phase 1: Extract design system
  Skill → mastermind-deck-tokens
  Input: references/, deck-brief.yaml
  Output: deck/tokens.json, deck/tailwind.config.js, deck/globals.css

Phase 2: Pre-generation declaration
  Model outputs 5-line plan:
    1. Type, 2. Preset from tokens, 3. Accent hex,
    4. Motif (ONE only), 5. Typography pair
  + Reflex-defaults being rejected (3–5 items)
  NEVER proceed without declaration.

Phase 3: Generate HTML slides
  Skill → mastermind-deck-layout
  For each slide in slides.md:
    1. Heuristic layout pick from layouts-registry.json
    2. Instantiate components/<layout>.html with slot substitution
    3. Apply tokens via Tailwind classes
    4. Write deck/slides/slide-NN.html

Phase 4: Vision-loop validation
  Skill → mastermind-deck-visionloop
  For each slide (max 3 iterations on Sonnet, +2 on Opus):
    1. Playwright screenshot + overflow-detector.js
    2. If not OK → fixer with bug report JSON → goto 1
    3. If OK → visual critic (JSON-only prompt)
    4. If score ≥ 9 and issues = [] → converged
    5. Else → fixer with critic report → goto 1
  Escalation → Opus 4.7 → needs_human_review.

Phase 5: Export
  scripts/html2pptx-build.mjs → editable PPTX
  Fallback (если font_fidelity: strict или есть gradients):
    scripts/screenshot-export.mjs → PNG 3840×2160 → addImage

Phase 6: Post-validation
  python -m markitdown deck.pptx | grep -iE "xxxx|lorem|ipsum|placeholder"
  Any hit → mark in audit.json, return to Phase 4
```

## Сабскиллы

- `sub-skills/mastermind-deck-tokens/` — Design system extraction (Phase 1)
- `sub-skills/mastermind-deck-layout/` — HTML slide generation (Phase 3)
- `sub-skills/mastermind-deck-visionloop/` — Vision-loop validation (Phase 4)

## Non-negotiable правила

### Canvas и grid
- 1920×1080 per slide, margin 96px (из tokens.grid.margin), 12-col grid, 24px gutter, 8pt baseline.
- `.slide { width: 1920px; height: 1080px; aspect-ratio: 16/9; container-type: size; overflow: hidden }`.

### Типографика
- Fonts ИСКЛЮЧИТЕЛЬНО из tokens.json (2 семьи max + опциональный mono).
- Для editable PPTX — web-safe: Arial, Helvetica, Times New Roman, Georgia, Courier New, Verdana, Tahoma, Trebuchet MS, Impact. Остальные → fallback-таблица в `sub-skills/mastermind-deck-tokens/references/fallback-fonts.md`.
- Заголовки: `text-wrap: balance; overflow-wrap: anywhere; hyphens: auto`.
- Параграфы: `text-wrap: pretty`.
- Fluid typography: `clamp(min-rem, vw+rem, max-rem)` или `cqi`.
- Fitty поверх clamp на hero-заголовках (cover, stat).

### Цвета
- Paper `#F5F3EE` или из tokens (НЕ `#FFFFFF`).
- Ink `#0A0A0A` или из tokens (НЕ `#000000`).
- Один accent-цвет ≤10% поверхности.
- Max 4 цвета на слайд.
- Без gradient вне intentional hero (и только через пре-растеризацию Sharp).

### Изображения
- Full-bleed: `object-fit: cover`, без frame/shadow/rounded corners.
- Предобработка через Sharp: `resize(3840, 2160, {fit:'cover'}).jpeg({quality:85})`.
- Всегда wrapping-div с `aspect-ratio` + `overflow: hidden`.
- Caption — metadata format: `[num] / [desc] / [year]`, 11px uppercase, tracking 0.08em.

### Overflow-safe defaults
- `.flex > *, .grid > * { min-width: 0; min-height: 0 }`.
- `-webkit-line-clamp: N` + `display: -webkit-box` на текстовых блоках как fallback.
- `aspect-ratio` + `object-fit: cover` на всех изображениях.

## АНТИПАТТЕРНЫ — NEVER (перечислить и отвергнуть до генерации)

См. `sub-skills/mastermind-deck-layout/references/anti-patterns.md`. Топ-запреты:

- Inter / Roboto / Poppins на всём (если не указано в tokens).
- Purple → pink градиент на белом.
- Emojis как иконки.
- Border-radius ≥8px везде.
- Drop-shadow + glassmorphism «для модности».
- Центрированный body-текст.
- Title + subtitle + 3-bullet шаблон × 10 слайдов.
- **Accent lines под заголовками — hallmark of AI-generated slides.**
- Text-only слайды без визуального элемента.
- Backgrounds / borders / shadows на `<p>/<h1>-<h6>/<ul>/<ol>` — ограничение html2pptx.

## Escalation

- Max 3 итерации vision-loop на Sonnet 4.6.
- После 3 неудачных — +2 итерации на Opus 4.7.
- После 5 — `needs_human_review: true`, slide экспортируется as-is с пометкой.

## Файлы-референсы

- `docs/concept/mastermind-deck.md` — полная концепция
- `docs/decisions/0002-html-first-deck-engine.md` — ADR
- `sub-skills/mastermind-deck-tokens/SKILL.md` — Phase 1
- `sub-skills/mastermind-deck-layout/SKILL.md` — Phase 3
- `sub-skills/mastermind-deck-visionloop/SKILL.md` — Phase 4
- `components/` — 17 HTML-partial'ов (12 универсальных + 5 архитектурных)
- `layouts-registry.json` — metadata для heuristic-выбора
- `scripts/` — все Node.js и Python скрипты

## Статус реализации

Скилл находится в фазе concept. SKILL.md-заглушки для sub-skills и структура папок созданы. Реализация — по поэтапному плану в `docs/concept/mastermind-deck.md` секция 9 (этапы A–G).
