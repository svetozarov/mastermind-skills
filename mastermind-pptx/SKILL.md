---
name: mastermind-pptx
description: >
  Генерирует профессиональные PPTX-презентации. v8: четыре движка.
  gamma-pro (REST API + автоскачивание), gamma-free (MCP + ручное скачивание),
  html-deck (HTML-first + vision-loop через skill mastermind-deck — рекомендуемый для качества),
  local (python-pptx — legacy, базовый дизайн).
  Вызывается оркестратором mastermind. Не для прямого вызова.
---

# Mastermind PPTX — генератор презентаций (v8: четыре движка)

Четыре режима генерации, выбирает пользователь через оркестратор:

### 1. Gamma Pro (`engine = "gamma-pro"`)
- Gamma MCP-коннектор для генерации + REST API для автоскачивания PPTX
- AI-дизайн, автовыбор темы, до 60 слайдов, без водяного знака, премиум AI-модели
- Требуется: подписка Gamma Pro ($18/мес) + MCP-коннектор + API-ключ в `.env`
- Постобработка через python-pptx: speaker notes, фото, скриншоты, контакты

### 2. Gamma Free/Plus (`engine = "gamma-free"`)
- Gamma MCP-коннектор для генерации, ручное скачивание PPTX из браузера
- AI-дизайн, до 10 слайдов (Free) / 20 (Plus), водяной знак на Free
- Требуется: аккаунт Gamma + MCP-коннектор (API-ключ не нужен)
- Постобработка через python-pptx: speaker notes, фото, скриншоты, контакты

### 3. HTML-Deck (`engine = "html-deck"`) — **рекомендуемый для качества**
- HTML-first пайплайн через под-скилл `mastermind-deck`
- Слой 1: extract-style.py → tokens.json в W3C DTCG из референсов (PDF-брендбук, скриншоты, URL)
- Слой 2: 17 overflow-safe HTML-partial (12 универсальных + 5 архитектурных), container queries, clamp, Safe Slots
- Слой 3: vision-loop — детерминистический overflow-detector (0 img-tokens) + мультимодальный critic + fixer-каскад 4 уровней, 3 итерации Sonnet + 2 Opus
- Export: html2pptx.js для editable PPTX или screenshot (Playwright → addImage) для font_fidelity: strict
- Требуется: Node 20+, Python 3.11+, Playwright, Anthropic API-ключ в `.env`
- Полностью офлайн после установки, без ограничений по слайдам, дизайн под референсы клиента

### 4. Локальный (`engine = "local"`) — legacy
- python-pptx + дизайн-система + профессиональный шаблон
- Полный контроль, без ограничений по слайдам, работает офлайн
- **Дизайн базовый** — используй только если html-deck невозможен (нет Node/Playwright)
- Ничего дополнительного не нужно

---

## Выбор движка

Оркестратор передаёт параметр `engine`: `gamma-pro`, `gamma-free`, `html-deck` или `local`.

| Engine | Описание |
|---|---|
| `gamma-pro` | Gamma Pro: REST API polling + автоскачивание PPTX, до 60 слайдов, без водяного знака, премиум AI-модели |
| `gamma-free` | Gamma Free/Plus: MCP-коннектор, ручное скачивание PPTX, до 10-20 слайдов, водяной знак на Free |
| `html-deck` | **HTML-first + vision-loop**: tokens из референсов → компонентная библиотека → vision-QA → html2pptx. Качество близко к ручному дизайну |
| `local` | python-pptx: полный контроль, без ограничений, базовый дизайн (legacy) |

Если `engine` = `gamma-pro`, используй раздел **Gamma Engine** с Фазой 3A (REST API).
Если `engine` = `gamma-free`, используй раздел **Gamma Engine** с Фазой 3B (ручное скачивание).
Если `engine` = `html-deck`, используй раздел **HTML-Deck Engine** (делегирование на skill `mastermind-deck`).
Если `engine` = `local`, используй раздел **Local Engine**.

---

## ═══════════════════════════════════════════
## GAMMA ENGINE (MCP-коннектор)
## ═══════════════════════════════════════════

### Справочник Gamma API/MCP (для корректной работы)

**Gamma MCP-коннектор** предоставляет ровно 3 инструмента:
- `generate` — создать новую презентацию (НЕ редактировать существующую)
- `get_themes` — список тем (id, name, colorKeywords, toneKeywords)
- `get_folders` — список папок пользователя

**Чего НЕТ в MCP:** редактирование, удаление, проверка статуса, скачивание файла.

**MCP generate возвращает:**
```json
{ "generationId": "abc123", "status": "pending", "gammaUrl": "https://gamma.app/generations/abc123" }
```
MCP отдаёт `status: "pending"` СРАЗУ, не дожидаясь завершения. `exportUrl` через MCP не приходит.
`gammaUrl` ведёт на страницу, которая после генерации перенаправляет на `/docs/...`.

**Gamma REST API (только Pro):**
- Base URL: `https://public-api.gamma.app/v1.0`
- Auth: заголовок `X-API-KEY: <ключ>`
- `GET /generations/{id}` — проверка статуса, возвращает `exportUrl` когда `completed`
- `GET /themes` — список тем
- `GET /folders` — список папок

**REST API polling response (когда completed):**
```json
{
  "status": "completed",
  "gammaUrl": "https://gamma.app/docs/...",
  "exportUrl": "https://storage.gamma.app/...(подписанная ссылка)...",
  "credits": { "deducted": 42, "remaining": 3958 }
}
```

`exportUrl` — прямая ссылка на скачивание PPTX, живёт ~1 неделю.
Скачивание: `curl -L -o output.pptx "<exportUrl>"`.

### Предварительная проверка

**Перед началом работы проверь доступность коннектора:**

Попробуй вызвать `get_themes` (Gamma MCP tool). Если инструмент недоступен или
вернул ошибку — СТОП. Скажи пользователю:

> Gamma MCP-коннектор не подключён. Подключите его в настройках Claude Code
> (Settings → MCP Servers → Gamma) и напишите, чтобы продолжить.
> Или выберите режим без Gamma (локальная генерация).

**Для `gamma-pro` дополнительно:** проверь наличие `GAMMA_API_KEY` в `.env`:
```bash
grep GAMMA_API_KEY .env
```
Если нет — дай инструкцию (см. Фазу 3A).

### Gamma: Фаза 1 — Подготовка inputText

**Формат: развёрнутое описание концепции каждого слайда, НЕ готовый текст.**

Gamma лучше всего работает, когда получает:
- Общий контекст презентации (мероприятие, аудитория, тон, спикер)
- Для КАЖДОГО слайда: заголовок, концепцию, ключевой месседж, что должно быть визуально
- Разделители `---` между слайдами

**Шаблон inputText:**

