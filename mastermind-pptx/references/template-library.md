# Template Library

Библиотека проаудированных шаблонов для mastermind-pptx.
Аудит запускается командой: `python temp/audit-template.py temp/templates/<name>.pptx`

---

## Сравнительная таблица

| Шаблон | Размер | Тип | SmartArt | Макетов | Рейтинг |
|--------|--------|-----|----------|---------|---------|
| **modern-business** | 13.33"×7.5" | Native PPT | ❌ нет | 13 | ⭐⭐⭐ Лучший для генерации |
| **hendrix** | 13.33"×7.5" | Google export | ⚠️ декор | 20 | ⭐⭐⭐ Богатейший набор layouts |
| salerio | 10"×5.625" | Google export | ⚠️ декор | 9 | ⭐⭐ |
| laertes | 10"×5.625" | Google export | ⚠️ декор | 11 | ⭐⭐ |
| mercutio | 10"×5.625" | Google export | ⚠️ декор | 17 | ⭐⭐ |
| antonio | 10"×5.625" | Google export | ⚠️ декор | 10 | ⭐⭐ |
| technology-pixels | 10"×5.625" | Google export | ⚠️ декор | 11 | ⭐⭐ |

> **Размеры:** каждый шаблон имеет свои нативные пропорции — это нормально. Скрипт генерации автоматически вычисляет масштаб (`SX = template_width / ref_width`) и применяет ко всем координатам через хелпер `S()`. Шрифты не масштабируются.

> **Примечание по SmartArt:** У Google Slides экспортов аудит-скрипт помечает декоративные background-фигуры как SmartArt — это ложноположительный результат. Настоящий SmartArt, несовместимый с python-pptx, встречается редко.

---

## 5 подводных камней сторонних шаблонов

1. **SmartArt** — полная несовместимость с python-pptx. Layout с настоящим SmartArt — не использовать.
2. **Нестандартные idx** — 10, 11, 12+ вместо 0-5. Всегда проверять layout map.
3. **"Грязный" XML** из Canva/Google Slides — возможны ошибки. Google-экспорты особенно проблематичны.
4. **Декоративные фигуры перекрывают контент** — добавлять только поверх, не убирать декор.
5. **Тематические цвета** недоступны через API — нужен XML workaround в `audit-template.py`.

---

## ⭐ Шаблон 1: Modern Business (РЕКОМЕНДУЕМЫЙ)

**Файл:** `temp/templates/modern-business.pptx`
**Источник:** PresentationGO — https://www.presentationgo.com/presentation/modern-business-powerpoint-template/
**Лицензия:** С атрибуцией (некоммерческое — свободно)
**Стиль:** Градиент, тёмно-синий + оранжевый. Профессиональный корпоративный.

### Почему лучший
- Нативный PowerPoint (не Google Slides экспорт)
- Стандартный размер 13.333" × 7.5" — координаты из design-system.json без поправок
- Ноль SmartArt — 100% совместим с python-pptx
- Чистые имена плейсхолдеров ("Title 1", "Content Placeholder 2")
- 2 мастера — вариативность тёмных/светлых слайдов

### Тематические цвета
| Роль | HEX | Назначение |
|------|-----|-----------|
| dk1 | `#000000` | Основной тёмный |
| lt1 | `#FFFFFF` | Основной светлый |
| dk2 | `#282B4D` | Тёмно-синий |
| accent1 | `#282B4D` | Тёмно-синий основной |
| accent2 | `#FF7000` | Оранжевый акцент |
| accent3 | `#FFC000` | Жёлтый |
| accent4 | `#5B9BD5` | Голубой |

### Layout Map
| idx | Название | Плейсхолдеры (idx) | Для чего |
|-----|----------|--------------------|---------|
| 0 | Титульный слайд | 0: CENTER_TITLE, 1: SUBTITLE, 10: DATE, 11: FOOTER, 12: SLIDE_NUMBER | cover |
| 1 | 1_Title Slide | 0: CENTER_TITLE, 1: SUBTITLE | cover (вариант 2) |
| 2 | 2_Title Slide | 0: CENTER_TITLE, 1: SUBTITLE, 13: PICTURE | cover с фото |
| 3 | Заголовок и объект | 0: TITLE, 1: OBJECT | bullets, content |
| 4 | Заголовок раздела | 0: TITLE, 1: BODY | section_divider |
| 5 | Два объекта | 0: TITLE, 1: OBJECT, 2: OBJECT | content_text_media |
| 6 | Сравнение | 0: TITLE, 1+2: BODY (заголовки), 3+4: OBJECT | comparison |
| 7 | Только заголовок | 0: TITLE | big_number, cards, process |
| 8 | Пустой слайд | — | quote, closing |
| 9 | Объект с подписью | 0: TITLE, 1: OBJECT, 2: BODY | content_text_media |
| 10 | Рисунок с подписью | 0: TITLE, 1: PICTURE, 2: BODY | team, image+text |
| 11 | Заголовок и вертикальный текст | 0: TITLE, 1: BODY | bullets (вертикаль) |
| 12 | Вертикальный заголовок и текст | 0: TITLE, 1: BODY | альтернативная вёрстка |

