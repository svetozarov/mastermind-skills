"""
Mastermind Deck — Слой 1: Извлечение дизайн-системы из визуальных референсов.

Реализует 7-шаговый пайплайн:
  1. Нормализация входа (PDF → PNG, PPTX → PDF → PNG, PNG/JPG as-is, URL TODO)
  2. Canonical values из текста (pdfplumber: hex/rgb/cmyk, шрифты)
  3. Color Thief на кластеризованных скриншотах (sklearn k-means)
  4. Claude Vision со staged промптом (Anthropic API)
  5. Web-safe fallback для шрифтов (из references/fallback-fonts.json)
  6. Merge всех источников → tokens.json (W3C DTCG 2025.10)
  7. Style Dictionary → tailwind.config.js + globals.css

CLI:
  python extract-style.py --refs <folder> --out <tokens.json> [--brief <yaml>]
"""

from __future__ import annotations

import argparse
import base64
import json
import logging
import os
import re
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path
from typing import Any, Optional

import yaml

# ---------------------------------------------------------------------------
# Логирование
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("extract-style")


# ---------------------------------------------------------------------------
# Вспомогательные функции проверки зависимостей
# ---------------------------------------------------------------------------

def _import_optional(module_name: str, pip_name: str | None = None) -> Any:
    """
    Пытается импортировать необязательную зависимость.
    Возвращает модуль или None с предупреждением, если пакет отсутствует.
    """
    import importlib
    try:
        return importlib.import_module(module_name)
    except ImportError:
        install_name = pip_name or module_name
        logger.warning(
            "Зависимость '%s' не установлена. Шаг будет пропущен. "
            "Установите: pip install %s",
            module_name, install_name,
        )
        return None


# ---------------------------------------------------------------------------
# Шаг 1: Нормализация входа
# ---------------------------------------------------------------------------

def normalize_inputs(refs_dir: Path, out_dir: Path) -> list[Path]:
    """
    Нормализует все файлы из refs_dir в PNG-изображения и сохраняет в out_dir.

    Поддерживаемые форматы:
      - *.pdf   → pdf2image (200 DPI PNG)
      - *.pptx  → soffice --headless --convert-to pdf → pdf2image
      - *.png, *.jpg, *.jpeg → копируются as-is
      - URL (*.txt с одним URL) → TODO-hook (не реализован)

    Возвращает список Path к нормализованным PNG-файлам.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    png_files: list[Path] = []

    # Попытка импортировать pdf2image
    pdf2image = _import_optional("pdf2image", "pdf2image")

    for f in sorted(refs_dir.iterdir()):
        if f.name.startswith("_") or f.name.startswith("."):
            # Пропускаем служебные папки/файлы
            continue

        suffix = f.suffix.lower()

        if suffix in (".png", ".jpg", ".jpeg"):
            # PNG/JPG: копируем as-is
            dst = out_dir / f.name
            if not dst.exists():
                import shutil
                shutil.copy2(f, dst)
            png_files.append(dst)
            logger.info("Нормализован (as-is): %s", f.name)

        elif suffix == ".pdf":
            # PDF: конвертируем в PNG через pdf2image
            if pdf2image is None:
                logger.warning("pdf2image недоступен, пропускаем %s", f.name)
                continue
            pages = pdf2image.convert_from_path(str(f), dpi=200)
            for i, page in enumerate(pages):
                dst = out_dir / f"{f.stem}_page{i+1:03d}.png"
                if not dst.exists():
                    page.save(str(dst), "PNG")
                png_files.append(dst)
            logger.info("PDF → %d PNG: %s", len(pages), f.name)

        elif suffix == ".pptx":
            # PPTX: soffice → pdf → pdf2image
            pptx_pngs = _convert_pptx_to_pngs(f, out_dir, pdf2image)
            png_files.extend(pptx_pngs)

        elif suffix == ".txt":
            # Проверяем, не является ли файл URL-листом
            content = f.read_text(encoding="utf-8").strip()
            if content.startswith("http://") or content.startswith("https://"):
                logger.warning(
                    "URL-файл обнаружен: %s. "
                    "Playwright-захват не реализован в этой версии (TODO-hook). "
                    "Интерфейс: normalize_url(url: str, out_dir: Path) -> list[Path]",
                    f.name,
                )
            # Иначе — обычный текстовый файл, игнорируем

    logger.info("Нормализация завершена: %d PNG-файлов", len(png_files))
    return png_files


def _convert_pptx_to_pngs(pptx_path: Path, out_dir: Path, pdf2image: Any) -> list[Path]:
    """
    Конвертирует PPTX в PNG через LibreOffice (soffice) + pdf2image.
    Возвращает список путей к PNG.
    """
    if pdf2image is None:
        logger.warning("pdf2image недоступен, пропускаем PPTX: %s", pptx_path.name)
        return []

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        # soffice: PPTX → PDF
        result = subprocess.run(
            [
                "soffice", "--headless",
                "--convert-to", "pdf",
                "--outdir", str(tmp_path),
                str(pptx_path),
            ],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            logger.error(
                "soffice завершился с ошибкой для %s: %s",
                pptx_path.name, result.stderr[:500],
            )
            return []

        pdf_files = list(tmp_path.glob("*.pdf"))
        if not pdf_files:
            logger.error("soffice не создал PDF для %s", pptx_path.name)
            return []

        pdf_path = pdf_files[0]
        pages = pdf2image.convert_from_path(str(pdf_path), dpi=150)
        png_files: list[Path] = []
        for i, page in enumerate(pages):
            dst = out_dir / f"{pptx_path.stem}_slide{i+1:03d}.png"
            if not dst.exists():
                page.save(str(dst), "PNG")
            png_files.append(dst)

    logger.info("PPTX → %d PNG: %s", len(png_files), pptx_path.name)
    return png_files


# ---------------------------------------------------------------------------
# TODO-hook: URL → Playwright
# ---------------------------------------------------------------------------
# Интерфейс для будущей реализации через Playwright MCP или Playwright Python:
#
# def normalize_url(url: str, out_dir: Path, viewport_width: int = 1920, viewport_height: int = 1080) -> list[Path]:
#     """
#     Делает скриншот URL через Playwright headless Chromium.
#     Также пытается извлечь CSS custom properties как дополнительный источник токенов.
#
#     Параметры:
#       url           — адрес страницы
#       out_dir       — куда сохранить скриншот
#       viewport_width, viewport_height — размер viewport для скриншота
#
#     Возвращает список путей к PNG (обычно 1 скриншот, возможно несколько при пагинации).
#
#     Зависимости: pip install playwright && playwright install chromium
#     """
#     raise NotImplementedError("TODO: реализовать через playwright.sync_api")
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Шаг 2: Canonical values из текстового дампа PDF
# ---------------------------------------------------------------------------

