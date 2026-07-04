# CyberPet 素材包规范 v1

一个素材包就是一个文件夹,放入指定目录后即可在托盘菜单 / 右键菜单中切换。**不需要改任何代码。**

## 素材包放在哪

| 场景 | 目录 |
| --- | --- |
| 开发时 | 项目下的 `packs/` |
| 安装版(Windows) | `%APPDATA%/cyber-pet/packs/`(托盘菜单 →「打开素材包文件夹」会直接打开它) |

用户目录中与内置包同名的文件夹会**覆盖**内置包。

## 目录结构

```
packs/
└── my-pet/              ← 文件夹名就是素材包 id
    ├── pack.json        ← 唯一必需的配置文件
    ├── idle_0.png
    ├── idle_1.png
    └── ...              ← 帧图片(png / svg / gif / webp 均可)
```

## pack.json 字段

```jsonc
{
  "name": "团子猫",             // 显示名称(菜单里展示)
  "author": "你的名字",
  "version": "1.0.0",
  "frameSize": { "width": 128, "height": 128 },  // 帧图片的逻辑尺寸(px)
  "facing": "right",            // 素材默认朝向:right / left。
                                // 程序在宠物朝另一边时自动水平镜像
  "states": { ... },            // 动画状态,见下表
  "dialog": { ... },            // 台词,见下表(可省略,有内置默认台词)
  "sounds": { ... },            // 音效(可省略),如 {"click": ["meow.mp3"]}
  "persona": "你是一只…"        // 可选:启用 AI 聊天时的角色人设(一句话性格描述)
}
```

### states:动画状态

每个状态的格式:

```jsonc
"idle": {
  "frames": ["idle_0.png", "idle_1.png"],  // 帧文件名,按顺序播放
  "fps": 2,                                 // 播放帧率
  "loop": true                              // 是否循环(一次性动作填 false)
}
```

| 状态 | 触发时机 | 必需? | 缺失时回退 |
| --- | --- | --- | --- |
| `idle` | 平时待机(呼吸感) | **必需** | — |
| `blink` | 随机眨眼 | 可选 | idle |
| `walk` | 随机散步 | 可选 | idle |
| `drag` | 被鼠标拎起来 | 可选 | poke → idle |
| `fall` | 被抛出 / 下落中 | 可选 | drag → idle |
| `land` | 落地(压扁一下) | 可选 | poke → idle |
| `poke` | 被点了一下 | 可选 | idle |
| `happy` | 被抚摸 / 双击蹦跳 | 可选 | idle |
| `sleep` | 长时间无操作 / 手动睡觉 | 可选 | idle |
| `eat` | 右键菜单喂食 | 可选 | happy → idle |
| `dizzy` | 被连续戳(生气头晕) | 可选 | poke → idle |
| `speak` | 说话时 | 可选 | idle |
| `stretch` | 伸懒腰 / 睡醒 | 可选 | happy → idle |
| `notify` | 提醒(喝水/久坐)时 | 可选 | speak → happy → idle |

> 只画一个 `idle` 也能跑起来,其余状态全部自动回退。建议至少提供
> `idle / walk / drag / poke / happy / sleep`,体验最完整。

### dialog:台词

每个 key 对应一个字符串数组,触发时随机抽一条。全部可选,缺失的 key 使用内置默认台词。

| key | 触发时机 |
| --- | --- |
| `click` | 被点击 |
| `angry` | 2 秒内被戳 4 次以上 |
| `doubleclick` | 被双击 |
| `pet` | 被来回抚摸 |
| `feed` | 喂食 |
| `drop` | 被摔到地上 |
| `throw` | 被用力抛出去 |
| `sleep` / `wake` | 入睡 / 睡醒 |
| `greeting_morning` / `greeting_afternoon` / `greeting_evening` / `greeting_night` | 启动时按时段问候 |
| `idlechat` | 随机闲聊 /「随便聊聊」 |
| `reminder_water` / `reminder_sit` | 喝水 / 久坐提醒(同时用于系统通知正文) |
| `wheel` | 被鼠标滚轮"搓" |
| `follow_start` / `follow_stop` | 开启 / 关闭跟随模式 |
| `pomodoro_start` / `pomodoro_done` | 番茄钟开始 / 完成 |
| `chime` | 整点报时,文本中的 `{hour}` 会被替换成小时数 |
| `chat_praise` / `chat_insult` / `chat_fallback` | 聊天时被夸 / 被骂 / 没听懂 |

### sounds:音效(可选)

```jsonc
"sounds": {
  "click": ["meow_1.mp3", "meow_2.mp3"],
  "pet": ["purr.mp3"],
  "feed": ["nom.mp3"]
}
```

key 与 dialog 的 key 一致,文件放在素材包文件夹内,支持 mp3 / wav / ogg。

## 制作建议

- **画布统一**:所有帧使用相同尺寸(与 `frameSize` 一致),角色底部贴着画布底边——程序把画布底边当作"脚底"落在任务栏上沿。
- **透明背景**:PNG 请导出带 alpha 通道;SVG 天然透明。
- **SVG 帧的坑**:SVG 里 `<image href="xx.png">` 引用**外部文件不会生效**(浏览器安全限制,会渲染成透明),必须把位图以 base64 data URI 内嵌;`scripts/make_pack_from_image.py` 已自动处理。纯矢量 SVG 无此问题。
- **帧数不用多**:待机 2 帧、走路 2 帧就已经很生动,重点是表情差异。
- **GIF 也可以**:单帧填一个 GIF 文件即可(`"frames": ["run.gif"], "fps": 1`),GIF 自带的动画会自己播放。
- **改完即测**:切换到别的包再切回来即可重新加载;或重启程序。

## 校验规则

程序加载素材包时只强制检查一件事:`pack.json` 存在且 `states.idle` 有效。
不满足时该包加载失败,自动回退到默认包,并在控制台输出原因。
