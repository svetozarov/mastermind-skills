# Стилевые пресеты для презентаций

15 пресетов. Каждый — завершённая визуальная система: палитра, шрифты, приёмы.
Скилл выбирает пресет автоматически по теме проекта или предлагает 2-3 варианта.

**Только web-safe шрифты** — гарантированная работа на любом компьютере.
Дизайнерский вид достигается через размерный контраст, spacing и палитру, а не через шрифты.

**Координаты, лимиты, сетка** — всегда из `design-system.json`. Пресет переопределяет ТОЛЬКО цвета и шрифты.

---

## Структура пресета: 8 семантических ролей

Каждый пресет определяет 8 ролей. Скрипт маппит их в design tokens:

| Роль | Назначение |
|------|-----------|
| `background` | Фон слайда (60% по правилу 60-30-10) |
| `surface_elevated` | Карточки, callout-блоки, плашки |
| `text_primary` | Заголовки, основной текст |
| `text_secondary` | Подзаголовки, caption, secondary info |
| `accent_primary` | Главный акцент (10% — ключевые элементы) |
| `accent_secondary` | Второй акцент, декор (30% — вторичные элементы) |
| `border` | Разделители, линии |
| `data_muted` | Серый для данных (стратегия "серый + акцент") |

### Правило 60-30-10

- **60%** — `background` (фон, основные поверхности)
- **30%** — `surface_elevated` + `text_primary` + `accent_secondary` (вторичные элементы)
- **10%** — `accent_primary` (фокусные элементы, CTA, ключевые данные)

### Data Visualization палитры

**Okabe-Ito** (colorblind-safe, по умолчанию для всех пресетов):
`#E69F00`, `#56B4E9`, `#009E73`, `#F0E442`, `#0072B2`, `#D55E00`, `#CC79A7`

**Tableau 10** (альтернатива для корпоративного стиля):
`#5778A4`, `#E49444`, `#D1615D`, `#85B6B2`, `#6A9F58`, `#E7CA60`, `#A87C9F`

