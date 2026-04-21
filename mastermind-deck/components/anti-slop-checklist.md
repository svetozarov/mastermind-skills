# Anti-AI-Slop Checklist

**Обязательно прочитать перед генерацией любого HTML-слайда.**
Этот список — реализация «anti-attractor procedure» из спецификации.
Модель обязана явно назвать каждый пункт и отвергнуть его до начала генерации.

---

## Обязательная декларация перед генерацией

Перед первым HTML-файлом выведи этот блок заполненным:

```
DESIGN DECISIONS:
1. Type: <pitch / architectural-album / general>
2. Preset: <sandwich_light / sandwich_dark / editorial / brutalist>
3. Accent hex: <#RRGGBB из tokens.json>
4. Motif: <ОДИН: rounded photo frames | icons in circles | thick one-sided border | none>
5. Typography: <display/text pair из tokens.json>

REFLEX-DEFAULTS I AM REJECTING:
- <3–5 вещей, которые я мог бы сделать по умолчанию — явно отвергаю каждую>
```

Без этой декларации генерация не начинается.

---

## NEVER — никогда не делать

### Типографика и шрифты
- [ ] **Inter / Roboto / Poppins на всём** — использовать display + text pair из tokens.json
- [ ] **Один шрифт на весь дек** — обязательно 2 семьи (display + text), mono только если явно задан
- [ ] **Более двух шрифтовых семей** — максимум 2 (исключение: mono для цифр/кода)
- [ ] **Центрированный body-текст** — только flush-left для абзацев и буллетов

### Цвет и стиль
- [ ] **Purple → pink градиент на белом** — это AI-fingerprint #1
- [ ] **Пастельная палитра из 8 цветов** — один доминирующий цвет (60–70%) + 1–2 акцентных
- [ ] **Белый #FFFFFF как фон** — использовать paper #F5F3EE (или токен из tokens.json)
- [ ] **Чистый чёрный #000000** — использовать ink #0A0A0A (или токен)
- [ ] **Glassmorphism / backdrop-filter** — без стекла и размытий
- [ ] **Drop-shadow «для красоты»** — только shadow-subtle из tokens (0 1px 2px rgba), никогда box-shadow 0 20px 60px

### Декор и структура
- [ ] **Accent-lines под заголовками** — «hallmark of AI-generated slides» (из Anthropic skill QA-checklist). Никаких горизонтальных линий-акцентов под h1/h2
- [ ] **border-radius ≥ 8px везде** — максимум radius-md (6px) из tokens; для архитектурных slides часто 0
- [ ] **SaaS-шаблон: hero + 3 карточки + CTA** — это для стартапов, не для Research Mastermind
- [ ] **Заголовок + подзаголовок + 3 буллета × 10 слайдов** — разнообразие layout обязательно
- [ ] **Эмодзи как иконки** — никогда. Ни один emoji в слайдах
- [ ] **Stock-photo diverse-team** — только реальные фото проекта или нейтральные чертежи
- [ ] **Text-only слайды без визуала** — каждый контентный слайд имеет визуальный якорь

### Изображения
- [ ] **width/height без aspect-ratio** — всегда aspect-ratio + object-fit
- [ ] **object-fit: fill** — только cover (фото) или contain (чертежи)
- [ ] **Изображения без alt текста** — обязательно alt на каждом img

### CSS
- [ ] **Inline стили для типографики** — только классы из base.css и CSS custom properties
- [ ] **Абсолютное позиционирование для текста** — только для overlay-контента поверх изображений
- [ ] **px-единицы для font-size** — только clamp() с rem в min/max
- [ ] **Пропущенный min-width: 0 на flex/grid детях** — всегда `.flex > *, .grid > * { min-width: 0 }`

---

## ALWAYS — всегда делать

### Цвет
- [ ] **paper = #F5F3EE** (не #FFFFFF), **ink = #0A0A0A** (не #000000) — если не переопределено в tokens
- [ ] **60–70% доминирование одного цвета** на каждом слайде
- [ ] **Один визуальный мотив на весь дек** (из поля Motif в декларации выше)

### Структура
- [ ] **Sandwich structure**: тёмные cover + closing, светлые контентные слайды
- [ ] **Section-divider после каждого раздела** — тёмный фон, крупный номер
- [ ] **Каждый контентный слайд — разный layout** (не copy-paste)

### Overflow-safety (обязательно на каждом слоте)
- [ ] Все текстовые слоты: `overflow-wrap: anywhere; hyphens: auto`
- [ ] Заголовки h1/h2/h3: `text-wrap: balance`
- [ ] Параграфы p: `text-wrap: pretty`
- [ ] Все image-зоны: `aspect-ratio` + `object-fit`
- [ ] Все текстовые слоты с возможным overflow: `line-clamp-N` class
- [ ] Все flex/grid дети: `min-width: 0; min-height: 0`

### Типографика
- [ ] **Только web-safe шрифты** в editable-режиме (Helvetica/Arial/Georgia/Courier New)
- [ ] **Hero-заголовки и stat-цифры** — data-fitty="true" + Fitty hook
- [ ] **Mono-шрифт на числах** (t-mono class) в agenda и timeline
- [ ] **Uppercase только для micro-текста** (t-micro class + letter-spacing 0.08em)

### Архитектурные слайды
- [ ] **object-fit: contain** для чертежей (план, разрез, аксонометрия) — сохраняет вес линий
- [ ] **object-fit: cover** для рендеров и фотографий
- [ ] **Metadata caption** на full-bleed-render: `index / desc / year`, 11px mono uppercase
- [ ] **Нет пояснительных подписей в теле чертежа** — только figcaption снизу

---

## QA-маркеры (проверить после генерации каждого слайда)

Перед записью файла модель обязана пробежаться по этим пунктам:

1. Есть ли accent-line под любым заголовком? → Убрать.
2. Есть ли inline `style="font-size: Npx"`? → Заменить на класс t-hero/t-h1/etc.
3. Есть ли `border-radius: 8px` или больше? → Убрать или заменить на radius-md.
4. Есть ли `background: linear-gradient(purple, pink)`? → Убрать немедленно.
5. Есть ли emoji в тексте слайда? → Убрать.
6. Каждый img имеет `aspect-ratio` + `object-fit`? → Проверить.
7. Каждый flex/grid child имеет `min-width: 0`? → Проверить через base.css.
8. Текст в hero-зоне имеет `data-fitty="true"`? → Проверить.
9. Все обязательные слоты заполнены? → Проверить по registry.
10. Декларация DESIGN DECISIONS выведена? → Без неё не начинать.
