"""
Universal Gamma font replacer for PPTX.

Replaces non-system fonts with visually matching Windows system fonts.
Handles bold/italic attribute preservation when replacing weight-specific names.

No font installation needed — works on any Windows machine with standard fonts.

Usage:
    python replace-gamma-fonts.py <path-to-pptx> [--dry-run]

Output:
    Modifies the PPTX in-place (replaces fonts in all XML files).
    Prints a summary of all replacements.
"""
import sys
import os
import re
import zipfile
import shutil
from pathlib import Path
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8')

# ═══════════════════════════════════════════════════════════════════════════
# FONT MAP
#
# Maps Gamma font families → best matching Windows system font.
# Grouped by visual category for maintainability.
#
# Principles:
#   - Match stroke weight, x-height, and overall "feel"
#   - All targets are guaranteed on Windows 10/11
#   - Targets have full Cyrillic support
#
# Categories → System font:
#   Geometric sans (uniform strokes, modern)    → Bahnschrift
#   Grotesque sans (neutral, Helvetica-like)    → Segoe UI
#   Humanist sans (warm, organic)               → Calibri
#   Rounded sans (soft corners)                 → Candara
#   Condensed / narrow                          → Bahnschrift SemiCondensed
#   Serif text                                  → Georgia
#   Serif display                               → Palatino Linotype
#   Monospace                                   → Consolas
# ═══════════════════════════════════════════════════════════════════════════

FONT_MAP = {
    # --- Geometric sans → Bahnschrift ---
    # DIN-inspired, clean uniform strokes, architectural feel
    'Outfit':            'Bahnschrift',
    'DM Sans':           'Bahnschrift',
    'Poppins':           'Bahnschrift',
    'Montserrat':        'Bahnschrift',
    'Raleway':           'Bahnschrift',
    'Space Grotesk':     'Bahnschrift',
    'Urbanist':          'Bahnschrift',
    'Jost':              'Bahnschrift',
    'Lexend':            'Bahnschrift',
    'Figtree':           'Bahnschrift',
    'Sora':              'Bahnschrift',
    'General Sans':      'Bahnschrift',
    'Satoshi':           'Bahnschrift',
    'Clash Display':     'Bahnschrift',
    'Red Hat Display':   'Bahnschrift',

    # --- Modern grotesque → Segoe UI ---
    # Neutral, professional, similar to Helvetica/SF Pro
    'Inter':             'Segoe UI',
    'Geist':             'Segoe UI',
    'Roboto':            'Segoe UI',
    'Work Sans':         'Segoe UI',
    'Plus Jakarta Sans': 'Segoe UI',
    'Albert Sans':       'Segoe UI',
    'Karla':             'Segoe UI',
    'Noto Sans':         'Segoe UI',
    'IBM Plex Sans':     'Segoe UI',
    'Be Vietnam Pro':    'Segoe UI',
    'Switzer':           'Segoe UI',
    'Onest':             'Segoe UI',
    'Red Hat Text':      'Segoe UI',

    # --- Humanist sans → Calibri ---
    # Warm, organic, calligraphic hints
    'Source Sans Pro':   'Calibri',
    'Source Sans 3':     'Calibri',
    'Open Sans':         'Calibri',
    'Lato':              'Calibri',
    'Heebo':             'Calibri',
    'Manrope':           'Calibri',
    'Nunito Sans':       'Calibri',
    'Overpass':          'Calibri',
    'Atkinson Hyperlegible': 'Calibri',
    'Cabin':             'Corbel',

    # --- Rounded sans → Candara ---
    # Slightly rounded terminals, elegant
    'Nunito':            'Candara',
    'Quicksand':         'Candara',
    'Rubik':             'Candara',
    'Comfortaa':         'Candara',
    'Varela Round':      'Candara',

    # --- Condensed / narrow → Bahnschrift SemiCondensed ---
    'Oswald':            'Bahnschrift SemiCondensed',
    'Barlow Condensed':  'Bahnschrift SemiCondensed',
    'Bebas Neue':        'Bahnschrift SemiCondensed',
    'Fjalla One':        'Bahnschrift SemiCondensed',
    'Anton':             'Bahnschrift SemiCondensed',
    'Barlow':            'Bahnschrift',

    # --- Serif (text) → Georgia ---
    'Merriweather':      'Georgia',
    'Lora':              'Georgia',
    'Bitter':            'Georgia',
    'Libre Baskerville': 'Georgia',
    'IBM Plex Serif':    'Georgia',
    'Source Serif Pro':  'Georgia',
    'Source Serif 4':    'Georgia',
    'Crimson Text':      'Georgia',
    'Crimson Pro':       'Georgia',
    'PT Serif':          'Georgia',
    'Spectral':          'Constantia',

    # --- Serif (display) ---
    'Playfair Display':  'Georgia',
    'DM Serif Display':  'Georgia',
    'DM Serif Text':     'Georgia',
    'Young Serif':       'Georgia',
    'Fraunces':          'Georgia',
    'Bodoni Moda':       'Georgia',
    'Cormorant':         'Palatino Linotype',
    'Cormorant Garamond':'Palatino Linotype',
    'EB Garamond':       'Palatino Linotype',
    'Cormorant Infant':  'Palatino Linotype',

    # --- Monospace → Consolas ---
    'JetBrains Mono':    'Consolas',
    'Fira Code':         'Consolas',
    'Source Code Pro':   'Consolas',
    'Geist Mono':        'Consolas',
    'IBM Plex Mono':     'Consolas',
    'Inconsolata':       'Consolas',
    'Space Mono':        'Consolas',
    'Roboto Mono':       'Consolas',
}