```
[Общий контекст: мероприятие, формат, аудитория, тон, спикер — 3-5 предложений]

---

СЛАЙД 1 — [ТИП: ТИТУЛЬНЫЙ / КОНТЕНТ / ПРОЦЕСС / СРАВНЕНИЕ / ВОПРОС / КОНТАКТЫ]
Концепция: [Что хотим показать и зачем. 3-5 предложений с деталями.]
Заголовок: [Предлагаемый заголовок]
Ключевой месседж: [Одна фраза — что зритель должен запомнить]
Визуально: [Описание желаемой компоновки — колонки, схема, крупный текст, и т.д.]
Данные/факты: [Конкретные цифры, имена, термины — всё что нельзя выдумывать]

---

СЛАЙД 2 — [ТИП]
...
```

**Правила подготовки inputText:**
- Максимум информации — Gamma сама сожмёт. Лучше дать больше, чем потерять контекст.
- Все факты, цифры, имена, ссылки — вписывать ТОЧНО (Gamma не должна выдумывать).
- Не сжимать и не упрощать текст заранее — Gamma справится.
- Если из одного описанного слайда Gamma сделает два (или наоборот) — это ОК.
- Для слайдов с фото/скриншотами — указать `[PLACEHOLDER: описание изображения]`.

### Gamma: Фаза 1.5 — Выбор темы

**Gamma API не подбирает тему автоматически** — без `themeId` всегда дефолтная.
Скилл подбирает тему сам, на основе тона и содержания проекта.

#### Для `gamma-pro` — выбор из 3 вариантов:

**КРИТИЧНО: три темы должны быть из РАЗНЫХ визуальных семейств.**
Не три вариации одного стиля (светлая + светлая + светлая), а три принципиально
разных подхода к дизайну. Пользователь должен выбирать между разными стилями,
а не между оттенками одного цвета.

**Визуальные семейства Gamma (выбери по одной теме из трёх разных):**

| Семейство | Характеристика | Примеры тем |
|---|---|---|
| Light minimal | Белый фон, тонкие акценты, воздух | Icebreaker, Breeze, Pearl, Chimney Smoke, Serene |
| Dark professional | Тёмный фон, контрастный текст | Founder, Coal, Ash, Blue Steel, Chimney Dust |
| Colorful friendly | Яркие цвета, выраженный характер | Cornflower, Gamma, Peach, Orbit, Seafoam |
| Warm organic | Бежевые/земляные тона, текстуры | Creme, Oatmeal, Dune, Terracotta, Cigar |
| Bold contrast | Высокий контраст, крупная типографика | Onyx, Howlite, Piano, Rush, Sanguine |
| Gradient/futuristic | Градиенты, неон, tech-стиль | Aurora, Nebulae, Electric, Borealis, Incandescent |

**Алгоритм выбора:**
1. Вызови `get_themes` — получи список тем с `toneKeywords` и `colorKeywords`
2. Определи тон проекта (tech/casual/formal/creative и т.д.)
3. Выбери **3 семейства**, которые могут подойти проекту
4. Из каждого семейства выбери **1 лучшую тему** по `toneKeywords`
5. Результат: 3 темы из 3 разных семейств

**Генерация превью:**
1. Сгенерируй **1 тестовый слайд** в каждой из 3 тем.
   **ОБЯЗАТЕЛЬНО используй слайд с МАКСИМАЛЬНЫМ контентом** — НЕ титульный.
   Титульный слайд слишком простой: на нём все темы выглядят одинаково.
   Лучший кандидат — слайд с карточками, сравнением, буллетами или процессом
   (visual type: cards, comparison, process, bullets). Именно на таких слайдах
   видна реальная разница между темами: как они работают с колонками, цветными
   блоками, акцентами, иконками.
   Обязательно передай `exportAs: "pptx"` для скачивания.
   ```
   generate({
     inputText: <контент одного слайда>,
     format: "presentation",
     numCards: 1,
     themeId: "<id темы>",
     exportAs: "pptx",
     cardOptions: { dimensions: "16x9" },
     textOptions: { language: "ru" }
   })
   ```
2. Дождись завершения (REST API polling), скачай каждый PPTX через `exportUrl`
3. Экспортируй каждый PPTX в PNG через `verify-slides.py`
4. Показ пользователю — **строго в два шага, без перемешивания:**

   **Шаг А:** Прочитай ВСЕ 3 PNG **параллельно в одном сообщении** (3 вызова Read
   tool в одном блоке). Никакого текста между ними. Это группирует скриншоты
   в один визуальный блок в UI.

   **Шаг Б:** В СЛЕДУЮЩЕМ сообщении — ОДНИМ текстовым блоком — все описания и вопрос:
   ```
   **Тема 1 — [название]** ([семейство]): [описание стиля — 1 предложение]

   **Тема 2 — [название]** ([семейство]): [описание стиля — 1 предложение]

   **Тема 3 — [название]** ([семейство]): [описание стиля — 1 предложение]

   Какая нравится? (1, 2 или 3)
   ```

   **ЗАПРЕЩЕНО:**
   - Вставлять текст между Read-вызовами (это разбивает скриншоты на отдельные блоки)
   - Использовать AskUserQuestion (пользователь не видит скриншоты из того UI)
   - Делать скриншоты из браузера (мелкие, с UI-элементами Gamma)

5. Используй выбранный `themeId` в основной генерации (Фаза 2)

#### Для `gamma-free` — автоматический выбор:

1. Вызови `get_themes`
2. Выбери **1 лучшую тему** по соответствию `toneKeywords` проекту
3. Передай её `themeId` в генерацию (Фаза 2)

*(На Free-плане лимит генераций ограничен — не тратим 3 из них на превью тем.)*

---

### Gamma: Фаза 2 — Параметры генерации

```
generate({
  inputText: <подготовленный текст>,
  format: "presentation",
  textMode: "generate",            // Gamma сама пишет текст из описаний
  exportAs: "pptx",                // PPTX-экспорт (для Pro — exportUrl в ответе)
  themeId: "<id выбранной темы>",  // Из Фазы 1.5
  cardOptions: { dimensions: "16x9" },
  textOptions: {
    language: "ru",
    tone: "casual",                // Research Mastermind = клуб по интересам
    audience: "<описание аудитории из event-profile.md>"
  },
  imageOptions: {
    source: "placeholder"          // Пустые места для фото/скриншотов
  },
  additionalInstructions: "<инструкции по стилю и компоновке>"
})
```

**`themeId` — ОБЯЗАТЕЛЬНО.** Всегда передавай тему из Фазы 1.5.

**Параметр `exportAs: "pptx"`** — передавать ВСЕГДА (на всех планах). На Pro-плане
REST API вернёт `exportUrl` при polling. На Free/Plus — скачивание вручную через gammaUrl.

**Параметр `numCards`:**
- Free план: max 10
- Plus план: max 20
- Pro план: max 60
- Если слайдов больше лимита — объединить тематически близкие

