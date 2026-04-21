---
name: mastermind-deck-layout
description: >
  Генерирует HTML-слайды 1920×1080 из готового контента (slides.md) на
  основе компонентной библиотеки (12 универсальных + 5 архитектурных
  layout-ов) и дизайн-токенов. Эвристический подбор layout по контенту,
  slot-based substitution, применение overflow-safe CSS-правил
  (clamp, container queries, text-wrap balance/pretty, line-clamp,
  Fitty на hero-заголовках). Вызывается из mastermind-deck Phase 3.
status: concept
---

# mastermind-deck-layout

**Статус:** концепт, детальный пайплайн — `docs/concept/mastermind-deck.md` секция 4.

## Входы

- `slides.md` — контент от `mastermind-slides`.
- `deck/tokens.json` + `deck/tailwind.config.js` от Phase 1.
- `components/` — 17 HTML-partial'ов.
- `layouts-registry.json` — metadata для heuristic-выбора.

## Выходы

- `deck/slides/slide-NN.html` — отдельный файл на слайд.
- `deck/index.html` — навигируемая версия со всеми слайдами.

## Пайплайн

### Phase 3.0: Pre-generation declaration

Модель ОБЯЗАНА вывести 5-строчный план:

```
DESIGN DECISIONS:
1. Type: <pitch / architectural-album / general>
2. Preset from tokens.json: <sandwich light / sandwich dark / editorial / brutalist>
3. Accent hex: <#RRGGBB>
4. Motif: <ONE only: rounded frames | icons in circles | thick one-sided border>
5. Typography: <display/text pair>

REFLEX-DEFAULTS I AM REJECTING:
- <3–5 items>
```

Без декларации — skill не разрешает приступать к генерации.

### Phase 3.1: Heuristic layout selection

Для каждого слайда из `slides.md` порядок матчинга:

1. Explicit `kind` → использовать указанный layout.
2. `number + caption` → `stat`.
3. `quote + author` → `quote`.
4. `image + short body (<200 chars)` → `image-right`.
5. `image + long body (≥200 chars)` → `image-left`.
6. 2+ изображений одной темы → `before-after` / `material-grid` / `diagram-sequence`.
7. `plan + section` → `plan-section-axon`.
8. Один hero render → `full-bleed-render` или `full-bleed-hero`.
9. `bullets.length ∈ [3..6]` → `bullet-list`.
10. `body.length ≤ 140` + только title → `cover` / `section-divider` / `statement`.
11. title + subtitle + dense body → `two-cols` / `two-cols-header`.
12. default → `image-right`.

### Phase 3.2: Slot substitution

Каждый компонент — HTML-partial с placeholder-slot'ами. Например, `components/bullet-list.html`:

```html
<div class="slide grid grid-cols-12 gap-6 p-24 bg-paper text-ink">
  <h2 class="col-span-12 font-display text-h1 balance">{{title}}</h2>
  <ul class="col-span-12 space-y-3 pretty">
    {{#bullets}}
    <li class="text-body line-clamp-2">{{.}}</li>
    {{/bullets}}
  </ul>
</div>
```

Подставляем поля из slide с соблюдением `max_chars` / `clamp_lines` из `layouts-registry.json`.

### Phase 3.3: Anti-AI-slop validation

Перед записью файла — self-check модели против `references/anti-patterns.md`. Если нашла паттерн — правит, записывает уже исправленное.

## Критические правила

- Web-safe fonts only, если не screenshot-режим.
- `.slide { width: 1920px; height: 1080px; container-type: size; overflow: hidden }`.
- `.flex > *, .grid > * { min-width: 0; min-height: 0 }`.
- Fitty на cover.title и stat.number.
- Изображения всегда с `aspect-ratio` + `object-fit: cover`.

## Референсы

- `references/component-library.md` — описание всех 17 layout с when_to_use.
- `references/anti-patterns.md` — AI-slop hall of shame.
- `references/overflow-patterns.md` — каскад CSS fallback-правил.
