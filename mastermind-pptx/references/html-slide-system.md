# HTML Slide System — шаблоны фонов для двухслойного гибрида

## Архитектура

Каждый слайд = 2 слоя:
1. **HTML→PNG фон** — декор, градиенты, shapes (этот файл)
2. **pptxgenjs текст** — редактируемые заголовки, буллеты, таблицы

HTML рендерится в 1920×1080 PNG через Playwright. Текста в HTML НЕТ — только визуальные элементы.

---

## Базовый HTML-каркас

Каждый фон начинается с этого:

```html
<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1920px; height: 1080px; overflow: hidden; }
  .slide {
    width: 1920px; height: 1080px;
    position: relative;
    /* фон задаётся в конкретном шаблоне */
  }
</style>
</head>
<body>
<div class="slide">
  <!-- Декоративные элементы без текста -->
</div>
</body>
</html>
```

---

## Система координат и зоны

```
┌──────────────────────────────────────────────────┐
│ 96px margin                                      │
│  ┌────────────────────────────────────────────┐  │
│  │ SAFE ZONE (1728 × 888)                     │  │
│  │                                             │  │
│  │  Header zone: y 96-288 (192px height)       │  │
│  │  Content zone: y 320-920 (600px height)     │  │
│  │  Footer zone: y 940-984 (44px height)       │  │
│  │                                             │  │
│  └────────────────────────────────────────────┘  │
│                                             96px  │
└──────────────────────────────────────────────────┘
```

**Конверсия px → inches (для pptxgenjs):**
- 1 inch = 192 px (1920 / 10)
- margin 96px = 0.5"
- x: left_px / 192 → inches
- y: top_px / 192 → inches
- w: width_px / 192 → inches
- h: height_px / 192 → inches

---

## Шаблоны по visual types

### TITLE — титульный слайд

Полноэкранный градиент, акцентная полоска, минимум декора.

```html
<style>
  .slide {
    background: linear-gradient(135deg, var(--bg1), var(--bg2));
  }
  .accent-left {
    position: absolute; left: 0; top: 0;
    width: 8px; height: 100%;
    background: var(--accent);
  }
  .subtle-circle {
    position: absolute; right: 120px; bottom: 100px;
    width: 300px; height: 300px;
    border-radius: 50%;
    border: 2px solid var(--accent);
    opacity: 0.08;
  }
  .subtle-circle-2 {
    position: absolute; right: 80px; bottom: 60px;
    width: 200px; height: 200px;
    border-radius: 50%;
    border: 1px solid var(--accent);
    opacity: 0.05;
  }
</style>
<div class="slide">
  <div class="accent-left"></div>
  <div class="subtle-circle"></div>
  <div class="subtle-circle-2"></div>
</div>
```

**pptxgenjs текстовые зоны:**
- Title: x:0.8, y:1.8, w:8.4, h:1.5 (fontSize: 44, bold)
- Subtitle: x:0.8, y:3.5, w:8.4, h:0.6 (fontSize: 20)
- Author/date: x:0.8, y:4.5, w:8.4, h:0.4 (fontSize: 14, muted)

---

### BIO — об авторе

Два блока: текстовая зона слева, зона для фото справа.

```html
<style>
  .slide { background: var(--bg1); }
  .top-accent {
    position: absolute; top: 0; left: 0;
    width: 100%; height: 5px;
    background: linear-gradient(90deg, var(--accent), var(--accent2));
  }
  .text-zone {
    position: absolute; left: 96px; top: 120px;
    width: 960px; height: 840px;
    /* Пустая зона — текст через pptxgenjs */
  }
  .photo-zone {
    position: absolute; right: 160px; top: 50%;
    transform: translateY(-50%);
    width: 380px; height: 380px;
    border-radius: 50%;
    border: 4px solid var(--accent);
    background: rgba(255,255,255,0.02);
    box-shadow: 0 0 60px rgba(var(--accent-rgb), 0.15);
  }
  .photo-glow {
    position: absolute; right: 120px; top: 50%;
    transform: translateY(-50%);
    width: 460px; height: 460px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(var(--accent-rgb), 0.08), transparent 70%);
  }
</style>
<div class="slide">
  <div class="top-accent"></div>
  <div class="photo-glow"></div>
  <div class="photo-zone"></div>
</div>
```

**pptxgenjs:**
- Имя: x:0.5, y:0.8, w:5.0, h:0.7 (fontSize: 32, bold)
- Должность/bio: x:0.5, y:1.6, w:5.0, h:0.4 (fontSize: 16, muted)
- Буллеты (регалии): x:0.5, y:2.4, w:5.0, h:2.5 (fontSize: 16)
- Фото: addImage rounding:true x:6.0, y:1.2, w:2.8, h:2.8

---

### BULLETS — буллет-поинты

Чистый фон с тонкой accent-полоской. Всё пространство — для текста.