**Параметр `imageOptions.source`:**
- Если нужны placeholder для фото/скриншотов: `"placeholder"`
- Если пользователь хочет AI-картинки: `"aiGenerated"` + `stylePreset`
- Если не нужны картинки: `"noImages"`

**КРИТИЧНО: Placeholder-ы только на нужных слайдах.**
Gamma ставит placeholder-изображения по своему усмотрению — часто на слайды, где они не нужны.
Чтобы этого избежать, в `inputText` для КАЖДОГО слайда явно указывай:
- `[PLACEHOLDER: описание изображения]` — на слайдах, где нужен скриншот/фото от пользователя
- `Визуально: только текст и графические элементы, БЕЗ изображений` — на всех остальных слайдах

В `additionalInstructions` добавь:
```
Размещай placeholder-изображения ТОЛЬКО на слайдах, где в описании явно указан [PLACEHOLDER].
На остальных слайдах НЕ добавляй никаких placeholder-ов и изображений.
```

### Gamma: Фаза 3 — Получение PPTX

Gamma MCP возвращает `{ generationId, status, gammaUrl }`.
MCP-коннектор отдаёт `status: "pending"` сразу, не дожидаясь завершения генерации.
`exportUrl` через MCP не приходит — MCP не поддерживает polling.

**Используй Фазу 3A (для `gamma-pro`) или Фазу 3B (для `gamma-free`).**

---

#### Фаза 3A — REST API polling (только `gamma-pro`)

**Требуется:** API-ключ Gamma в переменной окружения `GAMMA_API_KEY`.
Если ключ не настроен — попроси пользователя:

> Для автоматического скачивания нужен API-ключ Gamma.
> Получите его: gamma.app → Settings → API → Create Key.
> Затем выполните в терминале:
> ```
> echo GAMMA_API_KEY=ВСТАВЬ_СЮДА_КЛЮЧ >> .env
> ```

**Алгоритм:**

```bash
# 1. Polling статуса (каждые 30 секунд, max 10 попыток = 5 минут)
curl -s -H "X-API-KEY: $GAMMA_API_KEY" \
  "https://public-api.gamma.app/v1.0/generations/{generationId}"
# Ответ: { "status": "completed", "exportUrl": "https://...", "gammaUrl": "https://..." }

# 2. Когда status = "completed" и есть exportUrl — скачать:
curl -L -o "projects/<name>/<Name>-Research-Wednesday.pptx" "<exportUrl>"
```

**Детали polling:**
1. Подожди 30 секунд после вызова generate
2. `curl` → проверь `status`
3. Если `pending` или `in_progress` → подожди 30 секунд → повтори
4. Если `completed` + есть `exportUrl` → скачай PPTX через curl
5. Если `completed` но нет `exportUrl` → подожди ещё 30 секунд (генерация экспорта)
6. Если 10 попыток и всё ещё нет → fallback на Фазу 3B

**После скачивания:**
- Проверь размер файла (`ls -la`) — должен быть > 10KB
- Переходи к Фазе 4 (постобработка)

---

#### Фаза 3B — Ручное скачивание (для `gamma-free` или fallback)

**Когда:** engine = `gamma-free`, или REST API недоступен, или polling не сработал.

1. Покажи пользователю `gammaUrl` с инструкцией:

   > Презентация создана в Gamma! Откройте:
   > **[gammaUrl]**
   >
   > Для скачивания PPTX:
   > 1. Подождите ~30 сек, пока Gamma завершит генерацию
   > 2. Нажмите меню «...» (вверху справа) → «Export» → «PowerPoint (.pptx)»
   > 3. Сохраните файл как: `projects/<name>/<Name>-Research-Wednesday.pptx`
   > 4. Напишите мне — я добавлю speaker notes и вставлю фото

2. Дождись подтверждения от пользователя
3. Проверь наличие файла по стандартному пути
4. Переходи к Фазе 4 (постобработка)

**Если Chrome MCP подключён** — можно попробовать автоматизировать через браузер:
- `navigate` → gammaUrl → подождать загрузки → меню → Export → PPTX
- Но это ненадёжный способ, используй как дополнительный, не основной

### Gamma: Фаза 4 — Постобработка PPTX

**ВАЖНО: Перед любой работой с PPTX — сначала замени шрифты!**

#### Шаг 0: Замена шрифтов на системные (ОБЯЗАТЕЛЬНО)

Gamma использует веб-шрифты (Inter, Outfit, DM Sans и др.), которых нет в стандартной Windows.
Вместо установки — **заменяем на визуально похожие системные шрифты** прямо в XML.

Это надёжнее установки: работает на ЛЮБОМ компьютере без скачивания шрифтов,
без конфликтов версий, без проблем с кириллицей.

**Замена — одна команда:**

```bash
python <путь-к-skills>/mastermind-pptx/tools/replace-gamma-fonts.py <абсолютный-путь-к-pptx>
```

Скрипт поставляется в составе скилла: `~/.claude/skills/mastermind-pptx/tools/replace-gamma-fonts.py`

Скрипт автоматически:
1. Извлекает все шрифты из PPTX XML
2. Определяет нестандартные (не системные Windows)
3. Подбирает визуально похожий системный шрифт по категории:
   - Geometric sans (Outfit, Poppins, Montserrat) → **Bahnschrift**
   - Modern grotesque (Inter, Geist, Roboto) → **Segoe UI**
   - Humanist sans (Open Sans, Lato, Heebo) → **Calibri**
   - Rounded sans (Nunito, Rubik) → **Candara**
   - Serif (Playfair, Merriweather) → **Georgia**
   - Monospace → **Consolas**
4. Фиксит bold/italic атрибуты (Gamma пишет "Inter Bold" как typeface, а не через `b="1"`)
5. Заменяет шрифты во ВСЕХ XML-файлах (слайды, тема, мастер-слайды)
6. Не трогает системные шрифты и complex-script fallbacks

**Предпросмотр без изменений:**
```bash
python replace-gamma-fonts.py <pptx> --dry-run
```

---

После замены шрифтов — постобработка PPTX через python-pptx:

#### Шаг 1: Speaker notes (ОБЯЗАТЕЛЬНО)

Для КАЖДОГО слайда написать полный текст речи:
- 7-12 предложений разговорным тоном
- Можно читать вслух — звучит естественно
- Включают переход к следующему слайду
- Формат: `ГОВОРИТЬ:\n...\n\nПЕРЕХОД: ...\n\nВРЕМЯ: ~N мин`
- Источник: файл `слайды.md` проекта (там уже есть speaker notes)

#### Шаг 2: Проверка контактов

- Прочитать концепция.md — взять оттуда контактные данные
- Если Gamma написала неправильный @username — исправить

#### Шаг 3: Инструкция по изображениям (ОБЯЗАТЕЛЬНО)

