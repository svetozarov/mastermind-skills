"""
Export each slide of a PPTX to PNG for visual verification.
Uses PowerPoint COM API (Windows only).

Usage:
    python verify-slides.py <path-to-pptx> [--output <output-dir>]

Output:
    PNG files named slide_01.png, slide_02.png, etc.
    Default output dir: same folder as PPTX / _qa_slides /
"""
import sys
import os
import time

sys.stdout.reconfigure(encoding='utf-8')


def export_slides(pptx_path, output_dir=None):
    import comtypes.client

    pptx_path = os.path.abspath(pptx_path)
    if not os.path.exists(pptx_path):
        print(f"File not found: {pptx_path}")
        sys.exit(1)

    if output_dir is None:
        output_dir = os.path.join(os.path.dirname(pptx_path), '_qa_slides')

    os.makedirs(output_dir, exist_ok=True)

    print(f"Opening PowerPoint...")
    ppt = comtypes.client.CreateObject('PowerPoint.Application')
    ppt.Visible = True
    time.sleep(2)

    print(f"Opening: {pptx_path}")
    prs = ppt.Presentations.Open(pptx_path)
    time.sleep(3)

    total = prs.Slides.Count
    print(f"Exporting {total} slides to PNG...")

    # Ensure Windows-style paths for COM API
    output_dir = os.path.abspath(output_dir).replace('/', '\\')

    exported = []
    for i in range(1, total + 1):
        slide = prs.Slides(i)
        png_path = os.path.join(output_dir, f"slide_{i:02d}.png").replace('/', '\\')
        slide.Export(png_path, 'PNG')
        size_kb = os.path.getsize(png_path) / 1024
        print(f"  Slide {i}/{total}: {png_path} ({size_kb:.0f} KB)")
        exported.append(png_path)

    prs.Close()
    # Don't quit PowerPoint — user might need it
    print(f"\nExported {total} slides to: {output_dir}")
    return exported


def main():
    if len(sys.argv) < 2:
        print("Usage: python verify-slides.py <path-to-pptx> [--output <output-dir>]")
        sys.exit(1)

    pptx_path = sys.argv[1]
    output_dir = None

    if '--output' in sys.argv:
        idx = sys.argv.index('--output')
        if idx + 1 < len(sys.argv):
            output_dir = sys.argv[idx + 1]

    export_slides(pptx_path, output_dir)


if __name__ == '__main__':
    main()
