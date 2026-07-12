const api = window.petAPI;

// ---------- 元素 ----------
const petEl = document.getElementById('pet');
const frameEl = document.getElementById('frame');
const bubbleEl = document.getElementById('bubble');
const menuEl = document.getElementById('menu');
const chatEl = document.getElementById('chat');
const chatInput = document.getElementById('chat-input');
const reminderScene = document.getElementById('reminder-scene');
const reminderPetFrame = document.getElementById('reminder-pet-frame');
const reminderIcon = document.getElementById('reminder-icon');
const reminderKicker = document.getElementById('reminder-kicker');
const reminderTitle = document.getElementById('reminder-title');
const reminderMessage = document.getElementById('reminder-message');
const reminderDone = document.getElementById('reminder-done');
const reminderSnooze = document.getElementById('reminder-snooze');
const reminderSkip = document.getElementById('reminder-skip');
const reminderTimeout = document.getElementById('reminder-timeout');

// ---------- 常量 ----------
const GRAVITY = 2600;          // px/s^2
const BOUNCE = 0.42;           // 落地反弹系数
const WALK_SPEED = 65;         // px/s
const THROW_SPEAK_V = 900;     // 超过此速度算"被扔出去"
const SLEEP_IDLE_SEC = 300;    // 系统空闲多久后睡觉

// 状态缺失时的回退链,最终都落到 idle
const FALLBACKS = {
  blink: ['idle'],
  walk: ['idle'],
  drag: ['poke', 'idle'],
  fall: ['drag', 'idle'],
  land: ['poke', 'idle'],
  poke: ['idle'],
  happy: ['idle'],
  sleep: ['idle'],
  eat: ['happy', 'idle'],
  dizzy: ['poke', 'idle'],
  speak: ['idle'],
  stretch: ['happy', 'idle'],
  notify: ['speak', 'happy', 'idle']
};

// 素材包没提供台词时的默认台词
const DEFAULT_LINES = {
  click: ['喵?', '干嘛戳我~', '有事吗喵?', '嘿嘿,好痒!'],
  angry: ['再戳我要生气啦!', '喵!!别戳了!', '头都被你戳晕了……'],
  doubleclick: ['耶!要一起玩吗?', '蹦蹦!'],
  pet: ['好舒服喵~', '再摸摸~', '呼噜呼噜……'],
  feed: ['开饭啦!', '是小鱼干吗!', '唔,好好吃~谢谢你喵!'],
  drop: ['哎哟——', '喵呜!摔疼了啦!', '下次轻一点嘛~'],
  throw: ['哇啊啊——!', '我飞起来啦!'],
  sleep: ['有点困了……晚安喵~'],
  wake: ['唔……我睡了多久?', '呼啊……早安!'],
  greeting_morning: ['早上好!今天也要加油鸭!', '早安喵~吃早饭了吗?'],
  greeting_afternoon: ['下午好~要不要伸个懒腰?', '午后时光,最适合打盹了~'],
  greeting_evening: ['晚上好!今天辛苦啦~'],
  greeting_night: ['夜深了,早点休息哦~', '还不睡吗?熬夜会秃头的喵!'],
  idlechat: ['在忙什么呢?', '陪我玩一会儿嘛~', '我是不是世界上最可爱的桌宠!', '摸鱼被我看到了哦~'],
  reminder_water: ['该喝水啦!咕咚咕咚~'],
  reminder_sit: ['坐太久啦!起来活动活动~'],
  wheel: ['转…转晕了……', '别搓啦!毛都乱了!', '呜哇,天旋地转——'],
  follow_start: ['好耶!我跟着你~', '走哪跟哪,出发!'],
  follow_stop: ['那我自己玩啦~', '好吧,我在这儿等你。'],
  pomodoro_start: ['专注模式启动!25 分钟后见~', '我会安静陪着你的,加油!'],
  pomodoro_done: ['叮!25 分钟到啦,起来休息一下吧~', '专注完成!奖励自己伸个懒腰!'],
  chime: ['🕐 {hour} 点整啦~', '铛铛铛~{hour} 点了哦!'],
  chat_praise: ['嘿嘿,人家会害羞的啦~', '我也最喜欢你了!', '那当然,也不看看我是谁~'],
  chat_insult: ['呜……你凶我……', '哼!不理你了(转头)', '我要把这句话记进小本本!'],
  chat_fallback: ['嗯嗯,然后呢?', '喵?没太听懂,再说说?', '哦~原来如此(其实没懂)', '你说得好有道理!']
};

const JOKES = [
  '为什么程序员分不清万圣节和圣诞节?因为 Oct 31 == Dec 25!',
  '我有一个绝妙的笑话……但是缓存里找不到了。',
  '猫为什么怕水?因为水里有 H₂O,喵最怕 O(n²)!',
  '医生:你要少对着电脑。我:好的医生,那我对着手机。',
  '我跟我的床感情特别好,每天早上都舍不得分开。',
  '失眠的原因找到了:白天睡太多。',
  '钱不是万能的,但没钱是万万不能的——所以我先睡了,梦里啥都有。',
  '今天天气真好,适合把昨天说"明天再做"的事推到明天。'
];

