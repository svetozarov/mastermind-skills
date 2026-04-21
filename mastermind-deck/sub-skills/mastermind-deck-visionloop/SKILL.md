---
name: mastermind-deck-visionloop
description: >
  Vision-loop валидация сгенерированных HTML-слайдов. Каждый слайд
  прогоняется через Playwright MCP: screenshot + DOM-метрики →
  детерминированный детектор overflow/overlap/off-canvas/clipped text
  (0 vision-токенов) → мультимодальный Claude-критик с JSON-only
  промптом → fixer с каскадом fallback-правил (clamp → line-clamp →
  layout switch → split slide). Max 3 итерации на Sonnet, +2 на Opus,
  затем needs_human_review. Вызывается из mastermind-deck Phase 4.
status: concept
---

# mastermind-deck-visionloop

**Статус:** концепт, детальный пайплайн — `docs/concept/mastermind-deck.md` секция 5.

## Входы

- `deck/slides/slide-NN.html` от Phase 3.
- Playwright MCP (требуется).

## Выходы

- Обновлённые `deck/slides/slide-NN.html` (после fix-циклов).
- `deck/audit.json` — полный отчёт по каждому слайду: итерации, issues, финальный score, флаг `needs_human_review`.

## Пайплайн (per slide, max 3 итерации на Sonnet)

```
1. Playwright MCP:
   browser_navigate(file:///.../deck/slides/slide-NN.html)
   browser_resize(1920, 1080)
   browser_evaluate(scripts/overflow-detector.js) → "OK" or JSON bug report
   browser_take_screenshot → screenshot.png

2. Deterministic detector result:
   - "OK" → goto 3 (vision critic)
   - issues → goto 4 (fixer with detector report)

3. Vision critic (Claude Sonnet 4.6, multimodal):
   Prompt: references/prompts/visual-critic.md (JSON-only)
   Input: screenshot.png
   Output: { slide_ok, issues[], overall_score }
   - slide_ok=true AND overall_score≥9 AND issues=[] → CONVERGED, goto 5
   - else → goto 4 (fixer with critic report)

4. Fixer (Claude Sonnet 4.6):
   Prompt: references/prompts/overflow-fixer.md
   Input: current HTML + bug report JSON (detector or critic)
   Cascade (минимальные изменения первыми):
     Level 1: CSS var --scale downscale (clamp подхватывает)
     Level 2: line-clamp with ellipsis
     Level 3: layout switch (two-cols → default, quote → statement, etc.)
     Level 4: split slide в 2 (агент решает)
   Pass 2 итерации на уровнях 1–2 → если не ушло, эскалация на 3–4.
   Записать обновлённый HTML → goto 1.

5. CONVERGED:
   Append to audit.json: iterations, final_score, no issues.
   Continue to next slide.

Escalation:
  After 3 iterations on Sonnet without convergence → Opus 4.7 (2 more iter).
  After 5 total → mark needs_human_review=true in audit, export as-is with note.
```

## Детерминированный детектор

Полный код — `scripts/overflow-detector.js`. Инжектируется через `browser_evaluate`. Ловит:

- `scrollWidth > clientWidth + 1` (horizontal overflow)
- `scrollHeight > clientHeight + 1` (vertical overflow, если `overflowY !== auto`)
- `getBoundingClientRect` вне 1920×1080 (off-canvas)
- Pairwise overlap leaves > 25 px²
- Clipped text leaves (textContent не помещается в зону)

Возвращает `"OK"` если всё чисто, или JSON с разбивкой по категориям.

## Visual critic prompt (JSON-only)

См. `references/prompts/visual-critic.md`. Ключевые правила:

- STRICT JSON, без прозы.
- Categories: `overflow`, `overlap`, `truncation`, `contrast`, `alignment`, `hierarchy`, `spacing`, `readability`, `off_canvas`, `image_broken`, `ai_slop`.
- Severity: `critical`, `major`, `minor`.
- `ai_slop` — отдельная категория: Inter default, purple gradient, accent line under title, centered body, SaaS hero.
- overall_score: 10 = ship; 9 = polish; 7–8 = noticeable; ≤6 = rework.
- Be terse; if unsure — omit.

## Fixer prompt

См. `references/prompts/overflow-fixer.md`. Принципы:

- Минимальное изменение первым.
- Если один и тот же issue 2 итерации подряд не уходит на Level 1–2 — эскалация на Level 3–4.
- Сохранять tokens.json-совместимость: не вводить hex-коды вне tokens.

## Бюджет

- Screenshot per slide, НЕ per action. Слайды статичны.
- ~4 скрина × 1.5k img-токенов ≈ 6–8k токенов на слайд.
- Для 14-слайдной деки ≈ 100k токенов на полный loop.

## Метрики для audit.json

```json
{
  "slide_01": {
    "layout": "cover",
    "iterations": 2,
    "detector_passes": [false, true],
    "critic_scores": [7, 9],
    "final_score": 9,
    "issues_resolved": [...],
    "issues_remaining": [],
    "needs_human_review": false,
    "render_mode": "editable" | "screenshot"
  }
}
```
