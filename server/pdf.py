"""Minimal PDF writer (Helvetica, A4) - no external dependencies."""
import zlib
from datetime import datetime

PAGE_W, PAGE_H = 595.28, 841.89
MARGIN = 44

NAVY = (0.043, 0.165, 0.357)
BLUE = (0.184, 0.42, 0.918)
AQUA = (0.369, 0.875, 0.69)
DARK = (0.06, 0.106, 0.239)
GRAY = (0.42, 0.467, 0.58)
LINE = (0.894, 0.914, 0.961)
SOFT = (0.949, 0.961, 0.988)


def _esc(text):
    text = str(text if text is not None else "")
    text = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    text = text.replace("→", "-").replace("–", "-").replace("—", "-").replace("…", "...")
    text = text.replace("·", "-").replace("’", "'").replace("“", '"').replace("”", '"')
    out = []
    for ch in text:
        out.append(ch if 32 <= ord(ch) < 256 else "?")
    return "".join(out)


def _fmt_money(n):
    try:
        n = int(round(float(n)))
    except (TypeError, ValueError):
        n = 0
    return "Rp " + format(n, ",d").replace(",", ".")


class PDF:
    def __init__(self, title="Aroma Jiwa Hadir"):
        self.pages = []
        self.title = title
        self.ops = []
        self.y = MARGIN
        self.page_no = 0
        self.add_page()

    # -- primitives ---------------------------------------------------------
    def add_page(self):
        if self.ops:
            self.pages.append("\n".join(self.ops))
        self.ops = []
        self.page_no += 1
        self.y = MARGIN

    def _top(self, y):
        return PAGE_H - y

    def text(self, x, y, s, size=9, bold=False, color=DARK):
        font = "F2" if bold else "F1"
        self.ops.append("BT /%s %.2f Tf %.3f %.3f %.3f rg 1 0 0 1 %.2f %.2f Tm (%s) Tj ET"
                        % (font, size, color[0], color[1], color[2], x, self._top(y), _esc(s)))

    def text_right(self, x, y, s, size=9, bold=False, color=DARK):
        width = self.width(s, size, bold)
        self.text(x - width, y, s, size, bold, color)

    def width(self, s, size=9, bold=False):
        return len(_esc(s)) * size * (0.55 if bold else 0.5)

    def wrap(self, s, max_w, size=9, bold=False):
        words = _esc(s).split(" ")
        lines = []
        cur = ""
        for w in words:
            trial = (cur + " " + w).strip()
            if self.width(trial, size, bold) > max_w and cur:
                lines.append(cur)
                cur = w
            else:
                cur = trial
        if cur:
            lines.append(cur)
        return lines

    def rect(self, x, y, w, h, fill=None, stroke=None, radius=0):
        parts = []
        if fill:
            parts.append("%.3f %.3f %.3f rg" % fill)
        if stroke:
            parts.append("%.3f %.3f %.3f RG 0.6 w" % stroke)
        parts.append("%.2f %.2f %.2f %.2f re %s" % (x, self._top(y + h), w, h, "f" if fill and not stroke else ("B" if fill and stroke else "S")))
        self.ops.append(" ".join(parts))

    def line(self, x1, y1, x2, y2, color=LINE, width=0.6):
        self.ops.append("%.3f %.3f %.3f RG %.2f w %.2f %.2f m %.2f %.2f l S"
                        % (color[0], color[1], color[2], width, x1, self._top(y1), x2, self._top(y2)))

    def gradient_header(self, title, subtitle=""):
        height = 92
        self.rect(0, 0, PAGE_W, height, fill=(0.075, 0.216, 0.435))
        self.rect(0, height - 6, PAGE_W, 6, fill=AQUA)
        self.rect(MARGIN, 22, 34, 34, fill=(1, 1, 1))
        self.text(MARGIN + 8, 40, "AJ", 13, True, NAVY)
        self.text(MARGIN + 46, 36, "AROMA JIWA", 15, True, (1, 1, 1))
        self.text(MARGIN + 46, 50, "HADIR · Portal Admin", 7, False, (0.75, 0.85, 1))
        self.text_right(PAGE_W - MARGIN, 36, title, 16, True, (1, 1, 1))
        if subtitle:
            self.text_right(PAGE_W - MARGIN, 50, subtitle, 7.5, False, (0.78, 0.88, 1))
        self.y = height + 24

    def meta(self, items):
        x = MARGIN
        for label, value in items:
            self.text(x, self.y, label.upper(), 6.5, True, GRAY)
            self.text(x, self.y + 11, value, 8.5, False, DARK)
            x += (PAGE_W - 2 * MARGIN) / max(1, len(items))
        self.y += 26
        self.line(MARGIN, self.y, PAGE_W - MARGIN, self.y)
        self.y += 14

    def heading(self, text, size=11):
        self.ensure(26)
        self.text(MARGIN, self.y, text, size, True, NAVY)
        self.y += 16

    def ensure(self, h):
        if self.y + h > PAGE_H - 56:
            self.footer()
            self.add_page()

    def footer(self):
        self.line(MARGIN, PAGE_H - 42, PAGE_W - MARGIN, PAGE_H - 42)
        self.text(MARGIN, PAGE_H - 32, "Aroma Jiwa Hadir · dibuat %s WIB" %
                  datetime.now().strftime("%d/%m/%Y %H:%M"), 7, False, GRAY)
        self.text_right(PAGE_W - MARGIN, PAGE_H - 32, "Halaman %d" % self.page_no, 7, False, GRAY)

    def table(self, headers, rows, widths, aligns=None, size=7.6, row_h=17):
        aligns = aligns or ["left"] * len(headers)
        self.ensure(row_h + 6)
        x = MARGIN
        self.rect(MARGIN, self.y, PAGE_W - 2 * MARGIN, row_h, fill=(0.925, 0.941, 0.976))
        for i, h in enumerate(headers):
            tx = x + 5
            if aligns[i] == "right":
                self.text_right(x + widths[i] - 5, self.y + 11, h, size, True, NAVY)
            else:
                self.text(tx, self.y + 11, h, size, True, NAVY)
            x += widths[i]
        self.y += row_h
        for idx, row in enumerate(rows):
            self.ensure(row_h)
            if idx % 2 == 1:
                self.rect(MARGIN, self.y, PAGE_W - 2 * MARGIN, row_h, fill=(0.976, 0.984, 1))
            x = MARGIN
            for i, cell in enumerate(row):
                val = cell
                if aligns[i] == "right":
                    self.text_right(x + widths[i] - 5, self.y + 11, val, size, False, DARK)
                else:
                    self.text(x + 5, self.y + 11, val, size, False, DARK)
                x += widths[i]
            self.y += row_h
            self.line(MARGIN, self.y, PAGE_W - MARGIN, self.y)
        self.y += 10

    def kv_grid(self, items, columns=3):
        col_w = (PAGE_W - 2 * MARGIN) / columns
        row = 0
        for idx, (label, value) in enumerate(items):
            col = idx % columns
            if col == 0 and idx:
                row += 1
            self.ensure(34)
            x = MARGIN + col * col_w
            y = self.y + row * 38
            self.rect(x, y, col_w - 8, 32, fill=SOFT)
            self.text(x + 8, y + 12, label, 6.5, False, GRAY)
            self.text(x + 8, y + 24, value, 11, True, NAVY)
        self.y += (row + 1) * 38 + 4

    def paragraph(self, text, size=8, color=DARK, max_w=None):
        max_w = max_w or (PAGE_W - 2 * MARGIN)
        for line in self.wrap(text, max_w, size):
            self.ensure(14)
            self.text(MARGIN, self.y, line, size, False, color)
            self.y += 12
        self.y += 4

    def bullet(self, text, size=8):
        self.ensure(14)
        self.text(MARGIN + 4, self.y, "-", size, True, BLUE)
        for i, line in enumerate(self.wrap(text, PAGE_W - 2 * MARGIN - 16, size)):
            if i:
                self.ensure(12)
            self.text(MARGIN + 14, self.y, line, size, False, DARK)
            self.y += 12
        self.y += 2

    def build(self):
        self.footer()
        if self.ops:
            self.pages.append("\n".join(self.ops))
        objects = []

        def add(obj):
            objects.append(obj)
            return len(objects)

        catalog_id = add("<< /Type /Catalog /Pages 2 0 R >>")
        pages_id = add("PLACEHOLDER")
        font1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
        font2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
        page_ids = []
        for content in self.pages:
            stream = content.encode("latin-1", "replace")
            compressed = zlib.compress(stream)
            content_id = add("<< /Length %d /Filter /FlateDecode >>\nstream\n" % len(compressed)
                             + compressed.decode("latin-1") + "\nendstream")
            page = add("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 %.2f %.2f] /Resources << /Font << /F1 %d 0 R /F2 %d 0 R >> >> /Contents %d 0 R >>"
                       % (PAGE_W, PAGE_H, font1, font2, content_id))
            page_ids.append(page)
        kids = " ".join("%d 0 R" % p for p in page_ids)
        objects[pages_id - 1] = "<< /Type /Pages /Count %d /Kids [%s] >>" % (len(page_ids), kids)
        info = add("<< /Title (%s) /Producer (Aroma Jiwa Hadir) /CreationDate (D:%s+07'00') >>"
                   % (_esc(self.title), datetime.now().strftime("%Y%m%d%H%M%S")))
        out = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = []
        for i, obj in enumerate(objects, start=1):
            offsets.append(len(out))
            out += ("%d 0 obj\n%s\nendobj\n" % (i, obj)).encode("latin-1", "replace")
        xref_pos = len(out)
        out += ("xref\n0 %d\n" % (len(objects) + 1)).encode()
        out += b"0000000000 65535 f \n"
        for off in offsets:
            out += ("%010d 00000 n \n" % off).encode()
        out += ("trailer\n<< /Size %d /Root %d 0 R /Info %d 0 R >>\nstartxref\n%d\n%%%%EOF\n"
                % (len(objects) + 1, catalog_id, info, xref_pos)).encode()
        return bytes(out)