// ---------- 运行时状态 ----------
let cfg = null;              // pack.json 内容
let packDir = '';            // 素材包目录
let settings = null;
let images = {};             // 预加载帧: state -> [Image]

let W = innerWidth, H = innerHeight;
let petW = 128, petH = 128;
let x = 0, y = 0, vx = 0, vy = 0;   // 宠物左上角坐标与速度
let facing = 1;                      // 1 = 面向右
let mode = 'idle';                   // idle | walk | drag | fall | sleep
let walkTarget = 0;
let thrown = false;
let manualSleep = false;

let anim = { state: '', frames: [], fps: 2, loop: true, idx: 0, acc: 0, onDone: null };

let nextIdleAct = performance.now() + 3000;
let pokeTimes = [];
let petStrokes = [];          // 抚摸检测: 记录方向变化
let petCooldownUntil = 0;
let sleepBubbleTimer = null;
let bubbleTimer = null;
let reminderActive = false;
let reminderData = null;
let reminderTimer = null;
let reminderCountdownTimer = null;
let queuedReminder = null;

// 拖拽状态
let pressing = false, dragging = false;
let pressX = 0, pressY = 0, grabDX = 0, grabDY = 0;
let dragSamples = [];
let clickCount = 0, clickTimer = null;
let mouseOverPet = false;
let menuOpen = false;
let chatOpen = false;
let following = false;
let lastMouseX = innerWidth / 2, lastMouseY = 0;
let wheelCooldown = 0;
let pomodoroEnd = 0;
const rpsScore = { win: 0, lose: 0 };

const floorY = () => H - petH;

// ---------- 工具 ----------

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function lineFor(key) {
  const fromPack = cfg.dialog && cfg.dialog[key];
  const pool = (Array.isArray(fromPack) && fromPack.length) ? fromPack : DEFAULT_LINES[key];
  return pool ? rand(pool) : null;
}

function resolveState(name) {
  if (cfg.states[name]) return name;
  for (const fb of FALLBACKS[name] || []) {
    if (cfg.states[fb]) return fb;
  }
  return 'idle';
}

function frameURL(file) {
  return 'file://' + packDir.replace(/\\/g, '/') + '/' + file;
}

// ---------- 动画 ----------

function setAnim(name, opts = {}) {
  const state = resolveState(name);
  const def = cfg.states[state];
  anim = {
    state,
    frames: def.frames,
    fps: opts.fps || def.fps || 4,
    loop: opts.once ? false : def.loop !== false,
    idx: 0,
    acc: 0,
    onDone: opts.onDone || null,
    once: !!opts.once
  };
  frameEl.src = frameURL(def.frames[0]);
}

function stepAnim(dt) {
  if (anim.frames.length <= 1 && !anim.once) return;
  anim.acc += dt;
  const spf = 1 / anim.fps;
  while (anim.acc >= spf) {
    anim.acc -= spf;
    if (anim.idx + 1 >= anim.frames.length) {
      if (anim.loop) {
        anim.idx = 0;
      } else {
        const done = anim.onDone;
        anim.onDone = null;
        if (done) { done(); return; }
        return;
      }
    } else {
      anim.idx++;
    }
    frameEl.src = frameURL(anim.frames[anim.idx]);
  }
}

// 一次性动作,播完回到当前模式的基础动画
function playOnce(name, after) {
  setAnim(name, {
    once: true,
    onDone: () => {
      baseAnim();
      if (after) after();
    }
  });
}

function baseAnim() {
  if (mode === 'sleep') setAnim('sleep');
  else if (mode === 'walk') setAnim('walk');
  else if (mode === 'drag') setAnim('drag');
  else if (mode === 'fall') setAnim('fall');
  else setAnim('idle');
}

// ---------- 声音 ----------

function playSound(key) {
  const files = cfg.sounds && cfg.sounds[key];
  if (!Array.isArray(files) || !files.length) return;
  const audio = new Audio(frameURL(rand(files)));
  audio.volume = 0.6;
  audio.play().catch(() => {});
}

// ---------- 气泡 ----------

function showBubble(text, ms = 2800) {
  if (!text) return;
  bubbleEl.textContent = text;
  bubbleEl.classList.remove('hidden');
  positionBubble();
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubbleEl.classList.add('hidden'), ms);
}

function positionBubble() {
  if (bubbleEl.classList.contains('hidden')) return;
  const bw = bubbleEl.offsetWidth, bh = bubbleEl.offsetHeight;
  let bx = x + petW / 2 - 24;
  let by = y - bh - 14;
  bx = Math.max(6, Math.min(W - bw - 6, bx));
  by = Math.max(6, by);
  bubbleEl.style.left = bx + 'px';
  bubbleEl.style.top = by + 'px';
}

function speak(key, opts = {}) {
  const text = lineFor(key);
  if (!text) return;
  showBubble(text, opts.ms);
  if (!opts.silentAnim && mode !== 'drag' && mode !== 'fall') playOnce('speak');
  playSound(key);
}