# Standard Windows fonts — never replace these
STANDARD_FONTS = {
    # Windows core
    'Arial', 'Times New Roman', 'Verdana', 'Tahoma', 'Courier New',
    'Georgia', 'Impact', 'Comic Sans MS', 'Trebuchet MS',
    # Office ClearType collection
    'Calibri', 'Calibri Light', 'Cambria', 'Candara', 'Consolas',
    'Constantia', 'Corbel', 'Franklin Gothic Medium',
    # Windows 10/11 UI
    'Segoe UI', 'Segoe UI Light', 'Segoe UI Semibold', 'Segoe UI Black',
    'Segoe UI Variable', 'Segoe UI Emoji', 'Segoe UI Symbol',
    'Bahnschrift', 'Bahnschrift Light', 'Bahnschrift SemiBold',
    'Bahnschrift SemiLight', 'Bahnschrift SemiCondensed',
    # Modern Office
    'Aptos', 'Aptos Display',
    # Complex script / PPTX theme fallbacks (appear in theme1.xml)
    'Ebrima', 'Estrangelo Edessa', 'Nirmala UI', 'Javanese Text',
    'Leelawadee UI', 'Malgun Gothic', 'Microsoft YaHei', 'Microsoft JhengHei',
    'Yu Gothic', 'Yu Gothic UI', 'Gabriola', 'Gadugi',
    'Myanmar Text', 'Mongolian Baiti',
    # CJK fonts (theme complex script entries)
    '맑은 고딕',         # Malgun Gothic (Korean name)
    '新細明體',           # PMingLiU (Chinese Traditional)
    '游ゴシック',        # Yu Gothic (Japanese name)
    '游ゴシック Light',  # Yu Gothic Light (Japanese name)
    '等线',              # DengXian (Chinese Simplified)
    '等线 Light',        # DengXian Light
    # Indic / South Asian / Southeast Asian script fonts
    'Nyala', 'Vrinda', 'Shruti', 'Tunga', 'Raavi', 'Mangal',
    'Gautami', 'Latha', 'Kalinga', 'Kartika', 'Iskoola Pota',
    'DokChampa', 'MV Boli',
    # Other complex script fonts
    'Euphemia', 'Plantagenet Cherokee',
    'Microsoft Yi Baiti', 'Microsoft Himalaya',
    'Microsoft Uighur', 'Microsoft Tai Le', 'Microsoft New Tai Lue',
    'Phagspa', 'MoolBoran', 'DaunPenh',
    'Angsana New', 'Cordia New',
    # Classic serif
    'Palatino Linotype', 'Book Antiqua', 'Sylfaen', 'Garamond',
    'Century Gothic',
    # Symbols
    'Symbol', 'Webdings', 'Wingdings',
}