Сообщить пользователю, на каких слайдах есть placeholder-ы для изображений:

> На следующих слайдах есть placeholder-ы для ваших изображений:
> - Слайд N: [описание нужного изображения]
> - Слайд M: [описание нужного изображения]
>
> Откройте PPTX в PowerPoint, кликните на placeholder и вставьте своё изображение.

**Изображения НЕ вставляются автоматически.** Пользователь сам заменяет placeholder-ы в PowerPoint.

#### Шаг 4: Сохранение

```
projects/<name>/<Name>-Research-Wednesday.pptx
```

### Gamma: Фаза 5 — QA (ОБЯЗАТЕЛЬНО, БЕЗ ИСКЛЮЧЕНИЙ)

**Визуальная верификация КАЖДОГО слайда — блокирующий шаг перед доставкой.**

#### Шаг 1: Экспорт слайдов в PNG

```bash
python <путь-к-skills>/mastermind-pptx/tools/verify-slides.py \
  "<абсолютный-путь-к-pptx>" \
  --output "<Masterminder/_temp/qa_<project>>"
```

Скрипт использует PowerPoint COM API для экспорта каждого слайда в PNG 1920×1080.

#### Шаг 2: Визуальная проверка КАЖДОГО слайда

Прочитай КАЖДЫЙ PNG через Read tool **по одному**. Для каждого слайда выведи отчёт
в СТРОГО ФИКСИРОВАННОМ формате. Никакой другой формат не допускается.

#### Формат отчёта (обязателен для КАЖДОГО слайда)

```
**Слайд N — [Заголовок слайда]**
- C1 Placeholder-ы: [OK / FAIL — описание]
- C2 Перекрытия: [OK / FAIL — описание]
- C3 Текст читаем: [OK / FAIL — описание]
- C4 Шрифты: [OK / FAIL — описание]
- C5 Переносы слов: [OK / FAIL — какое слово, как переносится]
- M1 Изображения: [OK / N/A / FAIL — описание]
- M2 Контакты: [OK / N/A / FAIL — описание]
- M3 Placeholder-текст: [OK / FAIL — описание]
- **Вердикт: [PASS / FAIL]**
```

**Правила вердикта:**
- Любой FAIL в C1–C5 → вердикт FAIL, слайд блокирует доставку
- Любой FAIL в M1–M3 → вердикт FAIL, слайд блокирует доставку
- Вердикт PASS только когда ВСЕ пункты OK или N/A
- **ЗАПРЕЩЕНО** ставить PASS с оговорками ("PASS, но...", "PASS (минорное...)").
  Либо PASS, либо FAIL. Третьего не дано.

#### Шаг 3: Исправление

Если хотя бы один слайд FAIL:
1. Исправь проблему через python-pptx
2. Пересохрани PPTX
3. Перезапусти экспорт ВСЕХ слайдов в PNG (замена шрифтов могла повлиять на другие слайды)
4. Перепроверь ВСЕ слайды заново (полный отчёт)
5. Повтори до полного PASS ВСЕХ слайдов

**НЕ доставлять презентацию, пока есть хотя бы один FAIL.**

#### Шаг 4: Сводная таблица

После проверки ВСЕХ слайдов — обязательно вывести сводную таблицу:

```
| Слайд | Название | Вердикт |
|---|---|---|
| 1 | ... | PASS |
| 2 | ... | FAIL — [причина] |
```

Если в таблице есть хотя бы один FAIL → перейти к Шагу 3.
Если все PASS → перейти к доставке.

#### Шаг 5: Доставка

Только после PASS ВСЕХ слайдов — показать пользователю.

**НИКОГДА не пропускай этот шаг. НИКОГДА не говори "я проверил" без полного отчёта по каждому слайду.**
**НИКОГДА не ставь PASS с оговорками. FAIL — значит FAIL, исправляй.**

---

## ═══════════════════════════════════════════
## HTML-DECK ENGINE (HTML-first + vision-loop)
## ═══════════════════════════════════════════

Если `engine == "html-deck"` — **полностью делегируй работу под-скиллу `mastermind-deck`**. Не запускай python-pptx, не используй design-system.json, не открывай шаблоны из `temp/templates/`. Весь пайплайн живёт в `skills/mastermind-deck/` и организован как 6 фаз.

### Phase 0 — инфраструктура

Перед запуском проверь:
1. Node.js ≥ 20: `node --version`
2. Python ≥ 3.11: `python --version`
3. Playwright: `npx playwright --version` (если нет — `npx playwright install chromium`)
4. Anthropic API-ключ в `.env`: `ANTHROPIC_API_KEY=...`
5. Если нет — СТОП, скажи пользователю и дай команду для CMD:
   ```
   echo ANTHROPIC_API_KEY=ВСТАВЬ_СЮДА_КЛЮЧ >> P:\Masterminder\.env
   ```

Если `--engine html-deck` задан, а инфраструктуры нет — **не откатывайся на local**, а попроси установить. Local — только если пользователь явно выбрал его или если нет возможности установить Node/Playwright.

### Phase 1 — extract tokens (делегация на mastermind-deck-tokens)

Вход: папка `references/` с PDF-брендбуком / скриншотами слайдов / URL конкурентов.

```bash
cd skills/mastermind-deck/sub-skills/mastermind-deck-tokens
python scripts/extract-style.py \
  --refs P:/Masterminder/projects/<name>/references/ \
  --out  P:/Masterminder/projects/<name>/tokens.json \
  --brief P:/Masterminder/projects/<name>/brief.yaml
node scripts/build-tokens.mjs \
  --tokens P:/Masterminder/projects/<name>/tokens.json \
  --out-css P:/Masterminder/projects/<name>/globals.css \
  --out-tw  P:/Masterminder/projects/<name>/tailwind.config.js
```

Результат: `tokens.json` в W3C DTCG с обязательной секцией `slide.*`, `globals.css`, `tailwind.config.js`.

### Phase 2 — обязательная pre-generation декларация

Перед тем, как сгенерировать хоть один HTML-файл, **ты обязан вывести 5-строчный план**:

```
DESIGN DECISIONS:
1. Type: <pitch / album / general>
2. Preset from tokens.json: <sandwich light / sandwich dark / editorial / brutalist>
3. Accent hex: <#RRGGBB from tokens>
4. Motif: <ONE visual motif for the whole deck>
5. Typography: <display/text pair from tokens>

REFLEX-DEFAULTS I AM REJECTING:
- <list 3–5 items I might have defaulted to, explicitly rejecting each>
```

Без декларации — **не приступай к генерации**. Если декларация противоречит anti-slop-checklist — перепиши её.

### Phase 3 — generate HTML (делегация на mastermind-deck-layout)