// ---------- 模式切换 ----------

function setMode(m) {
  mode = m;
  baseAnim();
}

function wake(reason) {
  if (mode !== 'sleep') return;
  manualSleep = false;
  clearInterval(sleepBubbleTimer);
  setMode('idle');
  playOnce('stretch', () => speak('wake'));
}

function goSleep(manual) {
  if (mode === 'sleep' || mode === 'drag' || mode === 'fall') return;
  manualSleep = !!manual;
  speak('sleep', { silentAnim: true });
  setMode('sleep');
  clearInterval(sleepBubbleTimer);
  sleepBubbleTimer = setInterval(() => {
    if (mode === 'sleep') showBubble('💤', 2000);
  }, 6000);
}

// ---------- 空闲行为(活泼的关键) ----------

function scheduleIdle(minS = 4, maxS = 10) {
  nextIdleAct = performance.now() + (minS + Math.random() * (maxS - minS)) * 1000;
}

function pickIdleAction() {
  // 跟随模式下不乱跑;番茄钟期间保持安静,只眨眼
  if (following || pomodoroEnd) {
    playOnce('blink');
    scheduleIdle();
    return;
  }
  const r = Math.random();
  if (r < 0.3) {
    playOnce('blink');
  } else if (r < 0.6) {
    // 随机散步,偶尔跑一大段
    const far = Math.random() < 0.25;
    const range = far ? W * 0.6 : 220;
    walkTarget = Math.max(0, Math.min(W - petW, x + (Math.random() * 2 - 1) * range));
    if (Math.abs(walkTarget - x) > 30) setMode('walk');
  } else if (r < 0.72) {
    // 闲聊偶尔换成一言,更有新鲜感
    if (Math.random() < 0.3) {
      hitokotoLine().then(t => { if (mode === 'idle') showBubble(t, 5000); });
    } else {
      speak('idlechat');
    }
  } else if (r < 0.84) {
    playOnce('stretch');
  }
  // 其余概率:发呆,什么也不做
  scheduleIdle();
}

// ---------- 互动:点击 / 连戳 / 双击 ----------

function handleClick() {
  wake('click');
  clickCount++;
  clearTimeout(clickTimer);
  if (clickCount >= 2) {
    clickCount = 0;
    // 双击:开心地蹦一下
    vy = -620;
    vx = facing * 120;
    thrown = false;
    setMode('fall');
    setAnim('happy');
    speak('doubleclick', { silentAnim: true });
    return;
  }
  clickTimer = setTimeout(() => {
    clickCount = 0;
    // 连戳检测:2 秒内 4 次以上 → 头晕生气
    const now = Date.now();
    pokeTimes = pokeTimes.filter(t => now - t < 2000);
    pokeTimes.push(now);
    if (pokeTimes.length >= 4) {
      pokeTimes = [];
      playOnce('dizzy');
      showBubble(lineFor('angry'));
      playSound('angry');
    } else {
      playOnce('poke');
      showBubble(lineFor('click'));
      playSound('click');
    }
  }, 260);
}

// ---------- 互动:抚摸(在宠物身上来回滑动) ----------

function trackPetting(mx) {
  const now = performance.now();
  if (now < petCooldownUntil || dragging || mode === 'fall') return;
  petStrokes = petStrokes.filter(s => now - s.t < 1400);
  const last = petStrokes[petStrokes.length - 1];
  const dir = last ? Math.sign(mx - last.x) : 0;
  petStrokes.push({ t: now, x: mx, dir });
  let changes = 0, dist = 0;
  for (let i = 1; i < petStrokes.length; i++) {
    dist += Math.abs(petStrokes[i].x - petStrokes[i - 1].x);
    if (petStrokes[i].dir && petStrokes[i - 1].dir && petStrokes[i].dir !== petStrokes[i - 1].dir) changes++;
  }
  if (changes >= 3 && dist > 120) {
    petStrokes = [];
    petCooldownUntil = now + 5000;
    wake('pet');
    playOnce('happy');
    showBubble('❤ ' + (lineFor('pet') || ''));
    playSound('pet');
  }
}

// ---------- 互动:喂食 ----------

function feed() {
  wake('feed');
  showBubble('🍙');
  setTimeout(() => {
    playOnce('eat', () => playOnce('happy'));
    showBubble(lineFor('feed'));
    playSound('feed');
  }, 700);
}

// ---------- 联网内容:一言 / 天气 ----------

async function hitokotoLine() {
  const r = await api.hitokoto();
  return r && r.text ? `「${r.text}」${r.from ? ' ——《' + r.from + '》' : ''}` : '网络不太好,一言拿不到了喵……';
}

async function weatherLine() {
  const r = await api.weather();
  return r ? '现在天气:' + r : '喵……天气服务器好像睡着了,待会再问我吧。';
}

function tellAsync(promise) {
  showBubble('🤔 …', 8000);
  promise.then(t => showBubble(t, 6000));
}