```html
<style>
  .slide { background: var(--bg1); }
  .header-zone {
    position: absolute; top: 0; left: 0;
    width: 100%; height: 140px;
    background: linear-gradient(180deg, rgba(var(--accent-rgb), 0.08), transparent);
  }
  .accent-bar {
    position: absolute; left: 96px; top: 130px;
    width: 200px; height: 4px;
    background: var(--accent);
    border-radius: 2px;
  }
</style>
<div class="slide">
  <div class="header-zone"></div>
  <div class="accent-bar"></div>
</div>
```

**pptxgenjs:**
- Заголовок: x:0.5, y:0.3, w:9.0, h:0.6 (fontSize: 28, bold)
- Буллеты: x:0.5, y:1.2, w:9.0, h:3.8 (fontSize: 18, bullet: true)

---

### PROCESS-N — шаги процесса

Горизонтальная линия с точками/кругами для номеров шагов.

```html
<style>
  .slide { background: var(--bg1); }
  .process-line {
    position: absolute; top: 480px; left: 150px; right: 150px;
    height: 3px;
    background: linear-gradient(90deg, var(--accent), var(--accent2));
    opacity: 0.3;
  }
  .step-dot {
    position: absolute; top: 462px;
    width: 40px; height: 40px;
    border-radius: 50%;
    background: var(--accent);
  }
  /* Позиции для N шагов — рассчитываются динамически */
  .step-label-zone {
    position: absolute; top: 520px;
    width: 200px; height: 300px;
    background: rgba(255,255,255,0.02);
    border-radius: 12px;
    border-top: 3px solid var(--accent);
  }
</style>
```

**Динамическое размещение шагов:**

```javascript
function processStepPositions(numSteps, slideWidth = 1920, margin = 150) {
  const usable = slideWidth - 2 * margin;
  const gap = usable / (numSteps - 1);
  return Array.from({ length: numSteps }, (_, i) => ({
    cx: margin + i * gap,  // центр круга
    labelLeft: margin + i * gap - 100, // левый край зоны текста
  }));
}
```

---

### COMPARISON — сравнение

Два равных столбца с разным оттенком фона.

```html
<style>
  .slide { background: var(--bg1); }
  .col-left {
    position: absolute; left: 60px; top: 180px;
    width: calc(50% - 80px); height: calc(100% - 260px);
    background: rgba(255,255,255,0.03);
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.06);
  }
  .col-right {
    position: absolute; right: 60px; top: 180px;
    width: calc(50% - 80px); height: calc(100% - 260px);
    background: rgba(255,255,255,0.03);
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,0.06);
  }
  .col-left::before {
    content: ''; position: absolute; top: 0; left: 0;
    width: 100%; height: 5px;
    background: var(--accent);
    border-radius: 16px 16px 0 0;
  }
  .col-right::before {
    content: ''; position: absolute; top: 0; left: 0;
    width: 100%; height: 5px;
    background: var(--accent2);
    border-radius: 16px 16px 0 0;
  }
  .vs-divider {
    position: absolute; left: 50%; top: 50%;
    transform: translate(-50%, -50%);
    width: 50px; height: 50px; border-radius: 50%;
    background: var(--bg1);
    border: 2px solid var(--accent);
    /* "VS" text добавляется через pptxgenjs */
  }
</style>
```

---

### TABLE — таблица данных

Фон с зоной для header строки таблицы.

```html
<style>
  .slide { background: var(--bg1); }
  .table-header-zone {
    position: absolute; left: 96px; top: 200px;
    width: calc(100% - 192px); height: 60px;
    background: var(--accent);
    opacity: 0.9;
    border-radius: 8px 8px 0 0;
  }
  .table-body-zone {
    position: absolute; left: 96px; top: 260px;
    width: calc(100% - 192px); height: 600px;
    background: rgba(255,255,255,0.02);
    border-radius: 0 0 8px 8px;
    border: 1px solid rgba(255,255,255,0.06);
    border-top: none;
  }
  .table-stripe:nth-child(even) {
    background: rgba(255,255,255,0.015);
  }
</style>
```

---

### BIG-NUMBER — крупное число

Минимальный фон, акцент на свечении вокруг числа.

```html
<style>
  .slide { background: var(--bg1); }
  .number-glow {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -60%);
    width: 500px; height: 500px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(var(--accent-rgb), 0.12), transparent 70%);
  }
  .bottom-accent {
    position: absolute; bottom: 0; left: 0;
    width: 100%; height: 4px;
    background: linear-gradient(90deg, transparent, var(--accent), transparent);
  }
</style>
```

**pptxgenjs:**
- Число: x:0.5, y:1.5, w:9.0, h:2.0 (fontSize: 72, bold, align: center)
- Подпись: x:1.5, y:3.5, w:7.0, h:0.6 (fontSize: 20, align: center, muted)

---

### CARDS — карточки в ряд

3-4 прямоугольника с тонкими границами.