**Стратегия "серый + акцент" (Nussbaumer Knaflic):**
Все данные по умолчанию в `data_muted` (#BFBFBF). Один-два ключевых элемента — `accent_primary`. Никакой радуги.

---

## Тёмные пресеты

### 1. Midnight Executive
**Настроение:** Серьёзный, корпоративный, уверенный
**Когда:** Бизнес-кейсы, финансы, стратегия

| Роль | HEX | Назначение |
|------|-----|-----------|
| background | `#1E2761` | Navy — доминанта фона |
| surface_elevated | `#0D1B3E` | Deep navy — плашки и карточки |
| text_primary | `#FFFFFF` | Белый — заголовки |
| text_secondary | `#CADCFC` | Ice blue — подзаголовки |
| accent_primary | `#4A90D9` | Royal blue — ключевые элементы |
| accent_secondary | `#E8C547` | Gold — выделения, буллеты |
| border | `#2E3A7A` | Тёмно-синий — разделители |
| data_muted | `#4A5075` | Приглушённый blue-gray |

**Шрифты:** H1: Arial Black 44pt ALL CAPS charSpacing 4 | Body: Calibri 18pt lineSpacing 1.4
**Приём:** Тонкая горизонтальная линия под заголовками (1pt, accent_primary)
**Data palette:** Okabe-Ito (accent_primary как первый цвет данных)

---

### 2. Terminal Green
**Настроение:** Технический, хакерский, developer-friendly
**Когда:** Код, DevTools, AI-инструменты, автоматизация

| Роль | HEX | Назначение |
|------|-----|-----------|
| background | `#0A0A0A` | Almost black |
| surface_elevated | `#1A1A1A` | Dark gray — плашки для кода |
| text_primary | `#E0E0E0` | Light gray |
| text_secondary | `#A0A0A0` | Medium gray |
| accent_primary | `#00CC66` | Terminal green |
| accent_secondary | `#FFB300` | Amber — предупреждения |
| border | `#2A2A2A` | Тёмная граница |
| data_muted | `#3A3A3A` | Тёмно-серый для данных |

**Шрифты:** H1: Consolas 36pt charSpacing 2 | Body: Calibri 18pt
**Приём:** Код/формулы в Consolas на surface_elevated плашке (#1A2A1A)
**Data palette:** Okabe-Ito (accent_primary = зелёный как первый цвет)

---

### 3. Deep Space
**Настроение:** Футуристичный, AI, исследование
**Когда:** AI/ML, космос, наука, deep research

| Роль | HEX | Назначение |
|------|-----|-----------|
| background | `#0B0B1A` | Space black |
| surface_elevated | `#141432` | Deep indigo |
| text_primary | `#FFFFFF` | Белый |
| text_secondary | `#A8B8FF` | Pale blue |
| accent_primary | `#6C5CE7` | Purple |
| accent_secondary | `#00CEC9` | Teal |
| border | `#1E1E40` | Тёмно-фиолетовый |
| data_muted | `#3A3A5C` | Тёмно-индиго |

**Шрифты:** H1: Arial 40pt bold | Body: Calibri 18pt
**Приём:** Градиентные плашки для ключевых тезисов (через shape с transparency)
**Data palette:** Tableau 10 (более холодная гамма)

---

### 4. Charcoal Minimal
**Настроение:** Минималистичный, дорогой, "less is more"
**Когда:** Универсальный тёмный для любой темы

| Роль | HEX | Назначение |
|------|-----|-----------|
| background | `#2D2D2D` | Charcoal |
| surface_elevated | `#3A3A3A` | Medium gray |
| text_primary | `#F5F5F5` | Off-white |
| text_secondary | `#AAAAAA` | Muted gray |
| accent_primary | `#FFFFFF` | Белый — единственный акцент |
| accent_secondary | `#888888` | Medium gray |
| border | `#444444` | Тёмная граница |
| data_muted | `#555555` | Серый для данных |

**Шрифты:** H1: Georgia 42pt italic | Body: Calibri Light 18pt
**Приём:** Максимум воздуха. 60%+ слайда — пусто. Элегантность в пустоте.
**Data palette:** Okabe-Ito (на тёмном фоне цвета читаются хорошо)

---

### 5. Neon Cyber
**Настроение:** Энергичный, молодёжный, стартаповый
**Когда:** Стартапы, новые технологии, эксперименты

| Роль | HEX | Назначение |
|------|-----|-----------|
| background | `#0F0F23` | Dark purple-black |
| surface_elevated | `#1A1A35` | Тёмный фиолет |
| text_primary | `#FFFFFF` | Белый |
| text_secondary | `#E0D4FF` | Lavender |
| accent_primary | `#FF6B9D` | Neon pink |
| accent_secondary | `#22D3EE` | Cyan |
| border | `#2A2A4A` | Тёмный фиолет |
| data_muted | `#4A4A6A` | Приглушённый индиго |

**Шрифты:** H1: Impact 44pt ALL CAPS | Body: Arial 18pt
**Приём:** Цветные плашки-акценты (rectangles с accent_primary) рядом с заголовками
**Data palette:** Tableau 10 (яркие цвета на тёмном фоне)

---

## Светлые пресеты

### 6. Swiss Modern
**Настроение:** Чистый, профессиональный, швейцарский стиль
**Когда:** Универсальный светлый, дизайн, архитектура

| Роль | HEX | Назначение |
|------|-----|-----------|
| background | `#FAFAFA` | Off-white |
| surface_elevated | `#F0F0F0` | Light gray |
| text_primary | `#1A1A1A` | Near black |
| text_secondary | `#666666` | Gray |
| accent_primary | `#E63946` | Red |
| accent_secondary | `#1D3557` | Dark navy |
| border | `#DDDDDD` | Светлая граница |
| data_muted | `#BFBFBF` | Standard muted gray |

**Шрифты:** H1: Arial Black 40pt ALL CAPS charSpacing 6 | Body: Calibri 16pt #333333
**Приём:** Жёсткая сетка. Левый align для всего. Красная линия-акцент слева (3pt accent_primary).
**Data palette:** Okabe-Ito (классика на белом фоне)

---

### 7. Warm Editorial
**Настроение:** Тёплый, человечный, storytelling
**Когда:** Кейсы, истории, HR, образование

| Роль | HEX | Назначение |
|------|-----|-----------|
| background | `#FFF8F0` | Warm white |
| surface_elevated | `#F5EDE3` | Cream |
| text_primary | `#2C2C2C` | Soft black |
| text_secondary | `#7A6A5A` | Warm gray |
| accent_primary | `#C85A3D` | Terracotta |
| accent_secondary | `#4A7C59` | Sage green |
| border | `#E5D8CC` | Тёплая граница |
| data_muted | `#C5B8AC` | Тёплый мuted |

**Шрифты:** H1: Georgia 38pt italic | Body: Calibri 17pt
**Приём:** Крупные цитаты в Georgia italic. Тёплые плашки для выделений.
**Data palette:** Okabe-Ito (тёплая версия)

---

### 8. Paper & Ink
**Настроение:** Текстурный, крафтовый, литературный
**Когда:** Гуманитарные темы, творчество, писательство

| Роль | HEX | Назначение |
|------|-----|-----------|
| background | `#F4F0EB` | Paper |
| surface_elevated | `#EDE8E0` | Parchment |
| text_primary | `#2B2B2B` | Ink |
| text_secondary | `#5A5A5A` | Faded ink |
| accent_primary | `#8B0000` | Dark red |
| accent_secondary | `#1B4332` | Dark green |
| border | `#D4CEC6` | Бумажная граница |
| data_muted | `#B0A898` | Aged paper muted |

**Шрифты:** H1: Palatino 36pt | Body: Garamond 17pt (или Calibri если Garamond недоступен)
**Приём:** Минимум геометрии. Типографика как единственный инструмент дизайна.
**Data palette:** Okabe-Ito (сдержанные тона)

---

### 9. Soft Pastel
**Настроение:** Мягкий, дружелюбный, доступный
**Когда:** Образование, здоровье, продуктивность, лайфстайл

| Роль | HEX | Назначение |
|------|-----|-----------|
| background | `#F8F7FF` | Lavender white |
| surface_elevated | `#EEEAFF` | Soft lavender |
| text_primary | `#2D3436` | Dark gray |
| text_secondary | `#636E72` | Medium gray |
| accent_primary | `#6C5CE7` | Soft purple |
| accent_secondary | `#00B894` | Mint |
| border | `#DDD8F5` | Pastel border |
| data_muted | `#C8C2E8` | Pastel muted |

**Шрифты:** H1: Trebuchet MS 38pt bold | Body: Calibri 17pt
**Приём:** Скруглённые плашки (ROUNDED_RECTANGLE). Мягкие тени.
**Data palette:** Okabe-Ito (пастельная адаптация)

---

### 10. Clean Corporate
**Настроение:** Профессиональный, нейтральный, надёжный
**Когда:** Когда ничего другое не подходит. Безопасный вариант.

| Роль | HEX | Назначение |
|------|-----|-----------|
| background | `#FFFFFF` | Белый |
| surface_elevated | `#F2F4F7` | Light gray |
| text_primary | `#1A1A2E` | Dark navy |
| text_secondary | `#6B7280` | Gray |
| accent_primary | `#2563EB` | Blue |
| accent_secondary | `#10B981` | Green |
| border | `#E5E7EB` | Светлая граница |
| data_muted | `#BFBFBF` | Standard muted |

**Шрифты:** H1: Calibri 36pt bold #1A1A2E | Body: Calibri 16pt #374151
**Приём:** Цветные полоски сверху или сбоку слайда (4pt accent_primary).
**Data palette:** Okabe-Ito (классика)

---

## Специализированные пресеты

### 11. Forest & Moss
**Когда:** Архитектура, экология, sustainability

| Роль | HEX |
|------|-----|
| background | `#F5F7F2` |
| surface_elevated | `#E8EDE2` |
| text_primary | `#1B3A2D` |
| text_secondary | `#4A6B56` |
| accent_primary | `#4A7C59` |
| accent_secondary | `#97BC62` |
| border | `#C8D4C0` |
| data_muted | `#B0C0A8` |

**Шрифты:** H1: Georgia 38pt | Body: Calibri 17pt
**Контраст тёмных слайдов:** background=`#1B3A2D`, text_primary=`#FFFFFF`

---

### 12. Coral Energy
**Когда:** Маркетинг, продажи, презентации роста

| Роль | HEX |
|------|-----|
| background | `#FFFAF5` |
| surface_elevated | `#FFF0E8` |
| text_primary | `#2F3C7E` |
| text_secondary | `#5A6A9E` |
| accent_primary | `#F96167` |
| accent_secondary | `#F9E795` |
| border | `#E8DDD5` |
| data_muted | `#C8C0B8` |

**Шрифты:** H1: Arial Black 40pt | Body: Arial 17pt

---

### 13. Berry & Cream
**Когда:** Творчество, дизайн, продуктовые презентации

| Роль | HEX |
|------|-----|
| background | `#FBF5F0` |
| surface_elevated | `#F5EAE5` |
| text_primary | `#3D1F33` |
| text_secondary | `#7A4A62` |
| accent_primary | `#9B2D5E` |
| accent_secondary | `#D4A0A0` |
| border | `#E8D5D0` |
| data_muted | `#C8B0B0` |

**Шрифты:** H1: Georgia 40pt italic | Body: Calibri 17pt

---

### 14. Ocean Gradient
**Когда:** Наука, данные, исследования

| Роль | HEX |
|------|-----|
| background | `#F0F7FF` |
| surface_elevated | `#E0EEF8` |
| text_primary | `#0A2540` |
| text_secondary | `#2A5070` |
| accent_primary | `#1C7293` |
| accent_secondary | `#00A896` |
| border | `#C5D8E8` |
| data_muted | `#A8C0D0` |

**Шрифты:** H1: Arial 38pt bold | Body: Calibri 17pt
**Data palette:** Tableau 10 (холодная, научная гамма)

---

### 15. Brutalist
**Когда:** Провокация, нестандарт, когда нужно запомниться

| Роль | HEX |
|------|-----|
| background | `#FFFFFF` |
| surface_elevated | `#F0F0F0` |
| text_primary | `#000000` |
| text_secondary | `#333333` |
| accent_primary | `#FF0000` |
| accent_secondary | `#000000` |
| border | `#000000` |
| data_muted | `#808080` |

**Шрифты:** H1: Impact 48pt ALL CAPS | Body: Courier New 16pt
**Приём:** Резкие контрасты. Большие поля. Типографический брутализм. Только 1 акцентный цвет.

---

## Автоматический выбор пресета

| Тема проекта | Рекомендуемые пресеты |
|---|---|
| AI / ML / автоматизация | Terminal Green, Deep Space, Charcoal Minimal |
| Бизнес / финансы | Midnight Executive, Clean Corporate |
| Архитектура / строительство | Forest & Moss, Swiss Modern |
| Творчество / писательство | Paper & Ink, Berry & Cream, Warm Editorial |
| Стартап / MVP | Neon Cyber, Coral Energy |
| Образование / здоровье | Soft Pastel, Warm Editorial |
| Данные / аналитика | Ocean Gradient, Swiss Modern |
| Универсальный | Charcoal Minimal (тёмный), Clean Corporate (светлый) |

---

## Анти-AI-слоп (запрещено)

- Фиолетовый градиент на белом фоне
- Все цвета одной яркости (нет доминанты)
- Шрифт Comic Sans, Papyrus
- Одинаковый layout на всех слайдах
- Центрирование всего текста (только заголовки по центру, остальное — левый align)
- Больше 4 цветов на одном слайде
- Акцентные линии под каждым заголовком (признак AI-шаблонного подхода)
- Радуга данных (все бары разного цвета без смысла)
