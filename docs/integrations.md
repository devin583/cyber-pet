# 本地通知 API 接入指南

CyberPet 在 `http://127.0.0.1:12580`(端口可在设置里改)开了一个只限本机的 HTTP 接口。
任何能发 HTTP 请求的东西——脚本、定时任务、CI、爬虫——都能让宠物开口或弹系统通知。

## 接口一览

| 路径 | 效果 | 参数(query 或 JSON body) |
| --- | --- | --- |
| `GET/POST /say` | 宠物冒气泡说话 | `text`(≤200 字) |
| `GET/POST /notify` | 系统通知 + 宠物转述 | `title`(≤60 字)、`body` |

```bash
curl "http://127.0.0.1:12580/say?text=你好"
curl -X POST http://127.0.0.1:12580/notify \
     -H "Content-Type: application/json" \
     -d '{"title":"提醒","body":"该起来活动了"}'
```

**安全模型**:只绑定 127.0.0.1,外网与局域网都访问不到;不要自行改成 0.0.0.0(没有鉴权)。

## 场景一:定时提醒(Windows 任务计划)

比如每天 18:00 提醒下班。存成 `remind.ps1`:

```powershell
Invoke-RestMethod "http://127.0.0.1:12580/notify?title=下班啦&body=收拾收拾回家吃饭!"
```

注册计划任务(管理员 PowerShell 执行一次):

```powershell
$action  = New-ScheduledTaskAction -Execute "powershell" -Argument "-WindowStyle Hidden -File C:\scripts\remind.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At 18:00
Register-ScheduledTask -TaskName "PetRemind" -Action $action -Trigger $trigger
```

macOS/Linux 用 crontab:`0 18 * * * curl -s "http://127.0.0.1:12580/say?text=下班啦"`。

## 场景二:订阅内容(RSS 轮询)

订阅类服务(RSS、UP 主更新、Newsletter)接入思路都一样:
**本机跑一个轮询脚本,发现新内容就调 /notify**。纯标准库示例 `rss_watch.py`:

```python
import time, urllib.request, xml.etree.ElementTree as ET, urllib.parse

FEED = "https://sspai.com/feed"          # 换成你的订阅源
PET  = "http://127.0.0.1:12580"
seen = set()

while True:
    try:
        xml = urllib.request.urlopen(FEED, timeout=10).read()
        for item in ET.fromstring(xml).iter("item"):
            title = item.findtext("title", "")
            if title and title not in seen:
                if seen:                  # 首轮只记录不通知
                    q = urllib.parse.urlencode({"title": "📰 订阅更新", "body": title})
                    urllib.request.urlopen(f"{PET}/notify?{q}", timeout=5)
                seen.add(title)
    except Exception:
        pass                              # 网络波动直接跳过本轮
    time.sleep(600)                       # 10 分钟查一次
```

后台常驻:Windows 上用任务计划"登录时启动",或者直接加到 CyberPet 开机自启后手动跑。

## 场景三:CI / 构建完成通知

本机构建脚本末尾加一行:

```bash
npm run build && curl -s "http://127.0.0.1:12580/notify?title=构建完成&body=可以发布了" \
              || curl -s "http://127.0.0.1:12580/notify?title=构建失败&body=快去看日志"
```

云端 CI(GitHub Actions 等)访问不到你的 127.0.0.1,两种桥接方式:
1. **轮询**:本机脚本定时查 CI 状态 API,变化时调 /notify(同场景二思路);
2. **自托管 runner**:runner 在你机器上,workflow 里直接 curl。

## 场景四:其他程序/快捷指令

- 邮件规则:Outlook VBA / mailbox 脚本匹配关键字后 curl
- 快捷指令(iPhone→Mac)、Stream Deck 按键、Alfred/uTools 工作流:都能发 HTTP
- 别的程序想让宠物说话,一行 HTTP 请求即可,无 SDK 依赖

## FAQ

- **改端口**:设置面板 → 本地 API → 端口,立即生效
- **临时关闭**:设置面板取消勾选"启用"
- **会有鉴权吗**:计划中(token 校验),目前靠"只监听本机"保证安全
- **能不能推到手机**:本 API 只负责桌面;要推手机可在脚本里同时调 Bark / Server 酱等服务