# Регулярные выражения для поиска цветов в тексте
_RE_HEX   = re.compile(r"#([A-Fa-f0-9]{6})\b")
_RE_RGB   = re.compile(r"rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)")
_RE_CMYK  = re.compile(r"cmyk\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)", re.IGNORECASE)
_RE_PANT  = re.compile(r"PANTONE\s+[\w\s-]+", re.IGNORECASE)


def extract_canonical_from_pdfs(refs_dir: Path) -> dict[str, Any]:
    """
    Извлекает canonical values из PDF-файлов через pdfplumber:
      - hex/rgb/cmyk/pantone цвета из текста
      - топ-3 шрифта по частоте (fontname, size)

    Возвращает словарь для сохранения в _text_canonical.json.
    """
    pdfplumber = _import_optional("pdfplumber")
    if pdfplumber is None:
        return {}

    colors_found: list[str] = []
    font_counter: Counter = Counter()

    for pdf_path in sorted(refs_dir.glob("*.pdf")):
        logger.info("pdfplumber: анализ %s", pdf_path.name)
        try:
            with pdfplumber.open(str(pdf_path)) as pdf:
                for page in pdf.pages:
                    # Текстовый дамп для поиска цветов
                    text = page.extract_text() or ""
                    colors_found.extend(_RE_HEX.findall(text))
                    for m in _RE_RGB.finditer(text):
                        r, g, b = int(m.group(1)), int(m.group(2)), int(m.group(3))
                        colors_found.append(f"#{r:02X}{g:02X}{b:02X}")
                    for m in _RE_CMYK.finditer(text):
                        c, y, m_val, k = (float(m.group(i)) for i in range(1, 5))
                        r = int(255 * (1 - c) * (1 - k))
                        g = int(255 * (1 - y) * (1 - k))
                        b = int(255 * (1 - m_val) * (1 - k))
                        colors_found.append(f"#{r:02X}{g:02X}{b:02X}")

                    # Шрифты из символьного дампа
                    for char in (page.chars or []):
                        fname = char.get("fontname", "")
                        size  = round(float(char.get("size", 0)), 1)
                        if fname and size > 0:
                            font_counter[(fname, size)] += 1

                    # NCS-цвета из атрибутов символов (если доступны)
                    for char in (page.chars or []):
                        ncs = char.get("ncs", "")
                        if ncs and ncs.startswith("#"):
                            colors_found.append(ncs.upper()[:7])

        except Exception as exc:
            logger.error("pdfplumber: ошибка при чтении %s: %s", pdf_path.name, exc)

    # Топ-3 шрифта по частоте упоминаний
    top_fonts = [
        {"fontname": fn, "size": sz, "count": cnt}
        for (fn, sz), cnt in font_counter.most_common(3)
    ]

    # Уникальные цвета с частотой
    color_counter = Counter(c.upper() for c in colors_found if c)
    canonical_colors = [
        {"hex": "#" + h if not h.startswith("#") else h, "count": cnt}
        for h, cnt in color_counter.most_common(20)
    ]
    # Убираем лишний # если уже есть
    for entry in canonical_colors:
        entry["hex"] = "#" + entry["hex"].lstrip("#")

    result = {
        "source": "pdfplumber",
        "colors": canonical_colors,
        "fonts": top_fonts,
    }

    # Сохраняем в refs_dir/_text_canonical.json
    canonical_path = refs_dir / "_text_canonical.json"
    canonical_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("Canonical values записаны: %s", canonical_path)
    return result