1. Прочитай `skills/mastermind-deck/components/layouts-registry.json` — метаданные 17 layout-ов.
2. Для каждого слайда из `слайды.md` выбери layout по эвристике из `anti-slop-checklist.md`.
3. Сгенерируй `slides/slide-01.html ... slide-NN.html` через `partial-loader.mjs`: читает partial из `components/<kind>.html`, подставляет `data-slot` значения, применяет `base.css` + `globals.css`.
4. Каждый слайд — standalone HTML-файл с `<link href="globals.css">` и `<link href="base.css">`, размер канваса строго 1920×1080.

### Phase 4 — vision-loop (делегация на mastermind-deck-visionloop)

```bash
cd skills/mastermind-deck/scripts
npm install           # первый раз
npx playwright install chromium   # первый раз
node run-vision-loop.mjs \
  --slides-dir P:/Masterminder/projects/<name>/slides/ \
  --out-audit  P:/Masterminder/projects/<name>/audit.json \
  --max-iter 3 \
  --budget-tokens 100000
```

Loop per slide: detector (0 img-tokens) → critic (только при detector OK) → fixer (каскад 4 уровней: clamp → line-clamp → layout switch → split). 3 итерации Sonnet 4.6; если не сошлось — 2 на Opus 4.7; если всё ещё нет — `needs_human_review: true`.

**Не сокращай итерации, не пропускай слайды, не редактируй audit вручную.**

### Phase 5 — export (делегация на mastermind-deck/scripts/assemble-deck.mjs)

```bash
cd skills/mastermind-deck/scripts
node fonts-check.mjs --slides-dir P:/Masterminder/projects/<name>/slides/
node assemble-deck.mjs \
  --project P:/Masterminder/projects/<name>/ \
  --out     P:/Masterminder/projects/<name>/deck.pptx
```

Миксует editable (html2pptx.js) и screenshot (Playwright → addImage) пути. Screenshot-режим — только для слайдов с `font_fidelity: strict` и не-web-safe шрифтами.

### Phase 6 — финальная визуальная верификация

Несмотря на vision-loop — **обязательно** прогоняй золотое правило (см. ниже) на финальном `.pptx`:
1. Экспортируй все слайды в PNG через `temp/verify-slides.py` (PowerPoint COM)
2. Прочитай **каждый** PNG через Read tool по одному
3. Отчёт C/M/R по каждому, сводная таблица
4. Если хотя бы один FAIL — итерируй

vision-loop валидировал HTML в браузере; здесь проверяем, что html2pptx/screenshot-export не внёс искажений.

---

## ═══════════════════════════════════════════
## LOCAL ENGINE (python-pptx + design system) — legacy
## ═══════════════════════════════════════════

---

## ЗОЛОТОЕ ПРАВИЛО: визуальная верификация

**НИКОГДА не показывай и не отдавай пользователю визуальный результат (превью, PPTX, скриншот слайда), не проверив КАЖДЫЙ слайд своими глазами через Read tool.**

Порядок:
1. Сгенерировал/изменил PPTX → экспортировал ВСЕ слайды в PNG → прочитал КАЖДЫЙ PNG через Read tool **по одному**
2. Для КАЖДОГО слайда вывел полный отчёт в фиксированном формате (C1–C5, M1–M3, вердикт)
3. Вывел сводную таблицу. Если есть хотя бы один FAIL → исправил → повторил ВЕСЬ цикл
4. Только когда ВСЕ слайды PASS → показал пользователю

**Это правило без исключений.** Ни превью шаблонов, ни финальная презентация, ни промежуточный результат — ничего не уходит к пользователю без полного поштучного отчёта.

**ЗАПРЕЩЕНО:**
- Ставить "PASS (минорное...)" — либо PASS, либо FAIL
- Пропускать слайды ("слайды 9-12 выглядят нормально")
- Группировать слайды ("слайды 1-4 PASS") — КАЖДЫЙ отдельно
- Показывать результат до завершения полного QA-цикла

---

## При загрузке ОБЯЗАТЕЛЬНО прочитай

1. `references/design-system.json` — все токены: типографика, цвета, сетка, координаты слайдов
2. `references/style-presets.md` — 15 палитр с 8 семантическими ролями каждая
3. `references/visual-types.md` — 14 типов слайдов с точными координатами
4. `references/template-library.md` — 7 проаудированных шаблонов с layout maps
5. `references/slide-qa-criteria.md` — критерии визуальной проверки слайдов
6. Референсный генератор — код v3 описан ниже в разделе «Фаза 5»

---

## Входные данные (от оркестратора)

- Контент слайдов (из mastermind-slides): заголовки, тексты, visual types, talking points
- Собранные ассеты (фото автора, QR-код, скриншоты — как файлы)
- Тема/настроение проекта (для выбора шаблона и пресета)

---

## Design System Integration

### Загрузка и маппинг

```python
import json
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor

# Загрузка дизайн-системы
with open('~/.claude/skills/mastermind-pptx/references/design-system.json', encoding='utf-8') as f:
    DS = json.load(f)

class T:
    # Типографика из дизайн-системы
    SIZE_TITLE    = Pt(DS['typography']['sizes_pt']['h1_title'])      # 40
    SIZE_H2       = Pt(DS['typography']['sizes_pt']['h2_section'])    # 32
    SIZE_SUBTITLE = Pt(DS['typography']['sizes_pt']['subtitle'])      # 28
    SIZE_BODY     = Pt(DS['typography']['sizes_pt']['body'])          # 24
    SIZE_CAPTION  = Pt(DS['typography']['sizes_pt']['caption'])       # 18
    SIZE_FOOTNOTE = Pt(DS['typography']['sizes_pt']['footnote'])      # 14

    # Отступы из дизайн-системы
    MARGIN_L  = Inches(DS['margins']['left'])           # 0.667
    MARGIN_T  = Inches(DS['margins']['top'])            # 0.375
    CONTENT_W = Inches(DS['margins']['content_width'])  # 12.0

    # Шрифты
    FONT_HEAD = DS['typography']['font_families']['heading']  # Calibri
    FONT_BODY = DS['typography']['font_families']['body']     # Calibri

    # Координаты слайдов из slide_layouts
    LAYOUTS = DS['slide_layouts']
```

### Авто-масштаб под реальный размер шаблона

Каждый шаблон может иметь свои пропорции (10"×5.625", 13.33"×7.5" и др.) — это нормально.
Скрипт читает реальный размер из файла и автоматически масштабирует координаты из design-system.json.