# Theme font references — never touch
THEME_REFS = {'+mn-lt', '+mn-ea', '+mn-cs', '+mj-lt', '+mj-ea', '+mj-cs'}

# Weight suffixes (longest first for correct stripping)
WEIGHT_SUFFIXES = [
    ' ExtraBold Italic', ' SemiBold Italic', ' Bold Italic',
    ' Light Italic', ' Medium Italic', ' Thin Italic',
    ' Black Italic', ' Regular Italic',
    ' ExtraBold', ' SemiBold', ' UltraLight', ' ExtraLight',
    ' Bold', ' Light', ' Medium', ' Thin', ' Black',
    ' Italic', ' Regular', ' Display',
]

# Suffixes that indicate bold weight
BOLD_SUFFIXES = {'Bold', 'ExtraBold', 'SemiBold', 'Black',
                 'Bold Italic', 'ExtraBold Italic', 'SemiBold Italic',
                 'Black Italic'}

# Suffixes that indicate italic
ITALIC_SUFFIXES = {'Italic', 'Bold Italic', 'ExtraBold Italic',
                   'SemiBold Italic', 'Light Italic', 'Medium Italic',
                   'Thin Italic', 'Black Italic', 'Regular Italic'}


def get_base_font(name):
    """'Inter Bold' → 'Inter', 'DM Sans Italic' → 'DM Sans'."""
    for suffix in WEIGHT_SUFFIXES:
        if name.endswith(suffix):
            base = name[:-len(suffix)].strip()
            return base if base else name
    return name


def get_weight_suffix(name):
    """'Inter Bold' → 'Bold', 'Inter' → ''."""
    base = get_base_font(name)
    return name[len(base):].strip() if name != base else ''


def is_bold_variant(name):
    """Check if font name implies bold weight."""
    suffix = get_weight_suffix(name)
    return suffix in BOLD_SUFFIXES


def is_italic_variant(name):
    """Check if font name implies italic style."""
    suffix = get_weight_suffix(name)
    return suffix in ITALIC_SUFFIXES


def is_standard(name):
    """Check if font is standard Windows or a theme reference."""
    if name in THEME_REFS or name in STANDARD_FONTS:
        return True
    base = get_base_font(name)
    return base in STANDARD_FONTS


def find_replacement(name):
    """Find the best system font replacement.

    Returns (replacement, reason) or (None, None) if standard.
    """
    if is_standard(name):
        return None, 'standard'

    # Direct match (exact font name in map)
    if name in FONT_MAP:
        return FONT_MAP[name], 'direct'

    # Base name match (e.g., "Inter Bold" → base "Inter" → "Segoe UI")
    base = get_base_font(name)
    if base in FONT_MAP:
        return FONT_MAP[base], f'base({base})'

    # Unknown font — safe fallback
    return 'Segoe UI', 'fallback'


def scan_fonts(pptx_path):
    """Extract all typeface values from PPTX XML."""
    fonts = Counter()
    with zipfile.ZipFile(pptx_path, 'r') as z:
        for name in z.namelist():
            if name.endswith('.xml'):
                content = z.read(name).decode('utf-8', errors='ignore')
                for m in re.finditer(r'typeface="([^"]+)"', content):
                    fonts[m.group(1)] += 1
    return fonts


def build_replacements(fonts):
    """Build {old_font: new_font} map from font list."""
    replacements = {}
    for font_name in fonts:
        repl, reason = find_replacement(font_name)
        if repl:
            replacements[font_name] = (repl, reason)
    return replacements


