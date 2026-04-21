// overflow-detector.js
// Deterministic overflow/overlap/contrast/clipped detector.
// Injected via Playwright browser_evaluate(). IIFE, no external deps.
// Returns "OK" if total === 0, else JSON report.
// ES2020-compatible. Safe for SVGAnimatedString className (SVG elements).

(() => {
  const SLIDE = (typeof window !== "undefined" && window.__SLIDE)
    ? window.__SLIDE
    : { w: 1920, h: 1080 };

  // Pixels of overlap area to trigger an overlap report entry.
  const OVERLAP_THRESHOLD_PX = 25;

  // Tolerance for overflow detection (avoids sub-pixel rounding noise).
  const OVERFLOW_TOLERANCE_PX = 1;

  const report = {
    overflow: [],
    overlap: [],
    off_canvas: [],
    clipped_text: [],
    contrast: [],
    clipped_fixed: []
  };

  const rects = [];

  // --- Luminance & contrast helpers ---

  /**
   * Parse a computed color string like "rgb(R, G, B)" or "rgba(R, G, B, A)"
   * into { r, g, b } in [0..1] range. Returns null if unparseable.
   */
  function parseColor(str) {
    if (!str) return null;
    const m = str.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
    if (!m) return null;
    return {
      r: parseFloat(m[1]) / 255,
      g: parseFloat(m[2]) / 255,
      b: parseFloat(m[3]) / 255
    };
  }

  /**
   * Relative luminance per WCAG 2.1 (sRGB formula).
   */
  function luminance(c) {
    function ch(v) {
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }

  /**
   * WCAG contrast ratio between two luminance values. Range [1..21].
   */
  function contrastRatio(l1, l2) {
    const lighter = Math.max(l1, l2);
    const darker  = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  /**
   * Resolve the effective background color for contrast calculation.
   *
   * Resolution order (first hit wins):
   *   1. `data-bg-color` attribute on the element or any ancestor (explicit override
   *      stamped by the HTML generator — the most reliable signal)
   *   2. getComputedStyle().backgroundColor walking up to .slide
   *   3. .slide root element's computed background (handles CSS-class themes like
   *      `.slide--dark` where the background is set via a CSS variable)
   *   4. Fallback to white
   */
  function effectiveBg(el) {
    // 1. data-bg-color explicit attribute
    let node = el;
    while (node && node !== document.documentElement) {
      const attr = node.getAttribute && node.getAttribute("data-bg-color");
      if (attr) {
        const parsed = parseColor(attr) || parseHex(attr);
        if (parsed) return parsed;
      }
      node = node.parentElement;
    }

    // 2. Computed background walk-up (stops at .slide)
    node = el;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      const bg = cs.backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        return parseColor(bg) || { r: 1, g: 1, b: 1 };
      }
      if (node.classList && node.classList.contains("slide")) break;
      node = node.parentElement;
    }

    // 3. Slide root fallback
    const slide = document.querySelector(".slide");
    if (slide) {
      const cs = getComputedStyle(slide);
      const bg = cs.backgroundColor;
      if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
        return parseColor(bg) || { r: 1, g: 1, b: 1 };
      }
    }

    return { r: 1, g: 1, b: 1 }; // default white
  }

  /** Parse "#RRGGBB" / "#RGB" hex strings into {r,g,b} in [0..1]. */
  function parseHex(hex) {
    if (typeof hex !== "string") return null;
    const m = hex.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    let h = m[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return {
      r: ((n >> 16) & 0xff) / 255,
      g: ((n >> 8) & 0xff) / 255,
      b: (n & 0xff) / 255,
    };
  }

  // --- Selector helper ---

  /**
   * Build a short CSS selector for an element.
   * Handles SVGAnimatedString className (SVG elements return an object, not a string).
   */
  function sel(el) {
    const id = el.id ? "#" + el.id : "";
    let cls = "";
    if (typeof el.className === "string" && el.className) {
      cls = "." + el.className.trim().split(/\s+/)[0];
    }
    // SVGAnimatedString: el.className.baseVal is the string
    else if (el.className && typeof el.className.baseVal === "string" && el.className.baseVal) {
      cls = "." + el.className.baseVal.trim().split(/\s+/)[0];
    }
    return el.tagName.toLowerCase() + id + cls;
  }

  // --- Main element scan ---

  document.querySelectorAll("body *").forEach((el) => {
    const r  = el.getBoundingClientRect();
    const cs = getComputedStyle(el);

    if (cs.display === "none" || cs.visibility === "hidden") return;

    const isLeaf = el.children.length === 0;
    const hasText = isLeaf && el.textContent.trim().length > 0;

    // 1. Overflow on axes
    if (el.scrollWidth > el.clientWidth + OVERFLOW_TOLERANCE_PX) {
      report.overflow.push({
        sel: sel(el),
        axis: "x",
        px: el.scrollWidth - el.clientWidth
      });
    }
    if (
      el.scrollHeight > el.clientHeight + OVERFLOW_TOLERANCE_PX &&
      cs.overflowY !== "auto"
    ) {
      report.overflow.push({
        sel: sel(el),
        axis: "y",
        px: el.scrollHeight - el.clientHeight
      });
    }

    // 2. Off-canvas (position-agnostic — any element outside slide viewport)
    const pos = cs.position;
    if (
      r.right  > SLIDE.w + OVERFLOW_TOLERANCE_PX ||
      r.bottom > SLIDE.h + OVERFLOW_TOLERANCE_PX ||
      r.left   < -OVERFLOW_TOLERANCE_PX ||
      r.top    < -OVERFLOW_TOLERANCE_PX
    ) {
      if (pos === "absolute" || pos === "fixed") {
        // Report as clipped_fixed — a dedicated category
        report.clipped_fixed.push({
          sel: sel(el),
          position: pos,
          rect: { x: r.x | 0, y: r.y | 0, w: r.width | 0, h: r.height | 0 }
        });
      } else {
        report.off_canvas.push({
          sel: sel(el),
          rect: { x: r.x | 0, y: r.y | 0, w: r.width | 0, h: r.height | 0 }
        });
      }
    }

    // 3. Clipped text leaves
    if (hasText && (el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight)) {
      report.clipped_text.push({
        sel: sel(el),
        text: el.textContent.trim().slice(0, 40) + "\u2026"
      });
    }

    // 4. Contrast check for text leaves
    if (hasText && r.width > 2 && r.height > 2) {
      const fgColor = parseColor(cs.color);
      if (fgColor) {
        const bgColor = effectiveBg(el);
        const ratio = contrastRatio(luminance(fgColor), luminance(bgColor));
        if (ratio < 4.5) {
          report.contrast.push({
            sel: sel(el),
            text_preview: el.textContent.trim().slice(0, 30),
            contrast_ratio: Math.round(ratio * 100) / 100,
            wcag_aa_min: 4.5
          });
        }
      }
    }

    // 5. Collect leaf rects for pairwise overlap
    if (isLeaf && r.width > 4 && r.height > 4) {
      rects.push({ sel: sel(el), r });
    }
  });

  // --- Pairwise overlap (leaf elements only) ---
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i].r;
      const b = rects[j].r;
      const ix = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const iy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (ix * iy > OVERLAP_THRESHOLD_PX) {
        report.overlap.push({
          a: rects[i].sel,
          b: rects[j].sel,
          area_px: (ix * iy) | 0
        });
      }
    }
  }

  // --- Final result ---
  const total =
    report.overflow.length +
    report.overlap.length +
    report.off_canvas.length +
    report.clipped_text.length +
    report.contrast.length +
    report.clipped_fixed.length;

  return total === 0 ? "OK" : report;
})();