# ---------------------------------------------------------------------------
# Шаг 3: Color Thief на кластеризованных скриншотах
# ---------------------------------------------------------------------------

def extract_colors_colorthief(png_files: list[Path], refs_dir: Path) -> dict[str, Any]:
    """
    Применяет ColorThief на кластеризованных скриншотах:
      - k-means кластеризация PNG (low-res thumbnails) через sklearn
      - Берём по 1 представителю от каждого кластера (max 5)
      - Для каждого: getPalette (6 цветов) + per-crop zones
      - Агрегируем: цвета в ≥2 скриншотах → system-level, иначе → accent

    Возвращает словарь для _colors_extracted.json.
    """
    colorthief_mod = _import_optional("colorthief", "colorthief")
    pil_mod        = _import_optional("PIL", "Pillow")
    sklearn_mod    = _import_optional("sklearn.cluster", "scikit-learn")

    if not all([colorthief_mod, pil_mod, sklearn_mod]):
        logger.warning("Color Thief: пропускаем шаг 3 — недостаточно зависимостей")
        return {}

    from PIL import Image
    from sklearn.cluster import KMeans
    import numpy as np

    if len(png_files) < 1:
        logger.warning("Color Thief: нет PNG-файлов для анализа")
        return {}

    # Создаём low-res thumbnails для кластеризации (64×36 px)
    thumb_size = (64, 36)
    thumbnails: list[np.ndarray] = []
    valid_files: list[Path] = []

    for f in png_files:
        try:
            img = Image.open(f).convert("RGB").resize(thumb_size, Image.LANCZOS)
            thumbnails.append(np.array(img).flatten().astype(float) / 255.0)
            valid_files.append(f)
        except Exception as exc:
            logger.warning("Не удалось открыть %s: %s", f.name, exc)

    if not thumbnails:
        return {}

    # k-means кластеризация: определяем оптимальное k (max 5)
    n_clusters = min(5, len(thumbnails))
    representatives: list[Path] = []

    if n_clusters <= 1:
        representatives = valid_files[:1]
    else:
        X = np.array(thumbnails)
        km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = km.fit_predict(X)
        # Выбираем ближайший к центру кластера файл как представителя
        for cluster_id in range(n_clusters):
            indices = [i for i, lbl in enumerate(labels) if lbl == cluster_id]
            if not indices:
                continue
            center = km.cluster_centers_[cluster_id]
            dists = [np.linalg.norm(X[i] - center) for i in indices]
            best_idx = indices[int(np.argmin(dists))]
            representatives.append(valid_files[best_idx])

    logger.info("Color Thief: %d представителей кластеров", len(representatives))

    # Извлекаем палитры через ColorThief
    color_occurrences: dict[str, int] = Counter()
    per_file_palettes: list[dict[str, Any]] = []

    for rep in representatives:
        try:
            ct = colorthief_mod.ColorThief(str(rep))
            palette_rgb = ct.get_palette(color_count=6, quality=1)
            palette_hex = [f"#{r:02X}{g:02X}{b:02X}" for r, g, b in palette_rgb]

            # Crop-зоны: заголовок (верхние 30%), акцент (правые 20%), фон (верхний левый угол)
            img = Image.open(rep).convert("RGB")
            w, h = img.size
            zones = {
                "title": img.crop((0, 0, w, int(h * 0.30))),
                "accent": img.crop((int(w * 0.80), 0, w, h)),
                "background": img.crop((0, 0, int(w * 0.20), int(h * 0.20))),
            }
            zone_colors: dict[str, str] = {}
            for zone_name, zone_img in zones.items():
                with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
                    zone_img.save(tmp.name)
                    try:
                        zone_ct = colorthief_mod.ColorThief(tmp.name)
                        dominant = zone_ct.get_color(quality=1)
                        zone_colors[zone_name] = f"#{dominant[0]:02X}{dominant[1]:02X}{dominant[2]:02X}"
                    finally:
                        os.unlink(tmp.name)

            per_file_palettes.append({
                "file": rep.name,
                "palette": palette_hex,
                "zones": zone_colors,
            })

            for hex_color in palette_hex:
                color_occurrences[hex_color] += 1

        except Exception as exc:
            logger.error("ColorThief: ошибка для %s: %s", rep.name, exc)

    # Агрегируем: ≥2 вхождений → system-level; =1 → accent/decorative
    system_colors = [c for c, cnt in color_occurrences.items() if cnt >= 2]
    accent_colors  = [c for c, cnt in color_occurrences.items() if cnt == 1]

    result = {
        "source": "colorthief",
        "representatives": [f.name for f in representatives],
        "system_level_colors": system_colors,
        "accent_decorative_colors": accent_colors,
        "per_file_palettes": per_file_palettes,
    }

    out_path = refs_dir / "_colors_extracted.json"
    out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("Color Thief: %d системных, %d акцентных цветов → %s", len(system_colors), len(accent_colors), out_path)
    return result