### Рекомендуемый маппинг visual_type → layout
| Visual Type | Layout idx | Примечание |
|------------|-----------|-----------|
| cover | 0 или 1 | 0 — с декором, 1 — чище |
| section_divider | 4 | "Заголовок раздела" |
| agenda | 3 | "Заголовок и объект" |
| bullets | 3 | через idx=1 (OBJECT) |
| content_text_media | 5 или 9 | 5 — два объекта, 9 — объект с текстом |
| data_chart | 3 | chart в OBJECT placeholder |
| comparison | 6 | готовый layout "Сравнение" |
| quote | 8 | "Пустой слайд" + ручная вёрстка |
| closing | 8 | "Пустой слайд" + ручная вёрстка |
| big_number | 7 | "Только заголовок" + textbox |
| cards | 7 | "Только заголовок" + ручная вёрстка |
| team | 10 | "Рисунок с подписью" |
| timeline | 7 | "Только заголовок" + ручная вёрстка |

---

## ⭐ Шаблон 2: Hendrix (богатейший набор layouts)

**Файл:** `temp/templates/hendrix.pptx`
**Источник:** SlidesMania — https://slidesmania.com/hendrix-free-presentation-template/
**Лицензия:** Свободная (некоммерческое)
**Стиль:** Тёмный креативный. Фиолетово-розовые градиентные тексты на чёрном.

### Тематические цвета
| Роль | HEX |
|------|-----|
| dk1 | `#000000` |
| lt1 | `#E392FA` (фиолетовый) |
| dk2 | `#FFFFFF` |
| accent1 | `#E392FA` |
| accent2 | `#93A9F9` |

### Layout Map (20 CUSTOM layouts)
| idx | Название | Плейсхолдеры | Назначение |
|-----|----------|-------------|-----------|
| 0 | CUSTOM | 0: TITLE, 1: SUBTITLE | cover |
| 1 | CUSTOM_18 | 0: TITLE | section_divider |
| 2 | CUSTOM_1 | 0: TITLE, 1: BODY | content правая половина |
| 3 | CUSTOM_2 | 0: TITLE + 8 BODY/TITLE | 4 карточки (2×2 grid) |
| 4 | CUSTOM_3 | 0: TITLE, 1: BODY | quote / большой текст |
| 5 | CUSTOM_4 | 0: TITLE, 1-2: SUBTITLE, 3-4: BODY | comparison (2 колонки) |
| 6 | CUSTOM_5 | 0: TITLE, 1: SUBTITLE, 2: BODY | content центрированный |
| 7 | CUSTOM_6 | 0: TITLE, 1: SUBTITLE | big_number / headline |
| 8 | CUSTOM_7 | 0: TITLE | крупный заголовок |
| 9 | CUSTOM_8 | 0: TITLE + 6 SUBTITLE/BODY | 3 горизонтальных пункта |
| 10 | CUSTOM_8_1 | 0: TITLE + 6 SUBTITLE/BODY | 3 карточки горизонтально |
| 11 | CUSTOM_11 | 7 PH | 3 колонки с иконками |
| 12 | CUSTOM_12 | 13 PH | 6 карточек (2×3 grid) |
| 13 | CUSTOM_13 | 0: TITLE, 1-4: BODY | content правая колонка |
| 14 | CUSTOM_14 | 11 PH | 5 колонок |
| 15 | CUSTOM_15 | 0: TITLE, 1: BODY | bullets левая половина |
| 16 | CUSTOM_16 | 0: TITLE, 1: BODY | bullets правая половина |
| 17 | CUSTOM_16_1 | 0: TITLE, 1: BODY | bullets полная ширина |
| 18 | CUSTOM_17 | 0: TITLE, 1: SUBTITLE, 2: BODY | closing / контакты |
| 19 | CUSTOM_20 | 0 PH | декоративный разделитель |