// ---------- 小游戏 ----------

function playRPS(userKey) {
  const RPS = { rock: '✊石头', scissors: '✌️剪刀', paper: '🖐️布' };
  const beats = { rock: 'scissors', scissors: 'paper', paper: 'rock' };
  const me = rand(Object.keys(RPS));
  let result, animName;
  if (me === userKey) {
    result = '平局!再来再来!';
    animName = 'poke';
  } else if (beats[userKey] === me) {
    rpsScore.lose++;
    result = '你赢啦……哼,下次不会让你了!';
    animName = 'dizzy';
  } else {
    rpsScore.win++;
    result = '我赢咯~嘿嘿!';
    animName = 'happy';
  }
  playOnce(animName);
  return `你出${RPS[userKey]},我出${RPS[me]}\n${result}(我 ${rpsScore.win} 胜 ${rpsScore.lose} 负)`;
}

function fortuneLine() {
  const d = new Date();
  const seed = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  const rng = n => {
    const v = Math.sin(seed * 37 + n * 101) * 10000;
    return v - Math.floor(v);
  };
  const GOOD = ['摸鱼', '喝奶茶', '早点下班', '写代码', '听歌', '散步', '开始新计划', '整理桌面', '夸自己'];
  const BAD = ['加班', '熬夜', '开会', '背锅', '纠结', '吃太撑', '和杠精争论'];
  const stars = '★'.repeat(1 + Math.floor(rng(1) * 5)).padEnd(5, '☆');
  return `今日运势 ${stars}\n宜:${GOOD[Math.floor(rng(2) * GOOD.length)]}\n忌:${BAD[Math.floor(rng(3) * BAD.length)]}`;
}

// ---------- 跟随 / 番茄钟 ----------

function setFollow(on) {
  if (following === on) return;
  following = on;
  speak(on ? 'follow_start' : 'follow_stop');
}

function togglePomodoro() {
  if (pomodoroEnd) {
    pomodoroEnd = 0;
    showBubble('番茄钟取消啦,想专注了再叫我~');
    return;
  }
  pomodoroEnd = Date.now() + 25 * 60000;
  playOnce('notify');
  showBubble('🍅 ' + lineFor('pomodoro_start'), 4000);
}

// ---------- 强提醒:宠物把工作窗口推走 ----------

const REMINDER_UI = {
  water: {
    icon: '💧', kicker: '补水时间', title: '先把工作放一放',
    done: '我喝过水了', followup: '这才对嘛，继续保持水分充足~'
  },
  sit: {
    icon: '🧘', kicker: '活动时间', title: '该离开椅子一会儿了',
    done: '我起来活动了', followup: '肩膀转一转，走两步再回来~'
  }
};

function startReminderScene(data) {
  if (reminderActive) {
    queuedReminder = data;
    return;
  }
  if (!settings.reminderAnimation && !data.preview) {
    wake('reminder');
    playOnce('notify');
    showBubble('⏰ ' + data.text, 5000);
    playSound('notify');
    return;
  }

  const ui = REMINDER_UI[data.type] || REMINDER_UI.water;
  reminderActive = true;
  reminderData = data;
  pressing = false;
  dragging = false;
  closeMenu();
  closeChat();
  clearTimeout(bubbleTimer);
  bubbleEl.classList.add('hidden');
  if (mode === 'sleep') {
    manualSleep = false;
    clearInterval(sleepBubbleTimer);
  }
  mode = 'reminder';
  setAnim('notify');

  reminderScene.dataset.type = data.type;
  reminderIcon.textContent = ui.icon;
  reminderKicker.textContent = ui.kicker;
  reminderTitle.textContent = ui.title;
  reminderMessage.textContent = data.text;
  reminderDone.textContent = ui.done;
  reminderTimeout.textContent = '30 秒后自动收起 · 按 Esc 跳过';
  reminderPetFrame.src = frameEl.src;
  const artFacing = cfg.facing === 'left' ? -1 : 1;
  reminderPetFrame.style.transform = -1 * artFacing < 0 ? 'scaleX(-1)' : '';
  petEl.classList.add('reminder-hidden');
  reminderScene.classList.remove('hidden', 'active', 'leaving');
  api.setIgnore(false);
  api.setFocusable(true);
  mouseOverPet = true;

  // 两帧后开始位移，确保浏览器先画出“尚未被推开”的窗口。
  requestAnimationFrame(() => requestAnimationFrame(() => {
    reminderScene.classList.add('active');
    reminderDone.focus({ preventScroll: true });
  }));

  let seconds = 30;
  clearInterval(reminderCountdownTimer);
  reminderCountdownTimer = setInterval(() => {
    seconds--;
    reminderTimeout.textContent = `${Math.max(0, seconds)} 秒后自动收起 · 按 Esc 跳过`;
  }, 1000);
  clearTimeout(reminderTimer);
  reminderTimer = setTimeout(() => finishReminder('skip'), 30000);
  playSound('notify');
}

