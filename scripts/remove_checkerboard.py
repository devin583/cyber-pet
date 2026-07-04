#!/usr/bin/env python3
"""去掉 AI 生成图里"烙进像素"的假透明棋盘格背景。

纯标准库:解码 PNG → 从四边泛洪填充,吃掉近中性的浅色棋盘格 →
按内容裁剪、底边对齐、补成方形 → 输出真透明 RGBA PNG。

用法: python3 remove_checkerboard.py 输入.png 输出.png
"""
import struct
import sys
import zlib
from collections import deque


def read_png(path):
    data = open(path, 'rb').read()
    assert data[:8] == b'\x89PNG\r\n\x1a\n', '不是 PNG'
    pos, idat, meta = 8, b'', None
    while pos < len(data):
        ln = struct.unpack('>I', data[pos:pos + 4])[0]
        tag = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + ln]
        if tag == b'IHDR':
            w, h, depth, ctype, _, _, interlace = struct.unpack('>IIBBBBB', body)
            assert depth == 8 and ctype in (2, 6) and interlace == 0, \
                f'仅支持 8bit RGB/RGBA 非隔行 (got depth={depth} type={ctype})'
            meta = (w, h, 4 if ctype == 6 else 3)
        elif tag == b'IDAT':
            idat += body
        elif tag == b'IEND':
            break
        pos += 12 + ln
    w, h, ch = meta
    raw = zlib.decompress(idat)
    stride = w * ch
    out = bytearray(w * h * 4)
    prev = bytearray(stride)
    for y in range(h):
        f = raw[y * (stride + 1)]
        line = bytearray(raw[y * (stride + 1) + 1: (y + 1) * (stride + 1)])
        if f == 1:
            for i in range(ch, stride):
                line[i] = (line[i] + line[i - ch]) & 255
        elif f == 2:
            for i in range(stride):
                line[i] = (line[i] + prev[i]) & 255
        elif f == 3:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                line[i] = (line[i] + ((a + prev[i]) >> 1)) & 255
        elif f == 4:
            for i in range(stride):
                a = line[i - ch] if i >= ch else 0
                b = prev[i]
                c = prev[i - ch] if i >= ch else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        for x in range(w):
            s, d = x * ch, (y * w + x) * 4
            out[d:d + 3] = line[s:s + 3]
            out[d + 3] = line[s + 3] if ch == 4 else 255
        prev = line
    return w, h, out


def is_checker(px, i):
    r, g, b = px[i], px[i + 1], px[i + 2]
    mx, mn = max(r, g, b), min(r, g, b)
    return mn >= 198 and mx - mn <= 14   # 浅色且近中性 → 棋盘格


def flood_remove(w, h, px):
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        if x < 0 or x >= w or y < 0 or y >= h:
            continue
        idx = y * w + x
        if seen[idx]:
            continue
        seen[idx] = 1
        i = idx * 4
        if not is_checker(px, i):
            continue
        px[i + 3] = 0
        q.append((x + 1, y)); q.append((x - 1, y))
        q.append((x, y + 1)); q.append((x, y - 1))


def crop_square_bottom(w, h, px):
    xs, ys, xe, ye = w, h, -1, -1
    for y in range(h):
        for x in range(w):
            if px[(y * w + x) * 4 + 3]:
                if x < xs: xs = x
                if x > xe: xe = x
                if y < ys: ys = y
                if y > ye: ye = y
    m = max(2, (xe - xs) // 50)
    xs, ys = max(0, xs - m), max(0, ys - m)
    xe, ye = min(w - 1, xe + m), min(h - 1, ye)   # 底部不留边,贴住画布底
    bw, bh = xe - xs + 1, ye - ys + 1
    side = max(bw, bh)
    out = bytearray(side * side * 4)
    ox = (side - bw) // 2
    oy = side - bh
    for y in range(bh):
        src = ((ys + y) * w + xs) * 4
        dst = ((oy + y) * side + ox) * 4
        out[dst:dst + bw * 4] = px[src:src + bw * 4]
    return side, out


def write_png(path, size, px):
    raw = b''.join(b'\x00' + bytes(px[y * size * 4:(y + 1) * size * 4]) for y in range(size))

    def chunk(tag, body):
        c = tag + body
        return struct.pack('>I', len(body)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(raw, 9)))
        f.write(chunk(b'IEND', b''))


if __name__ == '__main__':
    src, dst = sys.argv[1], sys.argv[2]
    w, h, px = read_png(src)
    flood_remove(w, h, px)
    side, out = crop_square_bottom(w, h, px)
    write_png(dst, side, out)
    print(f'{dst}: {w}x{h} -> {side}x{side} 透明背景完成')
