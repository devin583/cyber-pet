#!/usr/bin/env python3
"""基于 packs/default(团子猫)的帧模板,批量换色/加花纹,
生成用户家两只猫的素材包:阿呆(灰白猫)与花卷(棕虎斑)。"""
import json
import os
import re
import shutil

ROOT = os.path.join(os.path.dirname(__file__), '..')
SRC = os.path.join(ROOT, 'packs', 'default')

# 团子猫原始palette
BODY, BELLY, OUTLINE, CHEEK_PUFF = '#ffc98a', '#ffe8c7', '#5b4636', '#ffd9a8'

CATS = {
    'adai': {
        'name': '阿呆',
        'colors': {BODY: '#a7abb4', BELLY: '#f5f2ec', OUTLINE: '#4b4b55', CHEEK_PUFF: '#e2e1db'},
        'iris': '#f0a52c',           # 琥珀橙眼
        'extra': '<ellipse cx="64" cy="73" rx="17" ry="10" fill="#f5f2ec" stroke="none"/>',  # 白嘴套
        'white_socks': True,
    },
    'huajuan': {
        'name': '花卷',
        'colors': {BODY: '#cf9e5f', BELLY: '#ecd7ae', OUTLINE: '#57402a', CHEEK_PUFF: '#e3c08b'},
        'iris': '#6aa84f',           # 绿眼
        'extra': ''.join(
            f'<path d="{d}" fill="none" stroke="#6b4a2b" stroke-width="3" stroke-linecap="round"/>'
            for d in [
                'M54 40 q1 7 -1 11', 'M64 38 v12', 'M74 40 q-1 7 1 11',   # 额头虎斑
                'M25 68 q9 3 13 9', 'M24 84 q8 2 12 7',                    # 左侧
                'M103 68 q-9 3 -13 9', 'M104 84 q-8 2 -12 7',              # 右侧
            ]),
        'white_socks': False,
    },
}

DIALOGS = {
    'adai': {
        'click': ['……干嘛。', '戳可以,别耽误我发呆。', '(眯眼)你最好是有小鱼干。'],
        'angry': ['再戳就挠你。(才不会)', '喵!!适可而止啊!'],
        'doubleclick': ['蹦这一下,今天的运动量结束。'],
        'pet': ['就……就摸一会儿哦。', '呼噜呼噜……(假装不情愿)'],
        'feed': ['这还差不多。', '饭可以多给点,话不用多说。'],
        'drop': ['你完了。', '本喵记仇了。', '哼,肉多,不疼。'],
        'throw': ['?!你胆子不小啊!'],
        'sleep': ['别吵,睡了。'],
        'wake': ['……谁?哦,是你。'],
        'idlechat': ['花卷又躺我位置了。', '减肥?明天再说。', '晒太阳才是猫生正经事。', '干饭和发呆,择一而终。'],
        'chat_praise': ['哼,还算有眼光。', '(耳朵动了动)勉强收下这句夸奖。'],
        'chat_insult': ['你再说一遍?', '小本本记上了,晚上挠沙发。'],
        'reminder_water': ['你水都不喝,还想活到给我铲屎?', '喝水去。别学我只喝猫碗里的。'],
        'reminder_sit': ['起来遛遛,你看你坐得跟我一样圆。'],
    },
    'huajuan': {
        'click': ['喵呀!找我玩吗?', '嘿嘿,再戳一下试试~', '在呢在呢!'],
        'angry': ['呜哇,头晕了啦!', '不许无限连击!'],
        'doubleclick': ['蹦蹦!再来一次!'],
        'pet': ['最喜欢摸摸了!', '再来再来,别停~', '呼噜呼噜噜——'],
        'feed': ['开饭!阿呆的那份也给我吧!', '香香!你最好了!'],
        'drop': ['哎呀呀——', '还好我毛厚!'],
        'throw': ['我起飞啦——!'],
        'sleep': ['困了困了,去找阿呆挤一挤……晚安~'],
        'wake': ['呼啊~睡得好香!'],
        'idlechat': ['阿呆今天也好凶(才怪,他最软了)', '一起晒太阳吗?', '我的花纹是不是超好看!', '你在忙呀?那我看着你忙~'],
        'chat_praise': ['嘿嘿嘿,我知道我最可爱!', '你也超可爱!'],
        'chat_insult': ['呜……我去找阿呆告状!', '(耳朵耷下来了)'],
        'reminder_water': ['喝水水!我都喝三次了!', '咕咚咕咚,一起喝~'],
        'reminder_sit': ['起来伸懒腰!学我,喵~'],
    },
}


def build(cat_id, spec):
    out = os.path.join(ROOT, 'packs', cat_id)
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)

    for fn in sorted(os.listdir(SRC)):
        if not fn.endswith('.svg'):
            continue
        svg = open(os.path.join(SRC, fn), encoding='utf-8').read()
        # 1) 基础换色
        for old, new in spec['colors'].items():
            svg = svg.replace(old, new)
        # 2) 白袜子(脚)
        if spec['white_socks']:
            svg = re.sub(
                r'(<ellipse cx="\d+" cy="1\d\d" rx="\d+" ry="[56]" fill=")' + spec['colors'][BODY] + '("/>)',
                r'\1#f5f2ec\2', svg)
        # 3) 嘴套 / 虎斑纹:插入在肚皮之后,继承同组 transform
        if spec['extra']:
            svg = re.sub(
                r'(<path d="M64 117[^/]*fill="' + spec['colors'][BELLY] + '" stroke="none"/>)',
                r'\1' + spec['extra'], svg)
        # 4) 眼睛:纯黑圆 → 彩虹膜 + 黑瞳
        def eye(m):
            cx, cy, r = m.group(1), m.group(2), float(m.group(3))
            pupil = r * 0.55
            return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{spec["iris"]}"/>'
                    f'<circle cx="{cx}" cy="{cy}" r="{pupil:.1f}" fill="#26221d"/>')
        svg = re.sub(r'<circle cx="(\d+)" cy="(\d+)" r="(5\.5|4)" fill="#3d2f24"/>', eye, svg)
        open(os.path.join(out, fn), 'w', encoding='utf-8').write(svg)

    # pack.json:沿用 default 的状态表,替换名称与台词
    cfg = json.load(open(os.path.join(SRC, 'pack.json'), encoding='utf-8'))
    cfg['name'] = spec['name']
    cfg['author'] = 'dubhe & Claude'
    cfg['dialog'] = {**cfg['dialog'], **DIALOGS[cat_id]}
    json.dump(cfg, open(os.path.join(out, 'pack.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=2)
    print('generated', out)


if __name__ == '__main__':
    for cid, spec in CATS.items():
        build(cid, spec)