function finishReminder(action) {
  if (!reminderActive) return;
  const finished = reminderData;
  const ui = REMINDER_UI[finished.type] || REMINDER_UI.water;
  clearTimeout(reminderTimer);
  clearInterval(reminderCountdownTimer);
  reminderScene.classList.remove('active');
  reminderScene.classList.add('leaving');
  api.reminderAction({ type: finished.type, action, preview: !!finished.preview });

  setTimeout(() => {
    reminderScene.classList.add('hidden');
    reminderScene.classList.remove('leaving');
    petEl.classList.remove('reminder-hidden');
    reminderActive = false;
    reminderData = null;
    mode = 'idle';
    baseAnim();
    scheduleIdle(3, 7);
    api.setFocusable(false);
    updateIgnore(lastMouseX, lastMouseY);
    if (action === 'snooze') showBubble('好，10 分钟后我再来搬一次~', 4000);
    else if (action === 'done') {
      playOnce('happy');
      showBubble(ui.followup, 4000);
    }
    if (queuedReminder) {
      const next = queuedReminder;
      queuedReminder = null;
      setTimeout(() => startReminderScene(next), 700);
    }
  }, 650);
}

reminderDone.addEventListener('click', () => finishReminder('done'));
reminderSnooze.addEventListener('click', () => finishReminder('snooze'));
reminderSkip.addEventListener('click', () => finishReminder('skip'));

document.addEventListener('keydown', e => {
  if (reminderActive && e.key === 'Escape') {
    e.preventDefault();
    finishReminder('skip');
  }
});

// ---------- 聊天输入框 ----------

function openChat() {
  wake('chat');
  chatOpen = true;
  api.setIgnore(false);
  api.setFocusable(true);
  chatEl.classList.remove('hidden');
  const cw = chatEl.offsetWidth, ch = chatEl.offsetHeight;
  chatEl.style.left = Math.max(6, Math.min(W - cw - 6, x + petW + 10)) + 'px';
  chatEl.style.top = Math.max(6, Math.min(H - ch - 6, y + petH - ch)) + 'px';
  chatInput.value = '';
  chatInput.focus();
}

function closeChat() {
  if (!chatOpen) return;
  chatOpen = false;
  chatEl.classList.add('hidden');
  api.setFocusable(false);
  updateIgnore(lastMouseX, lastMouseY);
}

chatInput.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeChat(); return; }
  if (e.key !== 'Enter') return;
  const text = chatInput.value.trim();
  chatInput.value = '';
  if (text) chatReply(text);
});

// 规则式回复:关键词 → 台词或动作
function chatReply(text) {
  const rules = [
    [/猜拳/, () => '出「石头 / 剪刀 / 布」跟我打一局!'],
    [/石头/, () => playRPS('rock')],
    [/剪刀/, () => playRPS('scissors')],
    [/布/, () => playRPS('paper')],
    [/(你好|哈喽|嗨|hi|hello)/i, () => { playOnce('happy'); return rand(['你好呀!', '嗨嗨~今天过得怎么样?']); }],
    [/(你是谁|叫什么|名字)/, () => `我是${cfg.name || '你的桌宠'},最可爱的那只!`],
    [/(几点|时间)/, () => {
      const d = new Date();
      return `现在是 ${d.getHours()} 点 ${String(d.getMinutes()).padStart(2, '0')} 分~`;
    }],
    [/天气/, () => { tellAsync(weatherLine()); return null; }],
    [/(一言|语录|名言)/, () => { tellAsync(hitokotoLine()); return null; }],
    [/(笑话|好笑|无聊)/, () => { playOnce('happy'); return rand(JOKES); }],
    [/(运势|抽签|签)/, fortuneLine],
    [/(抛硬币|硬币)/, () => '🪙 ' + rand(['正面!', '反面!'])],
    [/(骰子|色子)/, () => `🎲 掷出了 ${1 + Math.floor(Math.random() * 6)} 点!`],
    [/(睡觉|晚安)/, () => { closeChat(); goSleep(true); return null; }],
    [/(饿|吃饭|开饭)/, () => { feed(); return null; }],
    [/(跟我走|跟着我|跟上)/, () => { setFollow(true); return null; }],
    [/(别跟|停下|待着|回去)/, () => { setFollow(false); return null; }],
    [/(可爱|喜欢你|爱你|真棒|好乖|厉害)/, () => { playOnce('happy'); return lineFor('chat_praise'); }],
    [/(笨|傻|讨厌|坏|丑)/, () => { playOnce('poke'); return lineFor('chat_insult'); }],
    [/(再见|拜拜|关闭)/, () => { closeChat(); return '拜拜~想我了再来找我!'; }]
  ];
  for (const [re, fn] of rules) {
    if (re.test(text)) {
      const reply = fn(text);
      if (reply) { showBubble(reply, 5000); playSound('click'); }
      return;
    }
  }
  // 规则没命中:配置了 AI 就交给 AI;AI 失败/未配置回落到免费本地台词
  if (settings.aiEnabled && settings.aiApiKey) {
    tellAsync(api.aiChat(text).then(r => {
      if (r && r.reply) return r.reply;
      if (r && r.error) return 'AI 出错了:' + r.error;
      return lineFor('chat_fallback');
    }));
    return;
  }
  if (Math.random() < 0.3) tellAsync(hitokotoLine());
  else { playOnce('speak'); showBubble(lineFor('chat_fallback'), 4000); }
}