```python
# Реальный размер шаблона
CANVAS_W = prs.slide_width / 914400   # в дюймах
CANVAS_H = prs.slide_height / 914400

# Эталонный размер в design-system.json (13.333" × 7.5")
REF_W = DS['canvas']['width_in']   # 13.333
REF_H = DS['canvas']['height_in']  # 7.5

# Масштаб — вычисляется один раз автоматически
SX = CANVAS_W / REF_W  # например: 10 / 13.333 = 0.75
SY = CANVAS_H / REF_H  # например: 5.625 / 7.5 = 0.75

# Хелпер: применяет масштаб ко всем координатам
def S(inches_value):
    """Scale coordinate from reference canvas to actual template size."""
    return Inches(inches_value * SX)

def SH(inches_value):
    """Scale height coordinate."""
    return Inches(inches_value * SY)

def SP(pt_value):
    """Scale font size proportionally (опционально — обычно не нужно)."""
    return Pt(pt_value * min(SX, SY))
```

### Использование координат из slide_layouts

```python
# Пример: cover слайд — координаты автоматически масштабируются
cover = DS['slide_layouts']['cover']

title_box = slide.shapes.add_textbox(
    S(cover['title']['left']),    # масштабируем X
    SH(cover['title']['top']),    # масштабируем Y
    S(cover['title']['width']),   # масштабируем ширину
    SH(cover['title']['height'])  # масштабируем высоту
)
tf = title_box.text_frame
tf.text = slide_data['title']
p = tf.paragraphs[0]
p.font.size = Pt(cover['title']['font_pt'])  # шрифт — не масштабируем
p.font.bold = cover['title']['bold']
```

**Правило:** координаты масштабируем через `S()` / `SH()`, шрифты — оставляем как есть из JSON (размер шрифта не зависит от размера слайда).

### Пресет → class T (цвета)

```python
# Выбранный пресет определяет 8 ролей, остальное — из JSON
PRESET = {
    'background':       RGBColor(0x1E, 0x27, 0x61),
    'surface_elevated': RGBColor(0x0D, 0x1B, 0x3E),
    'text_primary':     RGBColor(0xFF, 0xFF, 0xFF),
    'text_secondary':   RGBColor(0xCA, 0xDC, 0xFC),
    'accent_primary':   RGBColor(0x4A, 0x90, 0xD9),
    'accent_secondary': RGBColor(0xE8, 0xC5, 0x47),
    'border':           RGBColor(0x2E, 0x3A, 0x7A),
    'data_muted':       RGBColor(0x4A, 0x50, 0x75),
}
# Обновляем T:
T.BG = PRESET['background']
T.SURFACE = PRESET['surface_elevated']
T.TEXT = PRESET['text_primary']
T.TEXT2 = PRESET['text_secondary']
T.ACCENT = PRESET['accent_primary']
T.ACCENT2 = PRESET['accent_secondary']
T.BORDER = PRESET['border']
T.DATA_MUTED = PRESET['data_muted']
```

---

## Template Library

Шаблоны хранятся в `temp/templates/`. Данные по каждому — в `references/template-library.md`.

### Как выбрать шаблон

| Проект | Шаблон | Почему |
|--------|--------|--------|
| Технический / IT | Mercutio, Technology Pixels | Bold, tech-настроение |
| Бизнес-аналитика | Antonio, Salerio | Чистый корпоративный вид |
| Элегантная тема | Laertes | Тёмный премиум |
| Стартап-питч | Mercutio | Энергичный, контрастный |
| Исследовательский | Antonio | Минимализм, читаемость |
| Текущий рабочий | Technology Pixels | `temp/template.pptx` |

### Как читать audit data шаблона

В `template-library.md` для каждого шаблона есть:
- **Layout Map** — индексы макетов и idx их плейсхолдеров
- **Theme colors** — hex-цвета из XML
- **Предупреждения** — SmartArt, нестандартный idx, Canva XML

### 5 подводных камней сторонних шаблонов

1. **SmartArt** — полная несовместимость с python-pptx. Layout с SmartArt — не использовать.
2. **Нестандартные idx** — 10, 11, 12+ вместо стандартных 0-5. Всегда проверять перед использованием.
3. **"Грязный" XML** из Canva/Google Slides — ошибки при манипуляции. Осторожно с Google-экспортами.
4. **Декоративные фигуры перекрывают контент** — добавлять свои элементы только поверх.
5. **Тематические цвета** недоступны через API — нужен XML workaround через `audit-template.py`.

---

## Фазовый workflow (7 фаз)

### Фаза 0: Превью шаблонов (ОБЯЗАТЕЛЬНО перед генерацией)

**Цель:** Показать пользователю 3 варианта шаблона с реальными скриншотами КОНТЕНТНОГО слайда
(не титульного!), чтобы он выбрал. Пользователю важно видеть, как будет выглядеть основной
слайд с заголовком и буллетами — не обложка.

**Источник истины для layout indices:** `references/template-library.md` → Layout Map каждого шаблона.
Скрипт `temp/preview-templates.py` содержит словарь `CONTENT_LAYOUT` — он ДОЛЖЕН совпадать с audit данными.
Если добавляешь новый шаблон — сначала `python temp/audit-template.py`, потом обнови оба файла.

**Шаги:**

1. На основе темы/настроения проекта выбери 3 наиболее подходящих шаблона из `references/template-library.md`
2. Запусти скрипт генерации превью:
   ```bash
   python temp/preview-templates.py <шаблон1> <шаблон2> <шаблон3> --title "<реальный заголовок презентации>" --subtitle "<подзаголовок>"
   ```
3. **ВИЗУАЛЬНЫЙ QA ПРЕВЬЮ (ОБЯЗАТЕЛЬНО перед показом пользователю):**
   - Прочитай КАЖДЫЙ PNG через Read tool и проверь по критериям из `references/slide-qa-criteria.md`:
     - **C1 Safe Zone:** текст/контент не перекрывается декоративными элементами шаблона
     - **C2 Text Readability:** текст читаемый, достаточный контраст, нет наложений
     - **C3 Content Visibility:** весь контент виден, ничего не обрезано
   - Если превью НЕ проходит QA — **НЕ показывай пользователю**. Замени шаблон на другой из библиотеки, перегенерируй, проверь снова.
   - Пользователю показывай ТОЛЬКО прошедшие QA превью (минимум 3).

4. Покажи прошедшие QA превью пользователю В ЧАТЕ (не через AskUserQuestion).
   Перед каждым Read tool напиши ЗАМЕТНЫЙ заголовок. После всех трёх — крупную инструкцию:

   ```
   ## Вариант 1: [название]
   [Read PNG]

   ## Вариант 2: [название]
   [Read PNG]

   ## Вариант 3: [название]
   [Read PNG]

   ---
   **👆 Скриншоты выше — нажми на каждый блок Read, чтобы развернуть и увидеть картинку.**
   **Напиши номер или название шаблона, который нравится.**
   ```

   **ВАЖНО:**
   - НЕ используй AskUserQuestion для выбора шаблона — пользователь должен УВИДЕТЬ картинки.
   - Скриншоты показывают КОНТЕНТНЫЙ слайд (заголовок + буллеты), не титульный.
   - После показа скриншотов — ЖИРНАЯ инструкция, что их нужно развернуть для просмотра.