def apply_replacements(pptx_path, replacements):
    """Replace fonts in PPTX XML.

    1. Fix bold/italic attributes on runs that use weight-specific font names
    2. Replace all font name strings (longest first)

    Returns number of XML files modified.
    """
    temp_dir = Path(pptx_path).parent / '_pptx_font_fix'
    if temp_dir.exists():
        shutil.rmtree(temp_dir)
    temp_dir.mkdir()

    with zipfile.ZipFile(pptx_path, 'r') as z:
        z.extractall(temp_dir)

    # Separate bold and italic fonts for attribute fixup
    bold_fonts = [f for f in replacements if is_bold_variant(f)]
    italic_fonts = [f for f in replacements if is_italic_variant(f)]

    files_modified = 0
    for root, dirs, files in os.walk(temp_dir):
        for fname in files:
            if not fname.endswith('.xml'):
                continue

            fpath = os.path.join(root, fname)
            with open(fpath, 'r', encoding='utf-8') as f:
                content = f.read()

            original = content

            # --- Pass 1: Fix bold attributes ---
            # For "Inter Bold" → ensure parent <a:rPr> has b="1"
            # Pattern: <a:rPr [attrs]>...<a:latin typeface="Inter Bold"/>
            for bold_font in bold_fonts:
                pattern = (
                    r'(<a:rPr\b)'        # Tag start
                    r'([^>]*)'           # Attributes
                    r'(>(?:(?!</a:rPr).)*?'  # Content up to...
                    rf'typeface="{re.escape(bold_font)}")'  # ...the bold font ref
                )

                def _add_bold(m):
                    tag = m.group(1)
                    attrs = m.group(2)
                    rest = m.group(3)
                    if 'b="1"' not in attrs:
                        return tag + attrs + ' b="1"' + rest
                    return m.group(0)

                content = re.sub(pattern, _add_bold, content, flags=re.DOTALL)

            # --- Pass 2: Fix italic attributes ---
            for italic_font in italic_fonts:
                pattern = (
                    r'(<a:rPr\b)'
                    r'([^>]*)'
                    r'(>(?:(?!</a:rPr).)*?'
                    rf'typeface="{re.escape(italic_font)}")'
                )

                def _add_italic(m):
                    tag = m.group(1)
                    attrs = m.group(2)
                    rest = m.group(3)
                    if 'i="1"' not in attrs:
                        return tag + attrs + ' i="1"' + rest
                    return m.group(0)

                content = re.sub(pattern, _add_italic, content, flags=re.DOTALL)

            # --- Pass 3: Replace font names (longest first) ---
            for old_font in sorted(replacements, key=len, reverse=True):
                new_font = replacements[old_font][0]
                content = content.replace(
                    f'typeface="{old_font}"',
                    f'typeface="{new_font}"'
                )

            if content != original:
                with open(fpath, 'w', encoding='utf-8') as f:
                    f.write(content)
                files_modified += 1

    # Repackage PPTX
    with zipfile.ZipFile(pptx_path, 'w', zipfile.ZIP_DEFLATED) as z:
        for root, dirs, files in os.walk(temp_dir):
            for fname in files:
                fpath = os.path.join(root, fname)
                arcname = os.path.relpath(fpath, temp_dir)
                z.write(fpath, arcname)

    shutil.rmtree(temp_dir)
    return files_modified


def main():
    if len(sys.argv) < 2:
        print("Usage: python replace-gamma-fonts.py <path-to-pptx> [--dry-run]")
        sys.exit(1)

    pptx_path = sys.argv[1]
    dry_run = '--dry-run' in sys.argv

    if not os.path.exists(pptx_path):
        print(f"File not found: {pptx_path}")
        sys.exit(1)

    print("=== Gamma Font Replacer ===")
    print(f"File: {pptx_path}")
    if dry_run:
        print("[DRY RUN — no changes]\n")
    print()

    # Step 1: Scan
    fonts = scan_fonts(pptx_path)
    print("Fonts in PPTX:")
    for f, count in fonts.most_common():
        status = 'standard' if is_standard(f) else 'REPLACE'
        print(f"  {f}: {count}x  [{status}]")

    # Step 2: Build map
    replacements = build_replacements(fonts)

    if not replacements:
        print("\nAll fonts are standard. Nothing to replace.")
        return

    print(f"\nReplacements ({len(replacements)}):")
    for old_font in sorted(replacements):
        new_font, reason = replacements[old_font]
        bold = " +b" if is_bold_variant(old_font) else ""
        italic = " +i" if is_italic_variant(old_font) else ""
        print(f"  {old_font} -> {new_font}{bold}{italic}  [{reason}]")

    if dry_run:
        print("\n[DRY RUN] No changes made.")
        return

    # Step 3: Apply
    modified = apply_replacements(pptx_path, replacements)
    print(f"\nDone. Modified {modified} XML file(s).")
    print("If PowerPoint is open — close and reopen the file.")


if __name__ == '__main__':
    main()