// ---------- 主循环 ----------

let lastT = performance.now();

function tick(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;

  stepAnim(dt);

  if (reminderActive) {
    reminderPetFrame.src = frameEl.src;
    requestAnimationFrame(tick);
    return;
  }

  if (mode === 'walk') {
    const dir = Math.sign(walkTarget - x);
    facing = dir || facing;
    x += dir * WALK_SPEED * dt;
    if (Math.abs(walkTarget - x) < 4) {
      x = walkTarget;
      setMode('idle');
      scheduleIdle(2, 6);
    }
  } else if (mode === 'fall') {
    vy += GRAVITY * dt;
    x += vx * dt;
    y += vy * dt;
    // 墙壁反弹
    if (x < 0) { x = 0; vx = -vx * 0.6; }
    if (x > W - petW) { x = W - petW; vx = -vx * 0.6; }
    // 落地
    if (y >= floorY()) {
      y = floorY();
      if (Math.abs(vy) > 320) {
        vy = -vy * BOUNCE;
        vx *= 0.7;
        playOnce('land');
      } else {
        vy = 0; vx = 0;
        setMode('idle');
        playOnce('land', () => { if (thrown) { speak('drop'); thrown = false; } });
        scheduleIdle(2, 5);
      }
    }
  } else if (mode === 'idle') {
    // 跟随模式:离鼠标远了就走过去
    if (following && !chatOpen) {
      const target = Math.max(0, Math.min(W - petW, lastMouseX - petW / 2));
      if (Math.abs(target - x) > 120) {
        walkTarget = target;
        setMode('walk');
      }
    }
    if (!chatOpen && now >= nextIdleAct) pickIdleAction();
  }

  // 番茄钟到点
  if (pomodoroEnd && Date.now() >= pomodoroEnd) {
    pomodoroEnd = 0;
    wake('pomodoro');
    playOnce('happy');
    showBubble('🍅 ' + lineFor('pomodoro_done'), 6000);
    api.notify('🍅 番茄钟完成', '25 分钟专注结束,休息一下吧!');
  }

  render();
  requestAnimationFrame(tick);
}

function render() {
  petEl.style.transform = `translate(${x}px, ${y}px)`;
  const artFacing = cfg.facing === 'left' ? -1 : 1;
  frameEl.style.transform = facing * artFacing < 0 ? 'scaleX(-1)' : '';
  positionBubble();
}

// ---------- 鼠标穿透控制 ----------

function petRect() {
  return { l: x - 4, t: y - 4, r: x + petW + 4, b: y + petH + 4 };
}

function updateIgnore(mx, my) {
  const rct = petRect();
  const over = (mx >= rct.l && mx <= rct.r && my >= rct.t && my <= rct.b);
  const interactive = over || dragging || menuOpen || chatOpen || reminderActive;
  if (interactive !== mouseOverPet) {
    mouseOverPet = interactive;
    api.setIgnore(!interactive);
  }
  return over;
}

// ---------- 鼠标事件 ----------

document.addEventListener('mousemove', e => {
  lastMouseX = e.clientX;
  lastMouseY = e.clientY;
  const over = updateIgnore(e.clientX, e.clientY);

  if (pressing && !dragging) {
    if (Math.hypot(e.clientX - pressX, e.clientY - pressY) > 6) {
      dragging = true;
      thrown = false;
      wake('drag');
      petEl.classList.add('grabbing');
      setMode('drag');
      playSound('drag');
    }
  }
  if (dragging) {
    x = e.clientX - grabDX;
    y = e.clientY - grabDY;
    dragSamples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    if (dragSamples.length > 6) dragSamples.shift();
    return;
  }

  if (over) {
    trackPetting(e.clientX);
  }

  // 空闲时看向鼠标
  if (mode === 'idle' && Math.abs(e.clientX - (x + petW / 2)) < 260) {
    facing = e.clientX >= x + petW / 2 ? 1 : -1;
  }
});

// 滚轮搓它 → 头晕
document.addEventListener('wheel', e => {
  const rct = petRect();
  const onPet = e.clientX >= rct.l && e.clientX <= rct.r && e.clientY >= rct.t && e.clientY <= rct.b;
  if (onPet && performance.now() > wheelCooldown && mode !== 'drag' && mode !== 'fall') {
    wheelCooldown = performance.now() + 2500;
    wake('wheel');
    playOnce('dizzy');
    showBubble(lineFor('wheel'));
  }
});