5. Дождись текстового ответа пользователя и продолжи с выбранным шаблоном.

**Как выбрать 3 шаблона:**

| Тема проекта | Рекомендуемые 3 шаблона |
|---|---|
| Технический / IT | modern-business, mercutio, technology-pixels |
| Бизнес / аналитика | modern-business, antonio, salerio |
| Креативный / дизайн | hendrix, laertes, mercutio |
| Исследование / данные | modern-business, antonio, technology-pixels |
| Стартап / MVP | mercutio, modern-business, hendrix |
| Универсальный | modern-business, hendrix, salerio |

**Файлы превью:** `temp/template-previews/*.png`

### Фаза 1: Исследование выбранного шаблона

1. Проверить audit данные выбранного шаблона — layout map, предупреждения
2. Если шаблон не скачан: `temp/templates/README.md` содержит ссылки
3. После скачивания: `python temp/audit-template.py temp/templates/<name>.pptx`
4. Обновить `template-library.md` с результатами аудита

### Фаза 2: Детальное исследование шаблона

Используй аудит данные из `template-library.md`. Если нужно обновить:

```bash
python temp/audit-template.py temp/templates/<name>.pptx
```

Критически важно знать:
- Какой layout index у TITLE, BLANK, TITLE_AND_BODY, TITLE_ONLY
- Какие idx у плейсхолдеров (стандарт: 0=TITLE, 1=BODY, но бывает иначе)
- Есть ли SmartArt-layouts (их нельзя использовать)
- Размер слайда (стандарт 13.33" × 7.5", бывает нестандартный)

### Фаза 3: Загрузка дизайн-системы

```python
# Всегда в начале скрипта
with open('~/.claude/skills/mastermind-pptx/references/design-system.json', encoding='utf-8') as f:
    DS = json.load(f)
```

**Инициализировать class T из DS** (см. раздел Design System Integration выше).

Если шаблон нестандартного размера — применить scale-коэффициент:
```python
SCALE_X = prs.slide_width / (DS['canvas']['width_emu'])   # для нестандартных шаблонов
SCALE_Y = prs.slide_height / (DS['canvas']['height_emu'])
# Пример: template.pptx = 10" × 5.625" → SCALE = 0.75 по обоим осям
```

### Фаза 4: Маппинг visual types → layouts

| Visual type | Layout шаблона | Примечание |
|-------------|---------------|-----------|
| cover | TITLE_1 или TITLE | CENTER_TITLE + SUBTITLE |
| section_divider | BLANK или CENTERED_TEXT | Всё ручное |
| agenda | TITLE_AND_BODY | Через placeholder |
| content_text_media | TITLE_AND_TWO_COLUMNS | Два BODY placeholder |
| bullets | TITLE_AND_BODY | Через placeholder |
| data_chart | TITLE_ONLY | Chart area ручной |
| quote | BLANK | Всё ручное |
| team | TITLE_ONLY | Grid ручной |
| timeline | TITLE_ONLY или BLANK | Line + nodes ручные |
| comparison | TITLE_AND_TWO_COLUMNS | Два BODY placeholder |
| closing | BLANK или TITLE_ONLY | Всё ручное |
| big_number | BIG_NUMBER или BLANK | Textbox ручной |
| cards | TITLE_ONLY или BLANK | ROUNDED_RECTANGLE |
| process | TITLE_ONLY или BLANK | Arrows ручные |

**Правила разнообразия:**
- Максимум 3 слайда одного типа
- Минимум 4 разных типа
- Не два одинаковых типа подряд
- Чередовать плотные и воздушные

### Фаза 5: Генерация Python-скрипта

Создай `_temp/generate-pptx.py` со структурой v4:

```python
import json
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

# 1. DESIGN SYSTEM — все токены из JSON
with open('~/.claude/skills/mastermind-pptx/references/design-system.json', encoding='utf-8') as f:
    DS = json.load(f)

# 2. ПРЕСЕТ (адаптировать к конкретной презентации)
PRESET = {
    'background':       RGBColor(...),
    'surface_elevated': RGBColor(...),
    'text_primary':     RGBColor(...),
    'text_secondary':   RGBColor(...),
    'accent_primary':   RGBColor(...),
    'accent_secondary': RGBColor(...),
    'border':           RGBColor(...),
    'data_muted':       RGBColor(0xBF, 0xBF, 0xBF),
}

# 3. DESIGN TOKENS — из DS + пресет
class T:
    SIZE_TITLE    = Pt(DS['typography']['sizes_pt']['h1_title'])
    SIZE_H2       = Pt(DS['typography']['sizes_pt']['h2_section'])
    SIZE_BODY     = Pt(DS['typography']['sizes_pt']['body'])
    SIZE_CAPTION  = Pt(DS['typography']['sizes_pt']['caption'])
    MARGIN_L      = Inches(DS['margins']['left'])
    CONTENT_W     = Inches(DS['margins']['content_width'])
    FONT_HEAD     = DS['typography']['font_families']['heading']
    LAYOUTS       = DS['slide_layouts']
    BG            = PRESET['background']
    TEXT          = PRESET['text_primary']
    TEXT2         = PRESET['text_secondary']
    ACCENT        = PRESET['accent_primary']
    ACCENT2       = PRESET['accent_secondary']
    DATA_MUTED    = PRESET['data_muted']

# 4. ПУТИ
TEMPLATE_PATH = '_temp/template.pptx'
OUTPUT_PATH   = 'projects/<name>/<Name>-Research-Wednesday.pptx'

# 5. LAYOUT INDICES (из audit данных шаблона)
LY = {
    'title': 1,
    'title_body': 3,
    'two_col': 4,
    'title_only': 6,
    'blank': 7,
    'centered': 8,
    'big_number': 9,
}

# 6. HELPERS
def remove_all_slides(prs): ...
def add_textbox(slide, left, top, width, height, text, size, bold=False, color=None, align=PP_ALIGN.LEFT): ...
def add_bullets(slide, items, left, top, width, height, size, color=None): ...
def add_notes(slide, text): ...
def set_lang_ru(run): run.font._element.set(qn('a:lang'), 'ru-RU')

# 7. SLIDE BUILDERS — по одной функции на слайд
def build_slide_01_cover(prs): ...
def build_slide_02_agenda(prs): ...
# ...

# 8. MAIN
def main():
    prs = Presentation(TEMPLATE_PATH)
    remove_all_slides(prs)
    builders = [
        build_slide_01_cover,
        build_slide_02_agenda,
        # ...
    ]
    for builder in builders:
        builder(prs)
    prs.save(OUTPUT_PATH)
    print(f"Saved: {OUTPUT_PATH}")

if __name__ == '__main__':
    main()
```

### Фаза 6: Запуск и расширенный QA

```bash
cd _temp && python generate-pptx.py
```

