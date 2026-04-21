# Overflow Patterns — CSS Cheat Sheet

Quick-reference for the fixer cascade.
Each recipe maps to a cascade level, lists the trigger condition, and gives copy-paste CSS.

---

## Level 1: CSS scale reduction + clamp

### Recipe 1.1 — Hero title does not fit slot width

**Scenario:** Title text wraps to too many lines or clips at slot right edge.
Detector: `overflow: [{axis: "x", sel: "h1.slide-title", ...}]` or `clipped_text` on h1.

**Solution:**
```css
/* On the slide root or nearest container-type parent */
:root { --scale: 0.9; }

/* On the title slot itself */
.zone-title {
  font-size: clamp(2.5rem, calc(7cqi * var(--scale, 1)), 5rem);
  text-wrap: balance;
  overflow-wrap: anywhere;
  hyphens: auto;
}
```

**When to apply:** `scrollWidth > clientWidth + 1` on the title element; iteration_count <= 2.

---

### Recipe 1.2 — Body text overflows container vertically

**Scenario:** Paragraph text spills below its slot or below the slide boundary.
Detector: `overflow: [{axis: "y", sel: "p.slide-body", ...}]`.

**Solution:**
```css
/* On the body slot */
.zone-body {
  font-size: clamp(0.9rem, calc(1.4cqi * var(--scale, 1)), 1.4rem);
  line-height: 1.45;
  overflow: hidden;
}
```

**When to apply:** `scrollHeight > clientHeight + 1` on the body element; iteration_count <= 2.

---

## Level 2: line-clamp with ellipsis

### Recipe 2.1 — Bullet list items exceed slot height

**Scenario:** Bullet list has more items than the slot can show, or individual items wrap too much.
Detector: `clipped_text` on `li` elements.

**Solution:**
```css
/* On each list item */
.zone-bullets li {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  hyphens: auto;
}
```

**When to apply:** Level 1 did not resolve; `clipped_text` items are `<li>` nodes.

---

### Recipe 2.2 — Quote text exceeds 6 lines in quote layout

**Scenario:** Long quotation pushes author attribution off-screen.
Detector: `clipped_text` on `.zone-quote` or `off_canvas` on `.zone-author`.

**Solution:**
```css
.zone-quote {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
  line-clamp: 5;
  overflow: hidden;
  text-wrap: balance;
}
```

**When to apply:** `quote` layout; author element is clipped or off-canvas.

---

### Recipe 2.3 — Body paragraph in image-right / image-left layout overflows

**Scenario:** Body text column is too long; the image is fine but text clips.
Detector: `clipped_text` or `overflow.y` on `.zone-body` in image-* layout.

**Solution:**
```css
.zone-body {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 10;
  line-clamp: 10;
  overflow: hidden;
}
```

**When to apply:** image-right or image-left layout; body text clips; iteration_count >= 2.

---

### Recipe 2.4 — Two-column layout: one column overflows

**Scenario:** Left or right column text overflows its column boundary.
Detector: `overflow` or `clipped_text` on `.col-left` or `.col-right`.

**Solution:**
```css
.col-left,
.col-right {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 12;
  line-clamp: 12;
  overflow: hidden;
  min-width: 0;
  overflow-wrap: anywhere;
}
```

**When to apply:** two-cols or two-cols-header layout; column text overflows; Level 1 failed.

---

## Level 3: layout switch

### Recipe 3.1 — two-cols → default (single column)

**Scenario:** Both columns are too text-heavy; switching to single column allows longer text without shrinking font.

**Trigger:** 2 iterations on Level 1–2 did not resolve; `cascade_level_history` includes [1, 2] or [2, 2].

**Mapping:** Replace `<div class="slide two-cols">` with `<div class="slide default">`.
Merge left and right column content in reading order (left first, then right).
Update `data-layout="default"` on root.

```html
<!-- Before (two-cols) -->
<div class="slide two-cols" data-layout="two-cols">
  <div class="zone-title">...</div>
  <div class="col-left">...</div>
  <div class="col-right">...</div>
</div>

<!-- After (default) -->
<div class="slide default" data-layout="default">
  <div class="zone-title">...</div>
  <div class="zone-body">
    <!-- merged content from col-left + col-right -->
  </div>
</div>
```

---

### Recipe 3.2 — full-bleed-hero → image-left (text heavy)

**Scenario:** Overlay text on full-bleed image is unreadable or clipped; there is significant body text.

**Trigger:** Critic issues `"contrast"` or `"readability"` at severity major/critical on full-bleed-hero.

**Mapping:** Move image to `zone-image` (left or right); move text to `zone-body`.
Image gets `aspect-ratio: 4/3; object-fit: cover`.

```html
<!-- After switch -->
<div class="slide image-left" data-layout="image-left">
  <div class="zone-image">
    <img src="..." alt="..." style="width:100%;height:100%;object-fit:cover">
  </div>
  <div class="zone-content">
    <h2 class="zone-title">...</h2>
    <p class="zone-body">...</p>
  </div>
</div>
```

---

### Recipe 3.3 — bullet-list → two-cols-header (many bullets)

**Scenario:** Bullet list has 5–6 items; all items are short (< 80 chars each). Can split into two columns.

**Trigger:** `bullet-list` layout; 5–6 `<li>` items; Level 2 line-clamp would hide the last item.

**Mapping:** First half of bullets go into left column, second half into right column.
Shared `zone-title` stays full-width at the top.

```html
<div class="slide two-cols-header" data-layout="two-cols-header">
  <div class="zone-title">Shared heading</div>
  <div class="col-left">
    <ul><!-- items 1-3 --></ul>
  </div>
  <div class="col-right">
    <ul><!-- items 4-6 --></ul>
  </div>
</div>
```

---

## Level 4: split slide

### Recipe 4.1 — Long bullet list: split after item 3

**Scenario:** Bullet list has 7+ items; no layout fits all items at readable size.

**Split rule:** Items 1–3 → slide A; items 4–N → slide B.
Slide A footer: add a subtle "continued on next slide" caption if applicable.
Slide B gets the same title with a continuation marker (e.g., title + " (cont.)") or a distinct sub-heading.

### Recipe 4.2 — Dense two-column content: split into two separate topic slides

**Scenario:** Left and right columns contain content of two different subtopics that can each stand alone.

**Split rule:** Slide A = left column content in `default` layout; Slide B = right column content in `default` layout.
Both get the original shared title modified to reflect their specific subtopic.

---

## General rules (all levels)

- Always check `bug_report.detector.contrast` first. Low-contrast text may not be visible but is not always an overflow issue — fix the color before touching font size.
- Never set `overflow: visible` on the slide root or any direct child. The slide boundary is sacred.
- Never add a new font family not already present in `<style>` or `<link>` tags.
- Preserve every `data-*` attribute on root elements (layout, slide-id, iteration).
- When in doubt whether Level 1 or 2 applies, try Level 1 first — it is always reversible.
