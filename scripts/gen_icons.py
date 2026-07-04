#!/usr/bin/env python3
"""生成 assets/tray.png(32x32)与 assets/icon.png(256x256)。
纯标准库实现,画一只简化的团子猫头像。"""
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets')

BODY = (255, 201, 138, 255)    # 奶橘
INNER = (255, 179, 193, 255)   # 耳朵内侧粉
EYE = (61, 47, 36, 255)
BLANK = (0, 0, 0, 0)


def render(size):
    """返回 RGBA 像素行列表。用归一化坐标画:圆脸 + 三角耳 + 眼睛。"""
    px = [[BLANK] * size for _ in range(size)]

    def put(xf, yf, cond, color):
        pass  # 占位,逐像素扫描实现在下面

    cx, cy, r = 0.5, 0.60, 0.34          # 脸
    ears = [((0.26, 0.44), (0.14, 0.08), (0.50, 0.30)),   # 左耳三角
            ((0.74, 0.44), (0.86, 0.08), (0.50, 0.30))]   # 右耳三角
    eyes = [(0.38, 0.58), (0.62, 0.58)]
    eye_r = 0.055

    def in_tri(p, a, b, c):
        def cross(o, u, v):
            return (u[0] - o[0]) * (v[1] - o[1]) - (u[1] - o[1]) * (v[0] - o[0])
        d1, d2, d3 = cross(a, b, p), cross(b, c, p), cross(c, a, p)
        neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
        pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
        return not (neg and pos)

    for j in range(size):
        for i in range(size):
            x, y = (i + 0.5) / size, (j + 0.5) / size
            p = (x, y)
            # 耳朵(先画,脸会盖住底部)
            for k, tri in enumerate(ears):
                if in_tri(p, *tri):
                    a, b, c = tri
                    # 内耳:朝质心收缩后的三角
                    gx, gy = (a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3
                    shrink = lambda v: (gx + (v[0] - gx) * 0.5, gy + (v[1] - gy) * 0.5)
                    inner = in_tri(p, shrink(a), shrink(b), shrink(c))
                    px[j][i] = INNER if inner else BODY
            # 脸
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                px[j][i] = BODY
                for ex, ey in eyes:
                    if (x - ex) ** 2 + (y - ey) ** 2 <= eye_r ** 2:
                        px[j][i] = EYE
    return px


def write_png(path, px):
    size = len(px)
    raw = b''.join(
        b'\x00' + b''.join(struct.pack('4B', *c) for c in row) for row in px
    )

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    print('written', path)


if __name__ == '__main__':
    os.makedirs(OUT_DIR, exist_ok=True)
    write_png(os.path.join(OUT_DIR, 'tray.png'), render(32))
    write_png(os.path.join(OUT_DIR, 'icon.png'), render(256))