> ⚠️ **Важно:** все layouts помечены SmartArt-предупреждением — это Google Slides экспорт. Фоновые декоративные фигуры не мешают добавлению контента через python-pptx.

---

## Шаблон 3: Salerio

**Файл:** `temp/templates/salerio.pptx`
**Лицензия:** CC BY 4.0 | **Размер:** 10"×5.625"**Стиль:** Тёмно-синий + оранжевый. Динамичные skew-фигуры.

### Тематические цвета
`dk1: #263248` | `accent1: #3F5378` | `accent5: #FF9800` (оранжевый)

### Layout Map
| idx | Название | PH | Для чего |
|-----|---------|----|---------|
| 0 | TITLE | CENTER_TITLE | cover |
| 1 | TITLE_1 | CENTER_TITLE + SUBTITLE + SLIDE_NUMBER | cover с подзаголовком |
| 2 | TITLE_1_1 | BODY + SLIDE_NUMBER | section (только body) |
| 3 | TITLE_AND_BODY | TITLE + BODY + SLIDE_NUMBER | bullets, agenda |
| 4 | TITLE_AND_TWO_COLUMNS | TITLE + 2×BODY + SLIDE_NUMBER | comparison |
| 5 | TITLE_AND_TWO_COLUMNS_1 | TITLE + 3×BODY + SLIDE_NUMBER | cards (3 колонки) |
| 6 | TITLE_ONLY | TITLE + SLIDE_NUMBER | big_number, timeline |
| 7 | CAPTION_ONLY | BODY + SLIDE_NUMBER | подпись/footer |
| 8 | BLANK | SLIDE_NUMBER | quote, closing |

---

## Шаблон 4: Laertes

**Файл:** `temp/templates/laertes.pptx`
**Лицензия:** CC BY 4.0 | **Размер:** 10"×5.625"**Стиль:** Тёмный элегантный. Чёрный фон + красно-оранжевые акценты.

### Тематические цвета
`dk1: #000000` | `accent1: #F55C21` (оранжево-красный) | `accent2: #BA3B21` | `accent3: #661201`

### Layout Map
| idx | Название | PH | Для чего |
|-----|---------|----|---------|
| 0 | TITLE | CENTER_TITLE | cover |
| 1 | TITLE_1 | CENTER_TITLE + SUBTITLE | cover с подзаголовком |
| 2 | TITLE_1_1 | BODY + SLIDE_NUMBER | section |
| 3 | TITLE_AND_BODY | TITLE + BODY + SLIDE_NUMBER | bullets, agenda |
| 4 | TITLE_AND_BODY_1 | TITLE + BODY + SLIDE_NUMBER | bullets (узкий) |
| 5 | TITLE_AND_TWO_COLUMNS | TITLE + 2×BODY + SLIDE_NUMBER | comparison |
| 6 | TITLE_AND_TWO_COLUMNS_1 | TITLE + 3×BODY + SLIDE_NUMBER | cards |
| 7 | TITLE_ONLY | TITLE + SLIDE_NUMBER | big_number, timeline |
| 8 | CAPTION_ONLY | BODY + SLIDE_NUMBER | подпись |
| 9 | BLANK | SLIDE_NUMBER | quote, closing |
| 10 | BLANK_1 | SLIDE_NUMBER | альтернативный blank |

---

## Шаблон 5: Mercutio

**Файл:** `temp/templates/mercutio.pptx`
**Лицензия:** CC BY 4.0 | **Размер:** 10"×5.625"**Стиль:** Tech/Startup. Синий + жёлтый, энергичный.

### Тематические цвета
`dk1: #000000` | `accent1: #45AFDC` (голубой) | `accent3: #ED9E46` | `accent4: #FFC800` (жёлтый)

### Layout Map (17 layouts — дублируются в двух цветовых схемах)
| idx | Название | PH | Для чего |
|-----|---------|----|---------|
| 0 | TITLE | CENTER_TITLE | cover |
| 1 | TITLE_1 | CENTER_TITLE + SUBTITLE | cover |
| 2 | TITLE_1_3_1 | CENTER_TITLE + SUBTITLE | cover (вариант) |
| 3 | TITLE_1_1 | BODY + SLIDE_NUMBER | section |
| 4 | TITLE_1_1_1_1 | BODY + SLIDE_NUMBER | section (вариант) |
| 5 | TITLE_AND_BODY | TITLE + BODY + SLIDE_NUMBER | bullets |
| 6 | TITLE_AND_TWO_COLUMNS | TITLE + 2×BODY + SLIDE_NUMBER | comparison |
| 7 | TITLE_AND_TWO_COLUMNS_1 | TITLE + 3×BODY + SLIDE_NUMBER | cards |
| 8 | TITLE_ONLY | TITLE + SLIDE_NUMBER | big_number |
| 9 | CAPTION_ONLY | BODY + SLIDE_NUMBER | подпись |
| 10 | BLANK | SLIDE_NUMBER | quote, closing |
| 11-16 | *_1_1 (дубли) | То же | Альтернативная цветовая схема |