document.addEventListener('mousedown', e => {
  // 点在菜单里不能先把菜单藏掉,否则 click 事件永远到不了菜单项
  if (menuEl.contains(e.target)) return;
  closeMenu();
  if (chatOpen && !chatEl.contains(e.target)) closeChat();
  const rct = petRect();
  const onPet = e.clientX >= rct.l && e.clientX <= rct.r && e.clientY >= rct.t && e.clientY <= rct.b;
  if (!onPet || e.button !== 0) return;
  pressing = true;
  pressX = e.clientX; pressY = e.clientY;
  grabDX = e.clientX - x; grabDY = e.clientY - y;
  dragSamples = [{ t: performance.now(), x: e.clientX, y: e.clientY }];
});

document.addEventListener('mouseup', e => {
  if (!pressing) return;
  pressing = false;
  petEl.classList.remove('grabbing');
  if (dragging) {
    dragging = false;
    // 用最近的移动样本估算抛出速度
    const a = dragSamples[0], b = dragSamples[dragSamples.length - 1];
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    vx = (b.x - a.x) / dt;
    vy = (b.y - a.y) / dt;
    const speed = Math.hypot(vx, vy);
    vx = Math.max(-1600, Math.min(1600, vx));
    vy = Math.max(-1600, Math.min(1600, vy));
    setMode('fall');
    if (speed > THROW_SPEAK_V) { thrown = true; speak('throw', { silentAnim: true }); }
  } else {
    handleClick();
  }
  updateIgnore(e.clientX, e.clientY);
});

document.addEventListener('contextmenu', e => {
  const rct = petRect();
  const onPet = e.clientX >= rct.l && e.clientX <= rct.r && e.clientY >= rct.t && e.clientY <= rct.b;
  if (onPet || menuOpen) {
    e.preventDefault();
    if (onPet) openMenu(e.clientX, e.clientY);
  }
});

// ---------- 右键菜单 ----------

async function openMenu(mx, my) {
  const packs = await api.listPacks();
  menuOpen = true;
  api.setIgnore(false);

  const check = v => `<span class="check">${v ? '✔' : ''}</span>`;
  const packItems = packs.map(p =>
    `<div class="mi" data-act="pack" data-id="${p.id}">${check(cfg.__id === p.id)}${p.name}</div>`
  ).join('');
  const scaleItems = [[0.75, '小'], [1, '中'], [1.5, '大']].map(([v, label]) =>
    `<div class="mi" data-act="scale" data-v="${v}">${check(settings.scale === v)}${label}</div>`
  ).join('');

  const pomoLeft = pomodoroEnd ? Math.max(1, Math.ceil((pomodoroEnd - Date.now()) / 60000)) : 0;
  menuEl.innerHTML = `
    <div class="mi" data-act="talk">💬 和它说话…</div>
    <div class="mi" data-act="chat">🗨️ 随便聊聊</div>
    <div class="mi" data-act="hitokoto">✨ 来句一言</div>
    <div class="mi" data-act="weather">⛅ 今天天气</div>
    <div class="mi">🎮 小游戏 ▸<div class="sub">
      <div class="mi" data-act="rps" data-v="rock">✊ 石头</div>
      <div class="mi" data-act="rps" data-v="scissors">✌️ 剪刀</div>
      <div class="mi" data-act="rps" data-v="paper">🖐️ 布</div>
      <div class="sep"></div>
      <div class="mi" data-act="coin">🪙 抛硬币</div>
      <div class="mi" data-act="dice">🎲 掷骰子</div>
      <div class="mi" data-act="fortune">🔮 今日运势</div>
    </div></div>
    <div class="sep"></div>
    <div class="mi" data-act="feed">🍙 喂食</div>
    <div class="mi" data-act="sleep">${mode === 'sleep' ? '☀️ 叫醒它' : '🌙 让它睡觉'}</div>
    <div class="mi" data-act="follow">${check(following)}🚶 跟我走</div>
    <div class="mi" data-act="pomodoro">🍅 番茄钟${pomoLeft ? `(剩 ${pomoLeft} 分,点击取消)` : '(专注 25 分钟)'}</div>
    <div class="sep"></div>
    <div class="mi">🎨 素材包 ▸<div class="sub">${packItems}</div></div>
    <div class="mi">📏 大小 ▸<div class="sub">${scaleItems}</div></div>
    <div class="mi">⏰ 提醒 ▸<div class="sub">
      <div class="mi" data-act="water">${check(settings.waterReminder)}喝水提醒</div>
      <div class="mi" data-act="sit">${check(settings.sitReminder)}久坐提醒</div>
      <div class="mi" data-act="chime">${check(settings.chimeHourly)}整点报时</div>
    </div></div>
    <div class="sep"></div>
    <div class="mi" data-act="importPack">📥 导入素材包…</div>
    <div class="mi" data-act="openPacks">📂 素材包文件夹</div>
    <div class="mi" data-act="openSettings">⚙️ 设置</div>
    <div class="mi" data-act="hide">🫥 隐藏(托盘召回)</div>
    <div class="mi" data-act="quit">👋 退出</div>`;

  menuEl.classList.remove('hidden');
  let left = Math.min(mx, W - menuEl.offsetWidth - 8);
  let top = Math.min(my, H - menuEl.offsetHeight - 8);
  menuEl.style.left = left + 'px';
  menuEl.style.top = top + 'px';
  // 子菜单空间不够时向左弹出
  const openLeft = left + menuEl.offsetWidth + 140 > W;
  menuEl.querySelectorAll('.sub').forEach(s => s.classList.toggle('open-left', openLeft));
}

