# Mastermind Deck — HTML-first движок презентаций

**Статус:** концепт, v1 в разработке.

Альтернатива Gamma для локального режима генерации PPTX, заменяет устаревший `python-pptx` direct. Архитектура: HTML-first + design system extraction + vision-loop validation + editable PPTX export через html2pptx.js + PptxGenJS.

## Документы

- `SKILL.md` — главный промпт и пайплайн.
- `../../docs/concept/mastermind-deck.md` — полная концепция мини-проекта.
- `../../docs/decisions/0002-html-first-deck-engine.md` — ADR.
- `../../research/2026.04.21_claude-design-pptx-skill.md` — ресёрч №1.
- `../../research/2026.04.21_vision-loop-layout-skill.md` — ресёрч №2.

## Структура

```
mastermind-deck/
├── SKILL.md                          # главный промпт
├── sub-skills/
│   ├── mastermind-deck-tokens/       # Phase 1: design system extraction
│   ├── mastermind-deck-layout/       # Phase 3: HTML slide generation
│   └── mastermind-deck-visionloop/   # Phase 4: validation loop
├── components/                       # 12 универсальных + 5 архитектурных layout
├── scripts/                          # Python + Node.js + injected JS
├── layouts-registry.json             # metadata для heuristic-выбора (TODO)
├── base.css                          # overflow-safe base (TODO)
└── examples/                         # sample-references + pressure-tests
```

## Ключевое правило

**Качество, не скорость.** Не упрощать extraction. Не сокращать итерации vision-loop. Компонентная библиотека не урезается ниже 17 layout-ов.

## План реализации

Этапы A–G в `docs/concept/mastermind-deck.md` секция 9.
