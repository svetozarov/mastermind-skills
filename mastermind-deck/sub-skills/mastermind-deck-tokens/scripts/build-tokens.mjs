/**
 * Mastermind Deck — Style Dictionary v4 build-скрипт
 *
 * Читает tokens.json (W3C DTCG 2025.10), применяет DTCG preprocessor
 * и генерирует:
 *   - tailwind.config.js  (theme.extend.colors/fontFamily/fontSize/letterSpacing)
 *   - globals.css         (CSS custom properties + базовые классы)
 *
 * Использование:
 *   node build-tokens.mjs <tokens.json> <output-dir>
 *
 * Или через npm:
 *   npm run build-tokens
 */

import StyleDictionary from "style-dictionary";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Аргументы
// ---------------------------------------------------------------------------

const [, , tokensArg, outDirArg] = process.argv;

const TOKENS_PATH = tokensArg
  ? path.resolve(tokensArg)
  : path.resolve(__dirname, "..", "examples", "tokens.example.json");

const OUT_DIR = outDirArg
  ? path.resolve(outDirArg)
  : path.resolve(__dirname, "..", "..", "..", "..", "deck");

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

/**
 * Читает tokens.json и возвращает объект.
 * При ошибке завершает процесс с кодом 1.
 */
async function loadTokens(tokensPath) {
  try {
    const raw = await fs.readFile(tokensPath, "utf-8");
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[build-tokens] Не удалось прочитать ${tokensPath}: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Извлекает плоский словарь значений DTCG-токенов из вложенной структуры.
 * Возвращает Map: "color.ink" → "#0A0A0A"
 */
function flattenDTCG(obj, prefix = "", result = new Map()) {
  for (const [key, val] of Object.entries(obj)) {
    if (key.startsWith("$")) continue; // служебные поля DTCG
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val && typeof val === "object" && "$value" in val) {
      result.set(fullKey, val.$value);
    } else if (val && typeof val === "object") {
      flattenDTCG(val, fullKey, result);
    }
  }
  return result;
}

/**
 * Разрешает alias-ссылки вида {color.ink} в конкретные значения.
 * Максимальная глубина рекурсии: 5.
 */
function resolveAlias(value, flat, depth = 0) {
  if (depth > 5 || typeof value !== "string") return value;
  const match = value.match(/^\{(.+)\}$/);
  if (!match) return value;
  const aliasKey = match[1];
  if (flat.has(aliasKey)) {
    return resolveAlias(flat.get(aliasKey), flat, depth + 1);
  }
  return value; // alias не разрешён — возвращаем as-is
}

/**
 * Конвертирует dimension-токен DTCG ({ value: 96, unit: "px" }) в строку "96px".
 */
function dimensionToString(val) {
  if (typeof val === "string") return val;
  if (typeof val === "number") return `${val}px`;
  if (val && typeof val === "object" && "value" in val && "unit" in val) {
    return `${val.value}${val.unit}`;
  }
  return String(val);
}

// ---------------------------------------------------------------------------
// Генерация tailwind.config.js
// ---------------------------------------------------------------------------

/**
 * Строит содержимое tailwind.config.js на основе tokens.json.
 * Добавляет расширения только для секций, которые присутствуют в токенах.
 */
function buildTailwindConfig(tokens, flat) {
  const colors = {};
  const fontFamily = {};
  const fontSize = {};
  const letterSpacing = {};

  // Цвета: color.*
  for (const [key, val] of flat) {
    if (!key.startsWith("color.")) continue;
    const tailwindKey = key.replace("color.", "").replace(/\./g, "-");
    const resolved = resolveAlias(val, flat);
    if (typeof resolved === "string" && resolved !== "needs verification") {
      colors[tailwindKey] = resolved;
    }
  }

  // Шрифтовые семейства: font.display, font.text, font.mono
  const fontDisplay = flat.get("font.display");
  const fontText    = flat.get("font.text");
  const fontMono    = flat.get("font.mono");

  if (fontDisplay) fontFamily.display = fontDisplay.split(",").map((s) => s.trim());
  if (fontText)    fontFamily.text    = fontText.split(",").map((s) => s.trim());
  if (fontMono)    fontFamily.mono    = fontMono.split(",").map((s) => s.trim());

  // Размеры шрифта: font.size.*
  for (const [key, val] of flat) {
    if (!key.startsWith("font.size.")) continue;
    const sizeKey = key.replace("font.size.", "");
    fontSize[sizeKey] = dimensionToString(val);
  }

  // Межбуквенный интервал: font.tracking.*
  for (const [key, val] of flat) {
    if (!key.startsWith("font.tracking.")) continue;
    const trackKey = key.replace("font.tracking.", "");
    letterSpacing[trackKey] = typeof val === "string" ? val : String(val);
  }

  // Формируем строку конфига
  const colorsJson      = JSON.stringify(colors, null, 4).replace(/^/gm, "    ").trimStart();
  const fontFamilyJson  = JSON.stringify(fontFamily, null, 4).replace(/^/gm, "    ").trimStart();
  const fontSizeJson    = JSON.stringify(fontSize, null, 4).replace(/^/gm, "    ").trimStart();
  const trackingJson    = JSON.stringify(letterSpacing, null, 4).replace(/^/gm, "    ").trimStart();

  return `// tailwind.config.js — автогенерируется mastermind-deck-tokens/build-tokens.mjs
// НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ. Для изменений — правьте tokens.json и перезапустите build-tokens.
// Генератор: Style Dictionary v4 + W3C DTCG 2025.10

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./deck/slides/**/*.html",
    "./deck/index.html",
  ],
  theme: {
    extend: {
      colors: ${colorsJson},
      fontFamily: ${fontFamilyJson},
      fontSize: ${fontSizeJson},
      letterSpacing: ${trackingJson},
    },
  },
  plugins: [],
};
`;
}

// ---------------------------------------------------------------------------
// Генерация globals.css
// ---------------------------------------------------------------------------

/**
 * Строит содержимое globals.css:
 *   - CSS custom properties из color.*, grid.*
 *   - Базовые классы: .slide, .flex > *, h1/h2/h3, p
 *   - Slide layout overrides для cover, section-divider, content
 */
function buildGlobalsCss(tokens, flat) {
  const cssVars = [];

  // Цвета
  for (const [key, val] of flat) {
    if (!key.startsWith("color.")) continue;
    const resolved = resolveAlias(val, flat);
    if (typeof resolved === "string" && resolved !== "needs verification") {
      const varName = `--color-${key.replace("color.", "").replace(/\./g, "-")}`;
      cssVars.push(`  ${varName}: ${resolved};`);
    }
  }

  // Сетка
  const gridMargin   = dimensionToString(flat.get("grid.margin")   ?? { value: 96, unit: "px" });
  const gridGutter   = dimensionToString(flat.get("grid.gutter")   ?? { value: 24, unit: "px" });
  const gridBaseline = dimensionToString(flat.get("grid.baseline")  ?? { value: 8,  unit: "px" });
  const safeArea     = dimensionToString(flat.get("slide.safeArea") ?? { value: 64, unit: "px" });

  cssVars.push(`  --slide-margin: ${gridMargin};`);
  cssVars.push(`  --slide-gutter: ${gridGutter};`);
  cssVars.push(`  --slide-baseline: ${gridBaseline};`);
  cssVars.push(`  --slide-safe-area: ${safeArea};`);

  // Тени
  for (const [key, val] of flat) {
    if (!key.startsWith("shadow.")) continue;
    const resolved = typeof val === "string" ? val : String(val);
    const varName = `--shadow-${key.replace("shadow.", "")}`;
    cssVars.push(`  ${varName}: ${resolved};`);
  }

  // Layout-цвета из slide.layouts
  const layouts = tokens?.slide?.layouts ?? {};
  const layoutVars = [];
  for (const [layoutName, layoutDef] of Object.entries(layouts)) {
    if (typeof layoutDef !== "object") continue;
    const bg = resolveAlias(layoutDef.background ?? "", flat);
    const fg = resolveAlias(layoutDef.foreground ?? "", flat);
    if (bg && !bg.startsWith("{") && bg !== "image") {
      layoutVars.push(`  --slide-${layoutName}-bg: ${bg};`);
    }
    if (fg && !fg.startsWith("{")) {
      layoutVars.push(`  --slide-${layoutName}-fg: ${fg};`);
    }
  }

  // Шрифты как CSS-переменные
  const fontDisplay = flat.get("font.display") ?? "Helvetica, Arial, sans-serif";
  const fontText    = flat.get("font.text")    ?? "Helvetica, Arial, sans-serif";
  const fontMono    = flat.get("font.mono")    ?? "Courier New, monospace";

  cssVars.push(`  --font-display: ${fontDisplay};`);
  cssVars.push(`  --font-text: ${fontText};`);
  cssVars.push(`  --font-mono: ${fontMono};`);

  // Размеры шрифта
  for (const [key, val] of flat) {
    if (!key.startsWith("font.size.")) continue;
    const sizeKey = key.replace("font.size.", "");
    cssVars.push(`  --font-size-${sizeKey}: ${dimensionToString(val)};`);
  }

  const rootBlock = `:root {\n${cssVars.join("\n")}\n${layoutVars.join("\n")}\n}`;

  // globals.css exposes ONLY CSS custom properties on :root.
  // All structural .slide / typography / flex-reset / layout rules live in
  // components/base.css. Duplicating them here caused padding conflicts with
  // the positioning model (`.slide__inner { inset: 64px }`) in base.css.
  return `/* globals.css — автогенерируется mastermind-deck-tokens/build-tokens.mjs */
/* НЕ РЕДАКТИРОВАТЬ ВРУЧНУЮ. Для изменений — правьте tokens.json и перезапустите build-tokens. */
/* Этот файл эмитит ТОЛЬКО :root custom properties. Структурные и типографические */
/* правила живут в components/base.css. */

${rootBlock}
`;
}

// ---------------------------------------------------------------------------
// Главная функция
// ---------------------------------------------------------------------------

async function main() {
  console.log("[build-tokens] Загружаем токены:", TOKENS_PATH);

  const tokens = await loadTokens(TOKENS_PATH);
  const flat   = flattenDTCG(tokens);

  console.log(`[build-tokens] Загружено ${flat.size} токенов`);

  // Проверяем наличие обязательной секции slide.*
  const hasSlide = Array.from(flat.keys()).some((k) => k.startsWith("slide."));
  if (!hasSlide) {
    console.error(
      "[build-tokens] ОШИБКА: tokens.json не содержит секцию slide.* — обязательна по спецификации."
    );
    process.exit(1);
  }

  await fs.mkdir(OUT_DIR, { recursive: true });

  // Генерируем tailwind.config.js
  const tailwindContent = buildTailwindConfig(tokens, flat);
  const tailwindPath    = path.join(OUT_DIR, "tailwind.config.js");
  await fs.writeFile(tailwindPath, tailwindContent, "utf-8");
  console.log("[build-tokens] tailwind.config.js записан:", tailwindPath);

  // Генерируем globals.css
  const cssContent = buildGlobalsCss(tokens, flat);
  const cssPath    = path.join(OUT_DIR, "globals.css");
  await fs.writeFile(cssPath, cssContent, "utf-8");
  console.log("[build-tokens] globals.css записан:", cssPath);

  console.log("[build-tokens] Готово.");
}

main().catch((err) => {
  console.error("[build-tokens] Критическая ошибка:", err);
  process.exit(1);
});