---

## Шаблон 6: Antonio

**Файл:** `temp/templates/antonio.pptx`
**Лицензия:** CC BY 4.0 | **Размер:** 10"×5.625"**Стиль:** Корпоративный светлый. Синий (#2185C5), белый фон.

### Тематические цвета
`dk1: #677480` | `dk2: #2185C5` (синий) | `accent3: #F20253` (красный) | `accent4: #FF9715` (оранжевый)

### Layout Map
| idx | Название | PH | Для чего |
|-----|---------|----|---------|
| 0 | TITLE | CENTER_TITLE | cover (без подзаголовка) |
| 1 | TITLE_1 | CENTER_TITLE + SUBTITLE + SLIDE_NUMBER | cover |
| 2 | TITLE_1_1 | BODY + SLIDE_NUMBER | section |
| 3 | TITLE_AND_BODY | TITLE + BODY + SLIDE_NUMBER | bullets, agenda |
| 4 | TITLE_AND_TWO_COLUMNS | TITLE + 2×BODY + SLIDE_NUMBER | comparison |
| 5 | TITLE_AND_TWO_COLUMNS_1 | TITLE + 3×BODY + SLIDE_NUMBER | cards |
| 6 | TITLE_ONLY | TITLE + SLIDE_NUMBER | big_number, timeline |
| 7 | CAPTION_ONLY | BODY + SLIDE_NUMBER | подпись |
| 8 | BLANK | SLIDE_NUMBER | quote, closing |
| 9 | BLANK_1 | SLIDE_NUMBER | альтернативный blank |

---

## Шаблон 7: Technology Pixels (текущий рабочий)

**Файл:** `temp/template.pptx`
**Источник:** SlidesCarnival | **Лицензия:** CC BY 4.0
**Размер:** 10"×5.625" (scale 0.75) | **Стиль:** Тёмный tech, голубые акценты

### Тематические цвета
`dk1: #003B55` | `dk2: #0B87A1` | `accent1: #D3EBD5` | `accent4: #01597F`

### Layout Map
| idx | Название | PH | Для чего |
|-----|---------|----|---------|
| 0 | TITLE | CENTER_TITLE | cover (без подзаголовка) |
| 1 | TITLE_1 | CENTER_TITLE + SUBTITLE | cover |
| 2 | TITLE_1_1 | BODY + SLIDE_NUMBER ⚠️ SmartArt | не использовать |
| 3 | TITLE_AND_BODY | TITLE + BODY + SLIDE_NUMBER | bullets, agenda |
| 4 | TITLE_AND_TWO_COLUMNS | TITLE + 2×BODY + SLIDE_NUMBER | comparison |
| 5 | TITLE_AND_TWO_COLUMNS_1 | TITLE + 3×BODY + SLIDE_NUMBER | cards |
| 6 | TITLE_ONLY | TITLE + SLIDE_NUMBER | big_number, timeline |
| 7 | BLANK | SLIDE_NUMBER | quote, closing |
| 8 | CENTERED_TEXT | CENTER_TITLE + SUBTITLE | section_divider |
| 9 | BIG_NUMBER | CENTER_TITLE + SLIDE_NUMBER | big_number |
| 10 | ONE_COLUMN_TEXT | TITLE + BODY + SLIDE_NUMBER | bullets альтернатива |

---

## Как выбрать шаблон

| Задача | Рекомендация |
|--------|-------------|
| Генерация без проблем, первый раз | **Modern Business** — нативный PPT, стандартный размер |
| Максимум готовых layout-вариантов | **Hendrix** — 20 layouts под любую задачу |
| Тёмный корпоративный | **Salerio** или **Technology Pixels** |
| Элегантный тёмный | **Laertes** |
| Светлый профессиональный | **Antonio** |
| Энергичный startup | **Mercutio** |

## Как обновить этот файл после нового шаблона

1. Запустить: `python temp/audit-template.py temp/templates/<name>.pptx`
2. Добавить раздел с тематическими цветами, layout map и рекомендуемым маппингом visual_type → layout
3. Обновить сравнительную таблицу