# ---------------------------------------------------------------------------
# Шаг 4: Claude Vision со staged промптом
# ---------------------------------------------------------------------------

def extract_via_vision(
    png_files: list[Path],
    prompt_path: Path,
    api_key: str | None = None,
) -> dict[str, Any]:
    """
    Отправляет до 5 скриншотов в Claude Vision через Anthropic API.
    Использует staged промпт из prompt_path (style-extractor.md).

    Параметры:
      png_files   — список нормализованных PNG (берём первые 5)
      prompt_path — путь к style-extractor.md (staged промпт)
      api_key     — Anthropic API key (или ANTHROPIC_API_KEY из env)

    Возвращает распарсенный JSON от модели, или пустой dict при ошибке.
    """
    anthropic_mod = _import_optional("anthropic")
    if anthropic_mod is None:
        logger.warning("Vision: модуль anthropic недоступен, пропускаем шаг 4")
        return {}

    resolved_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
    if not resolved_key:
        logger.warning(
            "Vision: ANTHROPIC_API_KEY не задан. "
            "Установите переменную окружения или передайте --api-key. Пропускаем шаг 4."
        )
        return {}

    if not prompt_path.exists():
        logger.error("Vision: промпт-файл не найден: %s", prompt_path)
        return {}

    system_prompt = _parse_vision_prompt(prompt_path)
    selected_files = png_files[:5]

    if len(selected_files) < 3:
        logger.warning(
            "Vision: доступно только %d скриншота (рекомендуется ≥3 для надёжного merge).",
            len(selected_files),
        )

    # Формируем content: текст + изображения (base64)
    content: list[dict[str, Any]] = []
    content.append({
        "type": "text",
        "text": f"I am providing {len(selected_files)} reference screenshot(s). Please analyze them according to the instructions.",
    })

    for png in selected_files:
        with open(png, "rb") as fh:
            img_b64 = base64.standard_b64encode(fh.read()).decode()
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": img_b64,
            },
        })

    content.append({
        "type": "text",
        "text": "Now proceed with STEP 1, then STEP 2, then STEP 3 as instructed. Output only the JSON at STEP 3.",
    })

    client = anthropic_mod.Anthropic(api_key=resolved_key)
    try:
        logger.info("Vision: отправляем %d изображений в Claude Vision...", len(selected_files))
        response = client.messages.create(
            model="claude-sonnet-4-5",
            max_tokens=4096,
            system=system_prompt,
            messages=[{"role": "user", "content": content}],
        )
        raw_text = response.content[0].text if response.content else ""
        vision_json = _extract_json_from_text(raw_text)
        logger.info("Vision: ответ получен, %d символов", len(raw_text))
        return vision_json
    except Exception as exc:
        logger.error("Vision: ошибка API: %s", exc)
        return {}


def _parse_vision_prompt(prompt_path: Path) -> str:
    """
    Читает style-extractor.md и возвращает текст system-промпта.
    Пропускает YAML front-matter и русскоязычные комментарии (строки начинающиеся с '<!--').
    """
    raw = prompt_path.read_text(encoding="utf-8")
    # Убираем YAML front-matter если есть (--- ... ---)
    if raw.startswith("---"):
        parts = raw.split("---", 2)
        if len(parts) >= 3:
            raw = parts[2].strip()
    # Убираем HTML-комментарии
    raw = re.sub(r"<!--.*?-->", "", raw, flags=re.DOTALL).strip()
    return raw


