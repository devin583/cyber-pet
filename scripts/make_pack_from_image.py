#!/usr/bin/env python3
"""把 1~3 张静态角色图组装成完整的桌宠素材包。

原理:每个动作帧是一个 SVG 包装器,内嵌同一张 PNG,
用"底部锚定"的位移/缩放/旋转变换烘焙出呼吸、走路、拎起、压扁等动作。

用法:
  python3 scripts/make_pack_from_image.py 主图.png --name 我的猫 [--closed 闭眼.png] [--mouth 张嘴.png]

对图片的要求:正面全身、透明背景、大致正方形、角色贴近画布底部。
"""
import argparse
import base64
import json
import os
import shutil

CANVAS = 128


def data_uri(path):
    """SVG 经 <img> 加载时禁止引用外部文件,必须把位图内嵌为 data URI。"""
    return 'data:image/png;base64,' + base64.b64encode(open(path, 'rb').read()).decode()


def svg_frame(img, transform=''):
    inner = f'<image href="{img}" x="0" y="0" width="{CANVAS}" height="{CANVAS}"/>'
    if transform:
        inner = f'<g transform="{transform}">{inner}</g>'
    return (f'<svg xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="0 0 {CANVAS} {CANVAS}">{inner}</svg>\n')


def anchored(sx=1, sy=1, rot=0, dy=0):
    """底部中心锚定的缩放/旋转,可叠加垂直位移(负数向上)。"""
    c = CANVAS / 2
    b = CANVAS
    t = f'translate({c} {b}) scale({sx} {sy}) rotate({rot}) translate({-c} {-b})'
    if dy:
        t = f'translate(0 {dy}) ' + t
    return t


def build(main_img, name, closed_img=None, mouth_img=None, out_dir=None, happy_img=None):
    pid = ''.join(c if c.isalnum() else '-' for c in name).strip('-').lower() or 'custom'
    out = out_dir or os.path.join(os.path.dirname(__file__), '..', 'packs', pid)
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)

    imgs = {'body.png': main_img}
    if closed_img:
        imgs['closed.png'] = closed_img
    if mouth_img:
        imgs['mouth.png'] = mouth_img
    if happy_img:
        imgs['happy.png'] = happy_img
    uris = {}
    for dst, src in imgs.items():
        shutil.copy(src, os.path.join(out, dst))   # 源图留档,方便后续编辑
        uris[dst] = data_uri(src)

    body = uris['body.png']
    closed = uris.get('closed.png')
    mouth = uris.get('mouth.png')
    happy = uris.get('happy.png')

    # 状态 → [(帧名, 用图, 变换)]
    frames = {
        'idle': [('idle_0', body, ''), ('idle_1', body, anchored(1, 0.97))],
        'walk': [('walk_0', body, anchored(rot=-4)), ('walk_1', body, anchored(rot=4))],
        'drag': [('drag_0', body, anchored(0.97, 1.06))],
        'fall': [('fall_0', body, anchored(rot=-9))],
        'land': [('land_0', body, anchored(1.18, 0.72))],
        'poke': [('poke_0', body, anchored(1.06, 0.94)), ('poke_1', body, '')],
        'happy': [('happy_0', happy or body, anchored(0.97, 1.04)),
                  ('happy_1', happy or body, anchored(dy=-8)),
                  ('happy_2', happy or body, '')],
        'dizzy': [('dizzy_0', body, anchored(rot=-6)), ('dizzy_1', body, anchored(rot=6)),
                  ('dizzy_2', body, '')],
        'stretch': [('stretch_0', body, anchored(0.94, 1.1)), ('stretch_1', body, '')],
    }
    if closed:
        frames['blink'] = [('blink_0', closed, ''), ('blink_1', body, '')]
        frames['sleep'] = [('sleep_0', closed, anchored(1.02, 0.95)), ('sleep_1', closed, anchored(1.01, 0.97))]
    else:
        frames['sleep'] = [('sleep_0', body, anchored(1.03, 0.93)), ('sleep_1', body, anchored(1.02, 0.96))]
    if mouth:
        frames['speak'] = [('speak_0', mouth, ''), ('speak_1', body, '')]
        frames['eat'] = [('eat_0', mouth, ''), ('eat_1', body, anchored(1.03, 0.97)),
                         ('eat_2', mouth, ''), ('eat_3', body, anchored(1.03, 0.97))]

    fps = {'idle': 1.6, 'walk': 4, 'sleep': 0.8, 'blink': 6, 'poke': 4,
           'happy': 5, 'dizzy': 4, 'stretch': 2, 'speak': 5, 'eat': 5}
    once = {'blink', 'poke', 'happy', 'dizzy', 'stretch', 'speak', 'eat', 'land'}

    states = {}
    for state, lst in frames.items():
        for fname, img, tf in lst:
            with open(os.path.join(out, fname + '.svg'), 'w', encoding='utf-8') as f:
                f.write(svg_frame(img, tf))
        states[state] = {
            'frames': [fname + '.svg' for fname, _, _ in lst],
            'fps': fps.get(state, 3),
            'loop': state not in once
        }

    cfg = {
        'name': name,
        'author': 'make_pack_from_image',
        'version': '1.0.0',
        'frameSize': {'width': CANVAS, 'height': CANVAS},
        'facing': 'right',
        'states': states
    }
    with open(os.path.join(out, 'pack.json'), 'w', encoding='utf-8') as f:
        json.dump(cfg, f, ensure_ascii=False, indent=2)
    print(f'生成完成:{os.path.abspath(out)}(状态数 {len(states)})')


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('image', help='主图(正面全身、透明背景 PNG)')
    ap.add_argument('--name', default='我的角色')
    ap.add_argument('--closed', help='闭眼图(可选,用于眨眼和睡觉)')
    ap.add_argument('--mouth', help='张嘴图(可选,用于说话和吃饭)')
    ap.add_argument('--happy', help='开心表情图(可选,用于开心状态)')
    ap.add_argument('--out', help='输出目录(默认 packs/<name>)')
    a = ap.parse_args()
    build(a.image, a.name, a.closed, a.mouth, a.out, a.happy)
