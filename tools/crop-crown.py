"""Trim Crown.png black padding for footer icon."""
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "Image" / "Crown.png"
OUT = ROOT / "assets" / "Image" / "Crown.png"


def paeth(a, b, c):
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def read_png(path):
    data = path.read_bytes()
    pos = 8
    width = height = None
    idat = b""
    while pos < len(data):
        length = struct.unpack(">I", data[pos : pos + 4])[0]
        pos += 4
        ctype = data[pos : pos + 4]
        pos += 4
        chunk = data[pos : pos + length]
        pos += length
        pos += 4
        if ctype == b"IHDR":
            width, height, bit_depth, color_type, comp, filt, interlace = struct.unpack(">IIBBBBB", chunk)
        elif ctype == b"IDAT":
            idat += chunk
        elif ctype == b"IEND":
            break
    raw = zlib.decompress(idat)
    stride = width * 4
    rows = []
    i = 0
    for _ in range(height):
        filt = raw[i]
        i += 1
        row = bytearray(raw[i : i + stride])
        i += stride
        for x in range(stride):
            left = row[x - 4] if x >= 4 else 0
            up = rows[-1][x] if rows else 0
            up_left = rows[-1][x - 4] if rows and x >= 4 else 0
            if filt == 1:
                row[x] = (row[x] + left) & 255
            elif filt == 2:
                row[x] = (row[x] + up) & 255
            elif filt == 3:
                row[x] = (row[x] + ((left + up) // 2)) & 255
            elif filt == 4:
                row[x] = (row[x] + paeth(left, up, up_left)) & 255
        rows.append(row)
    return width, height, rows


def write_png(path, width, height, rows):
    def pack_rows():
        out = b""
        for row in rows:
            out += b"\x00" + bytes(row)
        return zlib.compress(out, 9)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = pack_rows()

    def chunk(tag, payload):
        crc = zlib.crc32(tag + payload) & 0xFFFFFFFF
        return struct.pack(">I", len(payload)) + tag + payload + struct.pack(">I", crc)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", ihdr)
    png += chunk(b"IDAT", idat)
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def luminance(r, g, b):
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def trim_rows(rows, w, h, lum_min=18, pad_ratio_x=0.08, pad_ratio_y=0.08):
    top = h
    bottom = 0
    left = w
    right = 0
    for y, row in enumerate(rows):
        for x in range(0, w * 4, 4):
            r, g, b, a = row[x], row[x + 1], row[x + 2], row[x + 3]
            if a > 8 and luminance(r, g, b) > lum_min:
                top = min(top, y)
                bottom = max(bottom, y)
                left = min(left, x // 4)
                right = max(right, x // 4)
    pad_x = max(8, int((right - left + 1) * pad_ratio_x))
    pad_y = max(8, int((bottom - top + 1) * pad_ratio_y))
    top = max(0, top - pad_y)
    bottom = min(h - 1, bottom + pad_y)
    left = max(0, left - pad_x)
    right = min(w - 1, right + pad_x)
    cropped = []
    for y in range(top, bottom + 1):
        row = bytearray(rows[y][left * 4 : (right + 1) * 4])
        for x in range(0, len(row), 4):
            r, g, b, a = row[x], row[x + 1], row[x + 2], row[x + 3]
            if a <= 8 or luminance(r, g, b) < 22:
                row[x + 3] = 0
        cropped.append(row)
    return cropped, right - left + 1, bottom - top + 1


def main():
    w, h, rows = read_png(SRC)
    cropped, cw, ch = trim_rows(rows, w, h)
    write_png(OUT, cw, ch, cropped)
    print(f"cropped {w}x{h} -> {cw}x{ch} -> {OUT}")


if __name__ == "__main__":
    main()