def _extract_json_from_text(text: str) -> dict[str, Any]:
    """
    Извлекает первый валидный JSON-объект из текстового ответа модели.
    Ищет блоки ```json ... ``` или голый { ... }.
    """
    # Сначала ищем markdown-блок с JSON
    md_match = re.search(r"```(?:json)?\s*([\s\S]+?)```", text)
    if md_match:
        candidate = md_match.group(1).strip()
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    # Ищем голый JSON-объект (от первой { до последней })
    start = text.find("{")
    end   = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = text[start:end+1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            pass

    logger.warning("Vision: не удалось распарсить JSON из ответа модели")
    return {}


# ---------------------------------------------------------------------------
# Шаг 5: Web-safe fallback для шрифтов
# ---------------------------------------------------------------------------

def apply_font_fallbacks(
    font_names: list[str],
    fallback_table: dict[str, dict[str, str]],
    font_fidelity: str = "editable",
) -> dict[str, Any]:
    """
    Применяет fallback-таблицу к списку шрифтов.

    Параметры:
      font_names      — список имён шрифтов из источников (canonical + vision)
      fallback_table  — таблица из fallback-fonts.json
      font_fidelity   — "editable" (применять fallback) | "strict" (пометить для screenshot)

    Возвращает словарь:
      {
        "display": "<web-safe семья>",
        "text":    "<web-safe семья>",
        "mono":    "<web-safe семья>",
        "strict_override": ["ИмяШрифта"]  # если font_fidelity == "strict"
      }
    """
    WEB_SAFE = {
        "arial", "helvetica", "times new roman", "georgia",
        "courier new", "verdana", "tahoma", "trebuchet ms", "impact",
    }

    result: dict[str, Any] = {
        "display": "Helvetica, Arial, sans-serif",
        "text":    "Helvetica, Arial, sans-serif",
        "mono":    "Courier New, monospace",
        "strict_override": [],
    }

    for font_name in font_names:
        font_lower = font_name.lower().strip()

        # Если уже web-safe — используем напрямую
        if any(ws in font_lower for ws in WEB_SAFE):
            result["display"] = f"{font_name}, sans-serif"
            result["text"]    = f"{font_name}, sans-serif"
            continue

        # Ищем в fallback-таблице
        matched = False
        for source_font, fallback_map in fallback_table.items():
            if source_font.lower() in font_lower or font_lower in source_font.lower():
                if font_fidelity == "strict":
                    result["strict_override"].append(font_name)
                    logger.info(
                        "Шрифт '%s' помечен для screenshot-режима (font_fidelity: strict)",
                        font_name,
                    )
                result["display"] = fallback_map.get("display", result["display"])
                result["text"]    = fallback_map.get("text", result["text"])
                result["mono"]    = fallback_map.get("mono", result["mono"])
                matched = True
                logger.info(
                    "Fallback: '%s' → display=%s, text=%s",
                    font_name, result["display"], result["text"],
                )
                break

        if not matched:
            logger.warning(
                "Шрифт '%s' не найден в fallback-таблице и не является web-safe. "
                "Используется Helvetica по умолчанию.",
                font_name,
            )

    return result


def load_fallback_table(refs_dir: Path) -> dict[str, dict[str, str]]:
    """Загружает fallback-fonts.json из references/."""
    fallback_path = refs_dir / "fallback-fonts.json"
    if not fallback_path.exists():
        # Ищем рядом со скриптом
        fallback_path = Path(__file__).parent.parent / "references" / "fallback-fonts.json"
    if not fallback_path.exists():
        logger.warning("fallback-fonts.json не найден, используем пустую таблицу")
        return {}
    return json.loads(fallback_path.read_text(encoding="utf-8"))


# ---------------------------------------------------------------------------
# Шаг 6: Merge → tokens.json (W3C DTCG 2025.10)
# ---------------------------------------------------------------------------

def merge_into_tokens(
    canonical: dict[str, Any],
    colors_ct: dict[str, Any],
    vision:    dict[str, Any],
    fonts:     dict[str, Any],
    brief:     dict[str, Any],
) -> dict[str, Any]:
    """
    Мержит все источники в итоговый tokens.json формата W3C DTCG 2025.10.

    Приоритет при конфликтах:
      canonical (pdfplumber) > vision (Claude) > color-thief

    Обязательные секции: color, font, grid, radius, shadow, slide.
    """
    tokens: dict[str, Any] = {
        "$schema": "https://design-tokens.github.io/community-group/format/",
        "$metadata": {
            "generator": "mastermind-deck-tokens extract-style.py",
            "sources": [],
        },
    }

    # --- Цвета ---
    color_tokens: dict[str, Any] = {}

    # Canonical (наивысший приоритет)
    if canonical.get("colors"):
        canonical_hexes = [c["hex"] for c in canonical["colors"][:6]]
        if len(canonical_hexes) >= 1:
            color_tokens["ink"] = {
                "$type": "color",
                "$value": canonical_hexes[0],
                "$rationale": "canonical from pdfplumber text dump",
            }
        if len(canonical_hexes) >= 2:
            color_tokens["paper"] = {
                "$type": "color",
                "$value": canonical_hexes[1],
                "$rationale": "canonical from pdfplumber text dump",
            }
        tokens["$metadata"]["sources"].append("pdfplumber")

    # Vision (если canonical не дал результата или дополняет)
    if vision:
        _merge_vision_colors(color_tokens, vision)
        tokens["$metadata"]["sources"].append("claude-vision")

    # Color Thief (системные цвета как дополнение)
    if colors_ct.get("system_level_colors"):
        sys_colors = colors_ct["system_level_colors"]
        if "ink" not in color_tokens and sys_colors:
            # Берём самый тёмный как ink
            sys_colors_sorted = sorted(sys_colors, key=_luminance)
            color_tokens["ink"] = {
                "$type": "color",
                "$value": sys_colors_sorted[0],
                "$rationale": "darkest system-level color from ColorThief",
            }
        if "paper" not in color_tokens and len(sys_colors) >= 2:
            sys_colors_sorted = sorted(sys_colors, key=_luminance, reverse=True)
            color_tokens["paper"] = {
                "$type": "color",
                "$value": sys_colors_sorted[0],
                "$rationale": "lightest system-level color from ColorThief",
            }
        tokens["$metadata"]["sources"].append("colorthief")

    # Fallback если ни один источник не дал цвета
    if "ink" not in color_tokens:
        color_tokens["ink"] = {
            "$type": "color",
            "$value": "needs verification",
            "$rationale": "no source could determine ink color — verify manually",
        }
    if "paper" not in color_tokens:
        color_tokens["paper"] = {
            "$type": "color",
            "$value": "needs verification",
            "$rationale": "no source could determine paper color — verify manually",
        }

    # Нейтральная шкала (если нет — оставляем заглушку)
    color_tokens["neutral"] = {
        "200": {
            "$type": "color",
            "$value": "needs verification",
            "$rationale": "neutral-200 not extracted; verify against reference",
        },
        "600": {
            "$type": "color",
            "$value": "needs verification",
            "$rationale": "neutral-600 not extracted; verify against reference",
        },
    }
    tokens["color"] = color_tokens

    # --- Шрифты ---
    display_font = fonts.get("display", "Helvetica, Arial, sans-serif")
    text_font    = fonts.get("text",    "Helvetica, Arial, sans-serif")
    mono_font    = fonts.get("mono",    "Courier New, monospace")

    tokens["font"] = {
        "display": {"$type": "fontFamily", "$value": display_font},
        "text":    {"$type": "fontFamily", "$value": text_font},
        "mono":    {"$type": "fontFamily", "$value": mono_font},
        "size": {
            "hero":    {"$type": "dimension", "$value": {"value": 120, "unit": "px"}},
            "h1":      {"$type": "dimension", "$value": {"value": 56,  "unit": "px"}},
            "h2":      {"$type": "dimension", "$value": {"value": 40,  "unit": "px"}},
            "body":    {"$type": "dimension", "$value": {"value": 20,  "unit": "px"}},
            "caption": {"$type": "dimension", "$value": {"value": 14,  "unit": "px"}},
            "micro":   {"$type": "dimension", "$value": {"value": 11,  "unit": "px"}},
        },
        "tracking": {
            "display": {"$type": "string", "$value": "-0.03em"},
            "caps":    {"$type": "string", "$value": "0.08em"},
        },
    }

    # --- Сетка ---
    tokens["grid"] = {
        "canvas":   {"$type": "string",    "$value": "1920x1080"},
        "margin":   {"$type": "dimension", "$value": {"value": 96, "unit": "px"}},
        "columns":  {"$type": "number",    "$value": 12},
        "gutter":   {"$type": "dimension", "$value": {"value": 24, "unit": "px"}},
        "baseline": {"$type": "dimension", "$value": {"value": 8,  "unit": "px"}},
    }

    # --- Радиусы ---
    tokens["radius"] = {
        "none": {"$type": "dimension", "$value": {"value": 0, "unit": "px"}},
        "sm":   {"$type": "dimension", "$value": {"value": 3, "unit": "px"}},
        "md":   {"$type": "dimension", "$value": {"value": 6, "unit": "px"}},
        "lg":   {"$type": "dimension", "$value": {"value": 12, "unit": "px"}},
        "pill": {"$type": "dimension", "$value": {"value": 9999, "unit": "px"}},
    }

    # --- Тени ---
    tokens["shadow"] = {
        "none":      {"$type": "string", "$value": "none"},
        "subtle":    {"$type": "string", "$value": "0 1px 2px rgba(0,0,0,.06)"},
        "card":      {"$type": "string", "$value": "0 4px 16px rgba(0,0,0,.10)"},
        "elevated":  {"$type": "string", "$value": "0 8px 32px rgba(0,0,0,.16)"},
    }

    # --- Слайд (ОБЯЗАТЕЛЬНАЯ секция) ---
    ink_ref   = "{color.ink}"
    paper_ref = "{color.paper}"

    tokens["slide"] = {
        "aspectRatio": {"$type": "string",    "$value": "16/9"},
        "safeArea":    {"$type": "dimension", "$value": {"value": 64, "unit": "px"}},
        "layouts": {
            "cover": {
                "background": ink_ref,
                "foreground": paper_ref,
                "titleStyle": "{font.size.hero}",
                "decor": ["none"],
                "$rationale": "dark cover per sandwich-structure rule",
            },
            "section-divider": {
                "background": ink_ref,
                "foreground": paper_ref,
                "titleStyle": "{font.size.h1}",
                "$rationale": "dark divider maintains rhythm",
            },
            "content": {
                "background": paper_ref,
                "foreground": ink_ref,
                "$rationale": "light content slides for readability",
            },
            "full-bleed": {
                "background": "image",
                "foreground": paper_ref,
                "overlay": "{slide.decor.overlayGradient}",
                "$rationale": "full-bleed with darkening overlay for legibility",
            },
        },
        "decor": {
            "noiseOpacity":    {"$type": "number", "$value": 0.04},
            "overlayGradient": {
                "$type": "string",
                "$value": "linear-gradient(180deg, transparent 40%, rgba(10,10,10,.6) 100%)",
            },
        },
    }

    # Если font_fidelity: strict — добавляем метку
    if fonts.get("strict_override"):
        tokens["$metadata"]["strictFontOverrides"] = fonts["strict_override"]
        tokens["$metadata"]["screenshotSlidesRequired"] = True

    return tokens


def _merge_vision_colors(color_tokens: dict[str, Any], vision: dict[str, Any]) -> None:
    """
    Мержит цвета из Vision-ответа в color_tokens (только если слота ещё нет).
    Vision-ответ может иметь разную структуру — пробуем несколько вариантов.
    """
    # Пробуем стандартную DTCG-структуру color.*
    v_color = vision.get("color", {})
    for role in ("ink", "paper", "accent"):
        if role not in color_tokens:
            val = v_color.get(role)
            if isinstance(val, dict):
                val = val.get("$value") or val.get("value")
            if val and val != "needs verification":
                color_tokens[role] = {
                    "$type": "color",
                    "$value": val,
                    "$rationale": "from Claude Vision staged prompt",
                }

    # Акцент как вложенная структура
    if "accent" not in color_tokens:
        accent_node = v_color.get("accent", {})
        if isinstance(accent_node, dict):
            primary_val = accent_node.get("primary", {})
            if isinstance(primary_val, dict):
                primary_val = primary_val.get("$value", "")
            if primary_val:
                color_tokens["accent"] = {
                    "primary": {
                        "$type": "color",
                        "$value": primary_val,
                        "$rationale": "from Claude Vision staged prompt",
                    }
                }


def _luminance(hex_color: str) -> float:
    """Вычисляет относительную яркость hex-цвета (0.0–1.0)."""
    hex_color = hex_color.lstrip("#")
    if len(hex_color) != 6:
        return 0.5
    r, g, b = (int(hex_color[i:i+2], 16) / 255.0 for i in (0, 2, 4))
    def linearize(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b)


# ---------------------------------------------------------------------------
# Шаг 7: Style Dictionary
# ---------------------------------------------------------------------------

def run_style_dictionary(tokens_path: Path, out_dir: Path, build_script: Path) -> bool:
    """
    Запускает build-tokens.mjs через Node.js для генерации tailwind.config.js + globals.css.

    Параметры:
      tokens_path  — путь к tokens.json
      out_dir      — папка для выходных файлов
      build_script — путь к build-tokens.mjs

    Возвращает True при успехе.
    """
    if not build_script.exists():
        logger.error("Style Dictionary: build-tokens.mjs не найден: %s", build_script)
        return False

    out_dir.mkdir(parents=True, exist_ok=True)

    result = subprocess.run(
        ["node", str(build_script), str(tokens_path), str(out_dir)],
        capture_output=True, text=True,
    )

    if result.returncode != 0:
        logger.error("Style Dictionary: ошибка: %s", result.stderr[:1000])
        return False

    logger.info("Style Dictionary: успешно сгенерированы tailwind.config.js и globals.css")
    if result.stdout:
        logger.debug("Style Dictionary stdout: %s", result.stdout[:500])
    return True


# ---------------------------------------------------------------------------
# Загрузка deck-brief.yaml
# ---------------------------------------------------------------------------

def load_brief(brief_path: Path | None) -> dict[str, Any]:
    """Загружает deck-brief.yaml если он передан и существует."""
    if brief_path is None or not brief_path.exists():
        return {}
    try:
        with open(brief_path, encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        logger.info("Brief загружен: %s", brief_path.name)
        return data
    except Exception as exc:
        logger.error("Brief: ошибка чтения %s: %s", brief_path, exc)
        return {}


# ---------------------------------------------------------------------------
# Точка входа
# ---------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    """Разбирает аргументы командной строки."""
    p = argparse.ArgumentParser(
        description="Mastermind Deck — Слой 1: Извлечение дизайн-системы из референсов.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Примеры:
  python extract-style.py --refs references/ --out deck/tokens.json
  python extract-style.py --refs references/ --out deck/tokens.json --brief deck-brief.yaml
  python extract-style.py --refs references/ --out deck/tokens.json --skip-vision
""",
    )
    p.add_argument("--refs",       required=True,  type=Path, help="Папка с референсами (PNG/PDF/PPTX)")
    p.add_argument("--out",        required=True,  type=Path, help="Путь для tokens.json")
    p.add_argument("--brief",      default=None,   type=Path, help="Путь к deck-brief.yaml (опционально)")
    p.add_argument("--api-key",    default=None,   type=str,  help="Anthropic API key (или ANTHROPIC_API_KEY env)")
    p.add_argument("--skip-vision", action="store_true",      help="Пропустить шаг Claude Vision")
    p.add_argument("--skip-sd",    action="store_true",       help="Пропустить шаг Style Dictionary")
    p.add_argument("--verbose",    action="store_true",       help="Подробное логирование (DEBUG)")
    return p.parse_args()


def main() -> None:
    """Главная точка входа: запускает 7-шаговый пайплайн."""
    args = parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    refs_dir = args.refs.resolve()
    out_path = args.out.resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if not refs_dir.exists():
        logger.error("Папка референсов не найдена: %s", refs_dir)
        sys.exit(1)

    # Загружаем brief
    brief = load_brief(args.brief)
    font_fidelity = brief.get("font_fidelity", "editable")

    # Нормализованные PNG
    normalized_dir = refs_dir / "_normalized"

    # --- Шаг 1: Нормализация ---
    logger.info("=== Шаг 1: Нормализация входа ===")
    png_files = normalize_inputs(refs_dir, normalized_dir)

    # --- Шаг 2: Canonical из PDF ---
    logger.info("=== Шаг 2: Canonical values из PDF ===")
    canonical = extract_canonical_from_pdfs(refs_dir)

    # --- Шаг 3: Color Thief ---
    logger.info("=== Шаг 3: Color Thief ===")
    colors_ct = extract_colors_colorthief(png_files, refs_dir)

    # --- Шаг 4: Claude Vision ---
    vision: dict[str, Any] = {}
    if not args.skip_vision:
        logger.info("=== Шаг 4: Claude Vision ===")
        prompt_path = Path(__file__).parent.parent / "references" / "prompts" / "style-extractor.md"
        vision = extract_via_vision(png_files, prompt_path, api_key=args.api_key)
    else:
        logger.info("=== Шаг 4: Claude Vision — пропущен (--skip-vision) ===")

    # --- Шаг 5: Fallback шрифтов ---
    logger.info("=== Шаг 5: Web-safe fallback для шрифтов ===")
    fallback_table = load_fallback_table(refs_dir / ".." / "references" if (refs_dir / ".." / "references").exists() else Path(__file__).parent.parent / "references")
    if not fallback_table:
        fallback_table = load_fallback_table(Path(__file__).parent.parent / "references")

    # Собираем имена шрифтов из всех источников
    font_names: list[str] = []
    for f in canonical.get("fonts", []):
        font_names.append(f.get("fontname", ""))
    if vision.get("font", {}).get("display", {}).get("$value"):
        font_names.append(vision["font"]["display"]["$value"])
    if vision.get("font", {}).get("text", {}).get("$value"):
        font_names.append(vision["font"]["text"]["$value"])
    font_names = [f for f in font_names if f]

    fonts = apply_font_fallbacks(font_names, fallback_table, font_fidelity)

    # --- Шаг 6: Merge → tokens.json ---
    logger.info("=== Шаг 6: Merge → tokens.json ===")
    tokens = merge_into_tokens(canonical, colors_ct, vision, fonts, brief)

    out_path.write_text(json.dumps(tokens, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info("tokens.json записан: %s", out_path)

    # --- Шаг 7: Style Dictionary ---
    if not args.skip_sd:
        logger.info("=== Шаг 7: Style Dictionary ===")
        build_script = Path(__file__).parent / "build-tokens.mjs"
        run_style_dictionary(out_path, out_path.parent, build_script)
    else:
        logger.info("=== Шаг 7: Style Dictionary — пропущен (--skip-sd) ===")

    logger.info("Пайплайн завершён. Токены: %s", out_path)


if __name__ == "__main__":
    main()