**Визуальный QA каждого слайда (ОБЯЗАТЕЛЬНО):**

1. Экспортируй все слайды в PNG:
   ```bash
   python temp/verify-slides.py <путь-к-pptx> --output temp/qa-png/<project>
   ```
2. Прочитай КАЖДЫЙ PNG через Read tool и проверь по критериям `references/slide-qa-criteria.md`
3. Критические проблемы (C1-C3) — исправить в скрипте генерации и перегенерировать
4. Major проблемы (M1-M4) — исправить до показа пользователю
5. Повторять цикл генерация → экспорт → проверка, пока ВСЕ слайды не пройдут QA
6. **НИКОГДА не показывать и не отдавать пользователю PPTX без визуальной проверки всех слайдов**

**Базовый QA:**
- [ ] Все N слайдов сгенерированы
- [ ] Нет плейсхолдеров ([...], @username, TODO)
- [ ] Speaker notes на каждом слайде (7-12 предложений)
- [ ] Разнообразие visual types (min 4 разных, max 3 одного)
- [ ] Нет двух одинаковых layouts подряд
- [ ] Изображения вставлены (фото, QR)
- [ ] Авто-нумерация работает

**Расширенный QA (v4 — из дизайн-исследований):**
- [ ] **Контрастность** текст/фон ≥ 4.5:1 (WCAG AA), цель ≥ 7:1 для проекции
- [ ] **Whitespace** ≥ 40% на каждом слайде
- [ ] **Max 4 цвета** на слайд (не считая чёрный/белый текст)
- [ ] **Max 40 слов** body на слайд
- [ ] **Max 6 буллетов**, ≤8 слов каждый
- [ ] **Action titles** — предложения-выводы, не ярлыки-темы (McKinsey style)
- [ ] **Размеры шрифтов** из DS['typography']['sizes_pt'] (не кастомные)
- [ ] **Координаты** из DS['slide_layouts'] (не на глаз)
- [ ] **Правило 60-30-10** соблюдено
- [ ] **Стратегия "серый + акцент"** для данных (data_muted + accent_primary)
- [ ] **Текст ≥ 18pt** (min для проекции)

---

## Обязательные правила

### Текст
- **Переносы строк:** split по `\n`, каждая строка — отдельный paragraph
- **Кириллица:** `lang: 'ru-RU'` через `run.font._element.set(qn('a:lang'), 'ru-RU')`
- **word_wrap = True** всегда
- **НИКОГДА не сокращай слова**: "Воспроизводимость", не "Воспроизв."
- Если текст не помещается — перефразируй или разбей на 2 слайда

### Правила McKinsey для Action Titles

Заголовок слайда — **предложение-вывод**, не тема-ярлык.

❌ "Анализ затрат"
✅ "Затраты выросли вдвое за 3 года — автоматизация экономит 80%"

❌ "Результаты"
✅ "7 из 10 проектов прошли верификацию с первого раза"

**Read-Through Test:** заголовки слайдов 1→N = связный нарратив. Не "Проблема → Решение → Результаты", а полные предложения с выводами.

### Стратегия "серый + акцент" (Nussbaumer Knaflic)

Для всех данных, графиков, диаграмм:
- Все элементы по умолчанию → `T.DATA_MUTED` (#BFBFBF)
- Один-два ключевых элемента → `T.ACCENT` ("посмотри сюда")
- Никакой радуги. Никаких всех баров разного цвета.

### Контрастность WCAG

Формула: `(L1 + 0.05) / (L2 + 0.05)`, где L = relative luminance
- **4.5:1** — минимум для обычного текста (WCAG AA)
- **3.0:1** — минимум для крупного текста (≥18pt)
- **7.0:1** — цель для проекции (контраст деградирует ~30%)
- Типичная ловушка: серый #808080 на белом = 3.9:1 → не проходит WCAG AA

### Изображения

```python
from pptx.util import Inches
slide.shapes.add_picture(
    'photo.png',
    left=Inches(7.0), top=Inches(1.5),
    width=Inches(2.5), height=Inches(2.5)
)
```
- Форматы: PNG, JPG, GIF, BMP, TIFF
- python-pptx работает с файлами напрямую (не нужен base64)

### Speaker Notes

```python
notes_slide = slide.notes_slide
tf = notes_slide.notes_text_frame
tf.text = "ГОВОРИТЬ:\n[7-12 предложений разговорным тоном]...\n\nПЕРЕХОД: ...\n\nВРЕМЯ: ~N мин"
```

### Авто-нумерация страниц

- Шаблон содержит `slidenum` field в layouts (обычно idx=12)
- Наследуется автоматически при создании слайда через layout
- Показывает просто номер (не "X из Y")
- На cover-слайдах — обычно не нужен (layout без sldNum)

---

## Удаление существующих слайдов из шаблона

```python
from pptx.oxml.ns import qn

def remove_all_slides(prs):
    while len(prs.slides._sldIdLst) > 0:
        rId = prs.slides._sldIdLst[0].get(qn('r:id'))
        prs.part.drop_rel(rId)
        del prs.slides._sldIdLst[0]
```

---

## Файловая организация

```
~/.claude/skills/mastermind-pptx/       ← скилл (устанавливается один раз)
├── SKILL.md
├── references/
│   ├── design-system.json     ← центральный дизайн-конфиг
│   ├── style-presets.md       ← 15 палитр с 8 цветовыми ролями
│   ├── visual-types.md        ← 14 типов слайдов с координатами
│   └── template-library.md   ← 7 шаблонов с audit data
└── tools/
    └── install-gamma-fonts.py ← установщик веб-шрифтов

[cwd]/                                  ← рабочая директория Claude Code
├── projects/[название]/
│   ├── концепция.md
│   ├── слайды.md
│   ├── шпаргалка-спикера.md
│   └── [Название]-Research-Wednesday.pptx
└── _temp/
    ├── generate-pptx.py       ← генератор (создаётся автоматически)
    └── template.pptx          ← шаблон
```

---

## НИКАКИХ ПЛЕЙСХОЛДЕРОВ

В финальном файле НЕ ДОЛЖНО БЫТЬ:
- `[Вставьте фото]`, `[Insert image]`
- `@username`, `[контакт]`
- `TODO`, `TBD`, `placeholder`
- Пустых слайдов

Если данные недоступны — спроси ДО генерации.

---

## Анти-AI-слоп (запрещено)

- Фиолетовый градиент на белом фоне
- Все цвета одной яркости (нет доминанты)
- Одинаковый layout на всех слайдах
- Центрирование ВСЕГО текста (только заголовки, body — LEFT)
- Акцентные линии ПОД заголовками — признак AI-шаблонного слайда
- Радуга данных (все бары разного цвета без смысла)
- Больше 4 цветов на одном слайде
- Пафосные формулировки: "революционный", "на стероидах"
- Сокращения: "Воспроизв.", "проф."