function closeMenu() {
  if (!menuOpen) return;
  menuOpen = false;
  menuEl.classList.add('hidden');
}

menuEl.addEventListener('click', e => {
  const item = e.target.closest('.mi[data-act]');
  if (!item) return;
  const act = item.dataset.act;
  closeMenu();
  switch (act) {
    case 'talk': openChat(); break;
    case 'chat': speak('idlechat'); break;
    case 'hitokoto': tellAsync(hitokotoLine()); break;
    case 'weather': tellAsync(weatherLine()); break;
    case 'rps': showBubble(playRPS(item.dataset.v), 5000); break;
    case 'coin': playOnce('poke'); showBubble('🪙 ' + rand(['正面!', '反面!'])); break;
    case 'dice': playOnce('poke'); showBubble(`🎲 掷出了 ${1 + Math.floor(Math.random() * 6)} 点!`); break;
    case 'fortune': playOnce('speak'); showBubble(fortuneLine(), 6000); break;
    case 'follow': setFollow(!following); break;
    case 'pomodoro': togglePomodoro(); break;
    case 'chime': api.updateSettings({ chimeHourly: !settings.chimeHourly }); break;
    case 'feed': feed(); break;
    case 'sleep': mode === 'sleep' ? wake('menu') : goSleep(true); break;
    case 'pack': api.updateSettings({ pack: item.dataset.id }); break;
    case 'scale': api.updateSettings({ scale: parseFloat(item.dataset.v) }); break;
    case 'water': api.updateSettings({ waterReminder: !settings.waterReminder }); break;
    case 'sit': api.updateSettings({ sitReminder: !settings.sitReminder }); break;
    case 'importPack': api.importPack().then(r => showBubble(r.msg, 5000)); break;
    case 'openPacks': api.openPacks(); break;
    case 'openSettings': api.openSettingsWindow(); break;
    case 'hide': api.hide(); break;
    case 'quit': api.quit(); break;
  }
});

// ---------- 素材包加载 ----------

function applyPack(pack) {
  cfg = pack.config;
  cfg.__id = pack.id;
  packDir = pack.dir;

  // 预加载所有帧,避免切帧闪烁
  images = {};
  for (const [state, def] of Object.entries(cfg.states)) {
    images[state] = def.frames.map(f => {
      const img = new Image();
      img.src = frameURL(f);
      return img;
    });
  }
  applyScale();
  baseAnim();
}

function applyScale() {
  const fs = cfg.frameSize || { width: 128, height: 128 };
  const bottom = y + petH;
  petW = Math.round(fs.width * settings.scale);
  petH = Math.round(fs.height * settings.scale);
  petEl.style.width = petW + 'px';
  petEl.style.height = petH + 'px';
  y = Math.min(bottom - petH, floorY());
  x = Math.max(0, Math.min(W - petW, x));
}

// ---------- 提醒 / 睡眠 / 设置事件 ----------

api.onReminder(data => startReminderScene(data));

api.onSysIdle(sec => {
  if (sec >= SLEEP_IDLE_SEC && mode === 'idle' && !pomodoroEnd) goSleep(false);
});

api.onChime(hour => {
  wake('chime');
  playOnce('notify');
  showBubble(lineFor('chime').replace('{hour}', hour), 5000);
});

// 本地 API /say、导入结果等来自主进程的转述
api.onSay(text => {
  if (!text) return;
  wake('say');
  playOnce('notify');
  showBubble(text, 6000);
});

api.onPack(pack => {
  applyPack(pack);
  showBubble('换上新衣服啦!');
});

api.onSettings(s => {
  const oldScale = settings && settings.scale;
  settings = s;
  if (cfg && s.scale !== oldScale) applyScale();
});

// ---------- 问候 ----------

function greet() {
  const h = new Date().getHours();
  const key = h < 6 ? 'greeting_night'
    : h < 11 ? 'greeting_morning'
    : h < 18 ? 'greeting_afternoon'
    : h < 23 ? 'greeting_evening' : 'greeting_night';
  setTimeout(() => speak(key), 1200);
}

// ---------- 窗口尺寸 ----------

window.addEventListener('resize', () => {
  W = innerWidth; H = innerHeight;
  x = Math.max(0, Math.min(W - petW, x));
  if (mode !== 'drag' && mode !== 'fall') y = floorY();
});

// ---------- 启动 ----------

(async function init() {
  const data = await api.init();
  settings = data.settings;
  if (!data.pack) {
    console.error('没有可用素材包');
    return;
  }
  applyPack(data.pack);
  x = Math.round(W * 0.7);
  y = floorY();
  render();
  greet();
  scheduleIdle(3, 6);
  requestAnimationFrame(tick);
  api.ready();
})();