```javascript
function buildCardsBackground(theme, numCards = 3) {
  const margin = 80;
  const gap = 30;
  const totalWidth = 1920 - 2 * margin;
  const cardWidth = (totalWidth - (numCards - 1) * gap) / numCards;

  let cardsHtml = '';
  for (let i = 0; i < numCards; i++) {
    const left = margin + i * (cardWidth + gap);
    cardsHtml += `
      <div style="
        position: absolute; left: ${left}px; top: 200px;
        width: ${cardWidth}px; height: 760px;
        background: rgba(255,255,255,0.03);
        border-radius: 16px;
        border: 1px solid rgba(255,255,255,0.06);
        border-top: 4px solid ${theme.accent};
      "></div>`;
  }

  return `<!DOCTYPE html>...<div class="slide">${cardsHtml}</div>...`;
}
```

---

### QUESTIONS — вопросы для обсуждения

Пронумерованные блоки с accent-маркерами.

```html
<style>
  .slide { background: var(--bg1); }
  .question-block {
    position: absolute; left: 96px;
    width: calc(100% - 192px); height: 200px;
    background: rgba(255,255,255,0.02);
    border-radius: 12px;
    border-left: 5px solid var(--accent);
  }
  .q1 { top: 200px; }
  .q2 { top: 430px; }
  .q3 { top: 660px; }
</style>
```

---

### CLOSING — финальный слайд

Тёмный фон, контактная зона внизу.

```html
<style>
  .slide {
    background: linear-gradient(180deg, var(--bg1), var(--bg-dark, #0a0a0a));
  }
  .contact-zone {
    position: absolute; bottom: 80px; left: 96px; right: 96px;
    height: 220px;
    background: rgba(255,255,255,0.03);
    border-radius: 16px;
    border-top: 3px solid var(--accent);
  }
  .top-glow {
    position: absolute; top: 0; left: 50%;
    transform: translateX(-50%);
    width: 600px; height: 200px;
    background: radial-gradient(ellipse, rgba(var(--accent-rgb), 0.1), transparent 70%);
  }
</style>
```

---

## Принципы качественного дизайна фонов

### DO (делай)
- **Тонкие полупрозрачные элементы** — opacity 0.02-0.15 для фоновых блоков
- **Один-два accent-элемента** на слайд — полоска, точка, свечение
- **Градиенты** — плавные переходы между 2 цветами пресета
- **Скруглённые углы** — 12-16px для блоков, 50% для кругов
- **Box-shadow** для глубины — `0 4px 32px rgba(0,0,0,0.2)`
- **Border: 1px solid rgba(255,255,255,0.06)** — едва заметные границы
- **Whitespace** — 40%+ слайда пустое

### DON'T (не делай)
- **Не перегружай декором** — max 3-4 декоративных элемента
- **Не используй яркие непрозрачные блоки** — только полупрозрачные
- **Не ставь текст в HTML** — ВЕСЬ текст через pptxgenjs
- **Не делай все слайды одинаковыми** — разные декоративные паттерны
- **Не используй изображения в HTML** — фото/QR через pptxgenjs
- **Не забывай про светлые пресеты** — для них используй rgba(0,0,0,0.03) вместо rgba(255,255,255,0.03)

### Светлые vs тёмные пресеты

| Элемент | Тёмный пресет | Светлый пресет |
|---------|---------------|----------------|
| Фон блоков | `rgba(255,255,255,0.03)` | `rgba(0,0,0,0.02)` |
| Границы | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.06)` |
| Тени | `rgba(0,0,0,0.3)` | `rgba(0,0,0,0.08)` |
| Свечение accent | `rgba(accent, 0.12)` | `rgba(accent, 0.06)` |

---

## Утилиты для динамического расчёта

```javascript
// Расчёт позиций для N равных колонок
function columnPositions(n, marginPx = 80, gapPx = 30, slideW = 1920) {
  const usable = slideW - 2 * marginPx;
  const colW = (usable - (n - 1) * gapPx) / n;
  return Array.from({ length: n }, (_, i) => ({
    leftPx: marginPx + i * (colW + gapPx),
    widthPx: colW,
    // Для pptxgenjs:
    xInch: (marginPx + i * (colW + gapPx)) / 192,
    wInch: colW / 192,
  }));
}

// Конверсия px → inches
const px2in = (px) => px / 192;
const in2px = (inches) => inches * 192;

// Генерация CSS-переменных из THEME
function themeToCssVars(theme) {
  return `
    :root {
      --bg1: ${theme.bgPrimary};
      --bg2: ${theme.bgSecondary};
      --text: ${theme.textPrimary};
      --text-muted: ${theme.textMuted};
      --accent: ${theme.accent};
      --accent2: ${theme.accent2};
      --accent-rgb: ${hexToRgb(theme.accent)};
    }
  `;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return `${parseInt(h.substr(0,2),16)},${parseInt(h.substr(2,2),16)},${parseInt(h.substr(4,2),16)}`;
}
```
