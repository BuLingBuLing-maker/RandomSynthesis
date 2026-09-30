/* ============================================================
 *  随机大合成 · Suika Game（自定义形象版）
 *  基于「合成大奶娃」开源版改造：
 *   - 玩家开局前从相册为每一档上传一张形象图（11 档）
 *   - 上传图处理成透明底圆形贴图，替代默认水果贴图
 *   - 碰撞改为圆形（与圆形贴图吻合），不再依赖原作者轮廓脚本
 *   - 去掉对原作者在线服务的依赖
 *  物理：PBD（位置约束求解）—— 3 个子步 × 6 次迭代。
 *  玩法：相同形象接触即合成高一级形象；顶到警戒线超时判负。
 * ============================================================ */
(function () {
  'use strict';

  /* ---------------------------------------------------------
   *  常量
   * ------------------------------------------------------- */

  const W = 420;             // 逻辑宽度
  const H = 700;             // 逻辑高度
  const WALL = 10;           // 左右墙厚
  const DROP_Y = 74;         // 待投放位置的高度
  const DANGER_Y = 142;      // 警戒线

  const GRAVITY   = 2600;    // px/s²
  const SUBSTEPS  = 3;       // 每帧物理子步
  const ITER      = 6;       // 每个子步的约束迭代次数
  const DROP_MS   = 360;     // 两次投放的最小间隔
  const OVER_LIMIT = 1.5;    // 越线持续多少秒判负
  const REST_SPEED = 140;    // 线上方且速度低于它才算“卡住”
  const REST_SPEED2 = REST_SPEED * REST_SPEED;

  const MAX_TIER  = 10;      // 大西瓜的索引
  const MAX_BONUS = 100;     // 两个大西瓜相撞的奖励分
  const MERGE_PAD = 0.8;     // 合成判定的接触容差（px）

  /* —— Q 弹手感 —— */
  const RESTITUTION      = 0.38;
  const WALL_RESTITUTION = 0.45;
  const REST_THRESHOLD   = 55;
  const FRICTION         = 0.955;
  const SQUASH_DECAY     = 9;
  const SQUASH_MAX       = 0.30;

  /* 档位：索引越大越大。玩家上传图会覆盖默认贴图。
     c1/c2: 贴图缺失时的程序化配色
     pc1/pc2: 粒子/汁水颜色 */
  const ASSET_FILL = 0.92;

  const FRUITS = [
    { name: '一档',   r: 17,  c1: '#c084f5', c2: '#7a3fb0', line: 'rgba(74,26,120,.35)',
      file: 'assets/fruits/01.png',      pc1: '#e9c466', pc2: '#b8903a' },
    { name: '二档',   r: 23,  c1: '#ff8a99', c2: '#c62346', line: 'rgba(120,10,40,.35)',
      file: 'assets/fruits/02.png',      pc1: '#ffe684', pc2: '#d8b44f' },
    { name: '三档',   r: 31,  c1: '#ffc06a', c2: '#e0741a', line: 'rgba(140,62,0,.32)',
      file: 'assets/fruits/03.png',      pc1: '#fdd865', pc2: '#cfa63f' },
    { name: '四档',   r: 39,  c1: '#fff285', c2: '#e0b000', line: 'rgba(140,110,0,.32)',
      file: 'assets/fruits/04.png',      pc1: '#f6cd63', pc2: '#c9a040' },
    { name: '五档',   r: 48,  c1: '#b9e05a', c2: '#5d8c1c', line: 'rgba(60,90,10,.32)',
      file: 'assets/fruits/05.png',      pc1: '#c4a559', pc2: '#94793c' },
    { name: '六档',   r: 58,  c1: '#ff8a66', c2: '#c62f28', line: 'rgba(120,20,10,.32)',
      file: 'assets/fruits/06.png',      pc1: '#fbd75a', pc2: '#cba63c' },
    { name: '七档',   r: 69,  c1: '#ffd0d0', c2: '#ea7f93', line: 'rgba(160,60,80,.3)',
      file: 'assets/fruits/07.png',      pc1: '#f7c45a', pc2: '#c99a3e' },
    { name: '八档',   r: 81,  c1: '#ffe07a', c2: '#c88a12', line: 'rgba(130,80,0,.32)',
      file: 'assets/fruits/08.png',      pc1: '#ffd37b', pc2: '#d1a252' },
    { name: '九档',   r: 94,  c1: '#f0e2c6', c2: '#9b7b4f', line: 'rgba(90,64,32,.35)',
      file: 'assets/fruits/09.png',      pc1: '#ffd771', pc2: '#d3a94e' },
    { name: '十档',   r: 108, c1: '#ff9d78', c2: '#c23a2c', line: 'rgba(120,24,16,.32)',
      file: 'assets/fruits/10.png',      pc1: '#ccab68', pc2: '#9c8047' },
    { name: '终极大', r: 124, c1: '#7ce878', c2: '#1c8a33', line: 'rgba(12,70,24,.4)',
      file: 'assets/fruits/11.png',      pc1: '#eece9b', pc2: '#c0a271' }
  ];

  /* 合成出 tier 的得分（三角数） */
  const MERGE_SCORE = [0, 1, 3, 6, 10, 15, 21, 28, 36, 45, 55];

  /* 新形象的掉落权重（越小越常见） */
  const SPAWN_TIERS = [0, 1, 2, 3, 4];
  const SPAWN_WEIGHTS = [0.28, 0.24, 0.20, 0.16, 0.12];

  const BEST_KEY = 'randomsyn.best.v1';
  const MUTE_KEY = 'randomsyn.mute.v1';

  /* ---------------------------------------------------------
   *  DOM
   * ------------------------------------------------------- */

  const canvas    = document.getElementById('game');
  const ctx       = canvas.getContext('2d');
  const stage     = document.getElementById('stage');
  const overlay   = document.getElementById('overlay');
  const scoreEl   = document.getElementById('score');
  const bestEl    = document.getElementById('best');
  const finalScoreEl = document.getElementById('finalScore');
  const finalBestEl  = document.getElementById('finalBest');
  const nextCanvas = document.getElementById('next');
  const nextCtx    = nextCanvas.getContext('2d');
  const chainCanvas = document.getElementById('chain');
  const chainCtx    = chainCanvas.getContext('2d');
  const soundBtn   = document.getElementById('soundBtn');
  const resetBtn   = document.getElementById('resetBtn');
  const restartBtn = document.getElementById('restartBtn');
  const changeBtn  = document.getElementById('changeBtn');
  const changeTopBtn = document.getElementById('changeTopBtn');

  /* 玩家上传的贴图：dataURL 数组，长度 = FRUITS.length，未选为 null */
  let customImages = (window.__CUSTOM_IMAGES__ && window.__CUSTOM_IMAGES__.slice()) || null;

  /* ---------------------------------------------------------
   *  工具
   * ------------------------------------------------------- */

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const rand  = (a, b) => a + Math.random() * (b - a);

  const AVOID_REPEAT = true;

  function rollSpawnTier() {
    let r = Math.random(), acc = 0;
    for (let i = 0; i < SPAWN_TIERS.length; i++) {
      acc += SPAWN_WEIGHTS[i];
      if (r <= acc) return SPAWN_TIERS[i];
    }
    return SPAWN_TIERS[0];
  }

  function pickSpawnTier(avoid) {
    if (!AVOID_REPEAT || avoid === undefined) return rollSpawnTier();
    for (let i = 0; i < 6; i++) {
      const t = rollSpawnTier();
      if (t !== avoid) return t;
    }
    return rollSpawnTier();
  }

  /* ---------------------------------------------------------
   *  音效（WebAudio，无外部资源）
   * ------------------------------------------------------- */

  const Sound = {
    ctx: null,
    muted: localStorage.getItem(MUTE_KEY) === '1',

    ensure() {
      if (this.ctx) return this.ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { this.ctx = new AC(); } catch (e) { this.ctx = null; }
      return this.ctx;
    },

    tone(freq, freq2, dur, vol, type) {
      if (this.muted) return;
      const c = this.ensure();
      if (!c) return;
      if (c.state === 'suspended') c.resume();
      const t = c.currentTime;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (freq2 && freq2 !== freq) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
      }
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    },

    merge(tier) {
      const base = 240 * Math.pow(1.1225, tier * 2);
      this.tone(base, base * 1.7, 0.2, 0.16, 'sine');
      this.tone(base * 2, base * 3, 0.12, 0.06, 'triangle');
    },

    drop()   { this.tone(180, 120, 0.08, 0.05, 'sine'); },
    over()   { this.tone(420, 90, 0.7, 0.16, 'sawtooth'); },
    bonus()  { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, f, 0.22, 0.12, 'triangle'), i * 90)); }
  };

  function haptic(ms) {
    if (Sound.muted) return;
    if (navigator.vibrate) {
      try { navigator.vibrate(ms); } catch (e) { /* 忽略 */ }
    }
  }

  /* ---------------------------------------------------------
   *  画布尺寸
   * ------------------------------------------------------- */

  const view = { scale: 1, dpr: 1 };

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width  = Math.max(1, Math.round(rect.width  * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    view.dpr = dpr;
    view.scale = (rect.width * dpr) / W;
  }

  /* ---------------------------------------------------------
   *  游戏状态
   * ------------------------------------------------------- */

  const state = {
    balls: [],
    particles: [],
    floats: [],
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    pending: 0,
    next: 0,
    ready: true,
    cooldown: 0,
    aimX: W / 2,
    over: false,
    flash: 0
  };

  /* ---------------------------------------------------------
   *  碰撞形状：一律用圆形（与圆形贴图吻合）
   * ------------------------------------------------------- */

  const SHAPES = [];
  const UNIT_SHAPE = { rb: 1, parts: [[0, 0, 1]] };

  function shapeOf(tier) {
    const s = SHAPES[tier];
    if (s && s.parts && s.parts.length) return s;
    return UNIT_SHAPE;
  }

  function syncParts(b) {
    const c = Math.cos(b.angle), s = Math.sin(b.angle);
    const parts = b.parts, r = b.r;
    const wx = b.wx, wy = b.wy, ws = b.ws;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const ox = p[0] * r, oy = p[1] * r;
      wx[i] = b.x + ox * c - oy * s;
      wy[i] = b.y + ox * s + oy * c;
      ws[i] = p[2] * r;
    }
  }

  function makeBall(x, y, tier, vx, vy) {
    const r = FRUITS[tier].r;
    const m = r * r;
    const sh = shapeOf(tier);
    const n = sh.parts.length;
    const ball = {
      x, y, vx: vx || 0, vy: vy || 0,
      px: x, py: y,
      r, tier, angle: 0,
      mass: m, invMass: 1 / m,
      bornAt: performance.now(),
      overTime: 0,
      landed: false,
      dead: false,
      contacts: 0,
      pvx: 0, pvy: 0,
      sq: 0, sqA: 0,
      parts: sh.parts,
      rb: sh.rb * r,
      wx: new Float32Array(n),
      wy: new Float32Array(n),
      ws: new Float32Array(n)
    };
    syncParts(ball);
    return ball;
  }

  /* ---------------------------------------------------------
   *  物理
   * ------------------------------------------------------- */

  function stepPhysics(dt) {
    const balls = state.balls;
    const merges = [];
    const contacts = [];

    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      b.px = b.x;
      b.py = b.y;
      b.vy += GRAVITY * dt;
      b.pvx = b.vx;
      b.pvy = b.vy;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.contacts = 0;
      syncParts(b);
    }

    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (b.dead) continue;
        let pushL = 0, pushR = 0, pushFloor = 0, pushCeil = 0;
        const n = b.parts.length;
        for (let k = 0; k < n; k++) {
          const x = b.wx[k], y = b.wy[k], rr = b.ws[k];
          const l = WALL - (x - rr);
          if (l > pushL) pushL = l;
          const rgt = (x + rr) - (W - WALL);
          if (rgt > pushR) pushR = rgt;
          const dn = (y + rr) - (H - WALL);
          if (dn > pushFloor) pushFloor = dn;
          const up = -(y - rr);
          if (up > pushCeil) pushCeil = up;
        }
        if (pushL || pushR || pushFloor || pushCeil) {
          b.x += pushL - pushR;
          b.y += pushCeil - pushFloor;
          b.contacts++;
          if (it === 0) {
            if (pushL)     contacts.push({ ball: b, nx: 1,  ny: 0 });
            if (pushR)     contacts.push({ ball: b, nx: -1, ny: 0 });
            if (pushFloor) contacts.push({ ball: b, nx: 0,  ny: -1 });
            if (pushCeil)  contacts.push({ ball: b, nx: 0,  ny: 1 });
          }
          syncParts(b);
        }
      }

      for (let i = 0; i < balls.length; i++) {
        const a = balls[i];
        if (a.dead) continue;
        for (let j = i + 1; j < balls.length; j++) {
          const b = balls[j];
          if (b.dead || a.dead) continue;

          const cdx = b.x - a.x, cdy = b.y - a.y;
          const rbSum = a.rb + b.rb;
          if (cdx * cdx + cdy * cdy >= rbSum * rbSum) continue;

          const pa = a.parts.length, pb = b.parts.length;
          const brb = b.rb, arb = a.rb;
          let minGap = 1e9, bnx = 0, bny = 0;

          for (let m = 0; m < pa; m++) {
            const ax = a.wx[m], ay = a.wy[m], ar = a.ws[m];
            const ddx = b.x - ax, ddy = b.y - ay;
            const far = brb + ar;
            if (ddx * ddx + ddy * ddy >= far * far) continue;

            for (let k = 0; k < pb; k++) {
              const bx = b.wx[k], by = b.wy[k], br = b.ws[k];
              const dx = bx - ax, dy = by - ay;
              const sum = ar + br;
              const d2 = dx * dx + dy * dy;
              if (d2 >= sum * sum) continue;
              const d = Math.sqrt(d2);
              const gap = d - sum;
              if (gap < minGap) {
                minGap = gap;
                if (d < 1e-4) { bnx = 1; bny = 0; }
                else { bnx = dx / d; bny = dy / d; }
              }
            }
          }

          if (minGap > MERGE_PAD || minGap === 1e9) continue;

          if (a.tier === b.tier && it === 0) {
            a.dead = true;
            b.dead = true;
            merges.push([a, b]);
            continue;
          }

          if (minGap >= 0) continue;
          if (it === 0) contacts.push({ a: a, b: b, nx: bnx, ny: bny });
          const corr = Math.min(-minGap - 0.05, 4) * 0.9;
          if (corr <= 0) continue;
          const invSum = a.invMass + b.invMass;
          const wa = a.invMass / invSum;
          const wb = b.invMass / invSum;

          a.x -= bnx * corr * wa;  a.y -= bny * corr * wa;
          b.x += bnx * corr * wb;  b.y += bny * corr * wb;

          a.contacts++;
          b.contacts++;
          syncParts(a);
          syncParts(b);
        }
      }
    }

    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.dead) continue;
      let pushL = 0, pushR = 0, pushFloor = 0, pushCeil = 0;
      for (let k = 0; k < b.parts.length; k++) {
        const x = b.wx[k], y = b.wy[k], rr = b.ws[k];
        const l = WALL - (x - rr);         if (l > pushL) pushL = l;
        const rgt = (x + rr) - (W - WALL); if (rgt > pushR) pushR = rgt;
        const dn = (y + rr) - (H - WALL);  if (dn > pushFloor) pushFloor = dn;
        const up = -(y - rr);              if (up > pushCeil) pushCeil = up;
      }
      if (pushL || pushR || pushFloor || pushCeil) {
        b.x += pushL - pushR;
        b.y += pushCeil - pushFloor;
        b.contacts++;
        syncParts(b);
      }
    }

    const invDt = 1 / dt;
    for (let i = 0; i < balls.length; i++) {
      const b = balls[i];
      if (b.dead) continue;

      const dx = b.x - b.px;
      const dy = b.y - b.py;

      let vx = dx * invDt;
      let vy = dy * invDt;

      if (b.contacts > 0) vx *= FRICTION;
      if (b.sq > 0) b.sq = Math.max(0, b.sq - b.sq * SQUASH_DECAY * dt);

      b.vx = vx;
      b.vy = vy;
      b.angle += dx / b.r * 0.85;

      if (!b.landed) {
        if (b.contacts > 0 || performance.now() - b.bornAt > 900) b.landed = true;
      }
    }

    for (let k = 0; k < contacts.length; k++) {
      const ct = contacts[k];

      if (ct.ball) {
        const b = ct.ball;
        if (b.dead) continue;
        const vnPre = b.pvx * ct.nx + b.pvy * ct.ny;
        if (vnPre < -REST_THRESHOLD) {
          const vnPost = b.vx * ct.nx + b.vy * ct.ny;
          const target = -WALL_RESTITUTION * vnPre;
          const j = target - vnPost;
          if (j > 0) {
            b.vx += j * ct.nx;
            b.vy += j * ct.ny;
            squash(b, ct.nx, ct.ny, -vnPre);
          }
        }
      } else {
        const a = ct.a, b = ct.b;
        if (a.dead || b.dead) continue;
        const nx = ct.nx, ny = ct.ny;
        const vnPre = (a.pvx - b.pvx) * nx + (a.pvy - b.pvy) * ny;
        if (vnPre > REST_THRESHOLD) {
          const vnPost = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          const target = -RESTITUTION * vnPre;
          const j = (vnPost - target) / (a.invMass + b.invMass);
          if (j > 0) {
            a.vx -= j * a.invMass * nx;  a.vy -= j * a.invMass * ny;
            b.vx += j * b.invMass * nx;  b.vy += j * b.invMass * ny;
            squash(a, -nx, -ny, vnPre);
            squash(b, nx, ny, vnPre);
          }
        }
      }
    }

    if (merges.length) processMerges(merges);
  }

  function squash(b, nx, ny, speed) {
    const k = Math.min(SQUASH_MAX, speed / 1500);
    if (k <= b.sq) return;
    b.sq = k;
    b.sqA = Math.atan2(ny, nx);
  }

  function processMerges(merges) {
    for (let k = 0; k < merges.length; k++) {
      const a = merges[k][0];
      const b = merges[k][1];
      const mx = (a.x + b.x) * 0.5;
      const my = (a.y + b.y) * 0.5;
      const tier = a.tier;

      if (tier >= MAX_TIER) {
        addScore(MAX_BONUS, mx, my, '+' + MAX_BONUS);
        burst(mx, my, MAX_TIER, 34, 380);
        Sound.bonus();
        haptic(40);
        state.flash = 1;
      } else {
        const nt = tier + 1;
        const nb = makeBall(mx, my, nt, (a.vx + b.vx) * 0.5, (a.vy + b.vy) * 0.5 - 60);
        nb.x = clamp(nb.x, WALL + nb.r, W - WALL - nb.r);
        nb.y = Math.min(nb.y, H - WALL - nb.r);
        nb.px = nb.x;
        nb.py = nb.y;
        nb.landed = true;
        nb.popAt = performance.now();
        state.balls.push(nb);

        addScore(MERGE_SCORE[nt], mx, my, '+' + MERGE_SCORE[nt]);
        burst(mx, my, nt, 8 + nt * 2, 140 + nt * 22);
        Sound.merge(nt);
        haptic(6 + nt);
        if (nt === MAX_TIER) state.flash = 1;
      }
    }

    const alive = [];
    for (let i = 0; i < state.balls.length; i++) {
      if (!state.balls[i].dead) alive.push(state.balls[i]);
    }
    state.balls = alive;
  }

  /* ---------------------------------------------------------
   *  特效 & 计分
   * ------------------------------------------------------- */

  function burst(x, y, tier, n, speed) {
    const f = FRUITS[Math.min(tier, MAX_TIER)];
    const c1 = f.pc1 || f.c1;
    const c2 = f.pc2 || f.c2;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rand(speed * 0.25, speed);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 70,
        r: rand(2, 5.5),
        life: 1,
        decay: rand(1.3, 2.4),
        color: Math.random() < 0.5 ? c1 : c2
      });
    }
    if (state.particles.length > 420) state.particles.splice(0, state.particles.length - 420);
  }

  function addScore(n, x, y, text) {
    state.score += n;
    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(BEST_KEY, String(state.best));
      bestEl.textContent = state.best;
    }
    scoreEl.textContent = state.score;
    bump(scoreEl);
    if (x !== undefined) {
      state.floats.push({ x, y, text: text || ('+' + n), life: 1 });
    }
  }

  function bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  /* ---------------------------------------------------------
   *  投放 & 控制
   * ------------------------------------------------------- */

  function aimLimit(tier) {
    const r = FRUITS[tier].r * shapeOf(tier).rb;
    return [WALL + r + 0.5, W - WALL - r - 0.5];
  }

  function moveAim(x) {
    const [lo, hi] = aimLimit(state.pending);
    state.aimX = clamp(x, lo, hi);
  }

  function tryDrop() {
    if (state.over || !state.ready) return;
    const tier = state.pending;
    const [lo, hi] = aimLimit(tier);
    const x = clamp(state.aimX, lo, hi);

    const ball = makeBall(x, DROP_Y, tier, 0, 130);
    state.balls.push(ball);

    state.ready = false;
    state.cooldown = DROP_MS / 1000;
    state.pending = state.next;
    state.next = pickSpawnTier(state.pending);
    Sound.drop();
    drawNext();
    if (state.balls.length > 90) state.balls = state.balls.filter(b => !b.dead);
  }

  /* ---------------------------------------------------------
   *  判负
   * ------------------------------------------------------- */

  function checkGameOver(dt) {
    let danger = false;
    for (let i = 0; i < state.balls.length; i++) {
      const b = state.balls[i];
      if (b.dead || !b.landed) continue;
      const top = b.y - b.r;

      if (top < DANGER_Y) {
        danger = true;
        if (b.vx * b.vx + b.vy * b.vy < REST_SPEED2) {
          b.overTime += dt;
          if (b.overTime > OVER_LIMIT) { gameOver(); return; }
        } else {
          b.overTime = Math.max(0, b.overTime - dt * 2);
        }
      } else {
        b.overTime = Math.max(0, b.overTime - dt * 2);
        if (b.overTime > 0) danger = true;
      }
    }
    state.danger = danger;
  }

  function gameOver() {
    state.over = true;
    finalScoreEl.textContent = state.score;
    finalBestEl.textContent = state.best;
    overlay.classList.add('show');
    Sound.over();
    if (window.DanaiwaBoard && window.DanaiwaBoard.onGameOver) {
      window.DanaiwaBoard.onGameOver(state.score);
    }
  }

  function reset() {
    state.balls.length = 0;
    state.particles.length = 0;
    state.floats.length = 0;
    state.score = 0;
    state.over = false;
    state.ready = true;
    state.cooldown = 0;
    state.flash = 0;
    state.danger = false;
    state.aimX = W / 2;
    state.pending = pickSpawnTier();
    state.next = pickSpawnTier(state.pending);
    overlay.classList.remove('show');
    scoreEl.textContent = '0';
    bestEl.textContent = state.best;
    drawNext();
    Sound.ensure();
  }

  /* ---------------------------------------------------------
   *  绘制
   * ------------------------------------------------------- */

  function drawFruit(c, x, y, r, tier, angle, scale, squashShape) {
    const f = FRUITS[tier];
    const s = scale === undefined ? 1 : scale;

    c.save();
    c.translate(x, y);
    if (squashShape && squashShape.k > 0.004) {
      c.rotate(squashShape.a);
      c.scale(1 - squashShape.k, 1 + squashShape.k * 0.85);
      c.rotate(-squashShape.a);
    }
    if (s !== 1) c.scale(s, s);
    c.rotate(angle || 0);

    if (f.img) {
      const box = (r * 2) / ASSET_FILL;
      c.drawImage(f.img, -box / 2, -box / 2, box, box);
      c.restore();
      return;
    }

    /* 兜底：程序化圆形形象 */
    const g = c.createRadialGradient(-r * 0.34, -r * 0.40, r * 0.12, 0, 0, r * 1.12);
    g.addColorStop(0, f.c1);
    g.addColorStop(1, f.c2);
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fillStyle = g;
    c.fill();

    if (tier === MAX_TIER) {
      c.save();
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.clip();
      c.strokeStyle = 'rgba(10,60,20,.30)';
      c.lineWidth = r * 0.13;
      for (let k = -2; k <= 2; k++) {
        c.beginPath();
        c.ellipse(k * r * 0.42, 0, r * 0.16, r * 1.05, 0, 0, Math.PI * 2);
        c.stroke();
      }
      c.restore();
    } else if (tier === MAX_TIER - 1) {
      c.save();
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.clip();
      c.strokeStyle = 'rgba(20,110,45,.85)';
      c.lineWidth = r * 0.16;
      c.beginPath();
      c.arc(0, 0, r * 0.93, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }

    c.lineWidth = Math.max(1.4, r * 0.055);
    c.strokeStyle = f.line;
    c.beginPath();
    c.arc(0, 0, r - c.lineWidth * 0.5, 0, Math.PI * 2);
    c.stroke();

    c.beginPath();
    c.ellipse(-r * 0.34, -r * 0.40, r * 0.30, r * 0.19, -0.7, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,.55)';
    c.fill();

    if (r >= 20) {
      const eyeR = r * 0.135;
      const eyeX = r * 0.33;
      const eyeY = -r * 0.06;

      c.fillStyle = 'rgba(46,32,24,.88)';
      c.beginPath(); c.arc(-eyeX, eyeY, eyeR, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc( eyeX, eyeY, eyeR, 0, Math.PI * 2); c.fill();

      c.fillStyle = 'rgba(255,255,255,.9)';
      c.beginPath(); c.arc(-eyeX - eyeR * 0.3, eyeY - eyeR * 0.35, eyeR * 0.34, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc( eyeX - eyeR * 0.3, eyeY - eyeR * 0.35, eyeR * 0.34, 0, Math.PI * 2); c.fill();

      c.beginPath();
      c.arc(0, r * 0.08, r * 0.20, 0.18 * Math.PI, 0.82 * Math.PI);
      c.lineWidth = Math.max(1.2, r * 0.055);
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(46,32,24,.72)';
      c.stroke();

      c.fillStyle = 'rgba(255,120,120,.30)';
      c.beginPath(); c.ellipse(-r * 0.56, r * 0.16, r * 0.16, r * 0.11, 0, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse( r * 0.56, r * 0.16, r * 0.16, r * 0.11, 0, 0, Math.PI * 2); c.fill();
    } else {
      c.fillStyle = 'rgba(46,32,24,.85)';
      c.beginPath(); c.arc(-r * 0.3, -r * 0.06, r * 0.13, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc( r * 0.3, -r * 0.06, r * 0.13, 0, Math.PI * 2); c.fill();
    }

    c.restore();
  }

  function drawBoard() {
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#fffaf0');
    bg.addColorStop(0.55, '#fff2dc');
    bg.addColorStop(1, '#ffe7c6');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const top = ctx.createLinearGradient(0, 0, 0, 190);
    top.addColorStop(0, 'rgba(255,255,255,.85)');
    top.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = top;
    ctx.fillRect(0, 0, W, 190);

    ctx.save();
    ctx.strokeStyle = 'rgba(196,150,100,.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(WALL, 0);
    ctx.lineTo(WALL, H - WALL);
    ctx.lineTo(W - WALL, H - WALL);
    ctx.lineTo(W - WALL, 0);
    ctx.stroke();
    ctx.restore();

    const danger = state.danger;
    ctx.save();
    ctx.setLineDash([9, 9]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = danger
      ? 'rgba(255,72,72,' + (0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 140))) + ')'
      : 'rgba(226,152,120,.42)';
    ctx.beginPath();
    ctx.moveTo(WALL, DANGER_Y);
    ctx.lineTo(W - WALL, DANGER_Y);
    ctx.stroke();
    ctx.restore();
  }

  function drawBalls() {
    const now = performance.now();
    const balls = state.balls;
    const sorted = balls.slice().sort((a, b) => a.r - b.r);

    for (let i = 0; i < sorted.length; i++) {
      const b = sorted[i];
      if (b.dead) continue;

      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#7a4a1e';
      ctx.beginPath();
      ctx.ellipse(b.x, H - WALL - 1, b.r * 0.86, Math.max(3, b.r * 0.17), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      let scale = 1;
      if (b.popAt) {
        const t = (now - b.popAt) / 220;
        if (t < 1) scale = 1 + 0.28 * (1 - t);
        else b.popAt = 0;
      }
      const shape = b.sq > 0.004 ? { a: b.sqA, k: b.sq } : null;
      drawFruit(ctx, b.x, b.y, b.r, b.tier, b.angle, scale, shape);
    }
  }

  function drawAim() {
    if (state.over) return;
    const tier = state.pending;
    const r = FRUITS[tier].r;
    const [lo, hi] = aimLimit(tier);
    const x = clamp(state.aimX, lo, hi);
    const bob = Math.sin(performance.now() / 320) * 2.5;
    const ready = state.ready;

    if (ready) {
      ctx.save();
      ctx.setLineDash([5, 8]);
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = 'rgba(200,140,90,.45)';
      ctx.beginPath();
      ctx.moveTo(x, DROP_Y + r + 4);
      ctx.lineTo(x, H - WALL);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = FRUITS[tier].c1;
      ctx.beginPath();
      ctx.arc(x, DROP_Y + bob, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    if (!ready) ctx.globalAlpha = 0.4;
    drawFruit(ctx, x, DROP_Y + bob, r, tier, 0, 1);
    ctx.restore();
  }

  function drawEffects(dt) {
    for (let i = state.particles.length - 1; i >= 0; i--) {
      const p = state.particles[i];
      p.vy += 1400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.99;
      p.life -= p.decay * dt;
      if (p.life <= 0) { state.particles.splice(i, 1); continue; }
      ctx.globalAlpha = Math.max(0, p.life) * 0.9;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    ctx.textAlign = 'center';
    ctx.font = '700 20px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    for (let i = state.floats.length - 1; i >= 0; i--) {
      const f = state.floats[i];
      f.y -= 46 * dt;
      f.life -= dt * 1.05;
      if (f.life <= 0) { state.floats.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, f.life * 1.4);
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = '#f4623a';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    drawTopPreview();
  }

  function drawTopPreview() {
    const tier = state.next;
    const r = 15;
    const x = W - WALL - 30;
    const y = 32;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.font = '600 11px "PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(150,110,80,.85)';
    ctx.fillText('下一个', x - r - 10, y);
    ctx.restore();

    drawFruit(ctx, x, y, r, tier, 0, 1);
  }

  function drawNext() {
    const w = nextCanvas.width;
    const h = nextCanvas.height;
    nextCtx.setTransform(1, 0, 0, 1, 0, 0);
    nextCtx.clearRect(0, 0, w, h);
    const tier = state.next;
    const r = FRUITS[tier].r;
    const k = (Math.min(w, h) * 0.42) / r;
    drawFruit(nextCtx, w / 2, h / 2, r * k, tier, 0, 1);
  }

  function drawChain() {
    const cw = chainCanvas.width;
    const ch = chainCanvas.height;
    chainCtx.setTransform(1, 0, 0, 1, 0, 0);
    chainCtx.clearRect(0, 0, cw, ch);

    const slot = cw / FRUITS.length;
    const r = slot * 0.36;
    const cy = ch * 0.5;

    for (let i = 0; i < FRUITS.length; i++) {
      const x = slot * (i + 0.5);
      drawFruit(chainCtx, x, cy, r, i, 0, 1);
      if (i < FRUITS.length - 1) {
        chainCtx.save();
        chainCtx.globalAlpha = 0.45;
        chainCtx.fillStyle = '#b08a68';
        chainCtx.font = '600 ' + Math.round(ch * 0.2) + 'px system-ui, sans-serif';
        chainCtx.textAlign = 'center';
        chainCtx.textBaseline = 'middle';
        chainCtx.fillText('›', x + slot * 0.5, cy);
        chainCtx.restore();
      }
    }
  }

  /* ---------------------------------------------------------
   *  主循环
   * ------------------------------------------------------- */

  let last = performance.now();
  let acc = 0;
  const FIXED = 1 / 60;

  function frame(now) {
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    acc += dt;

    let guard = 0;
    while (acc >= FIXED && guard < 5) {
      update(FIXED);
      acc -= FIXED;
      guard++;
    }
    if (guard >= 5) acc = 0;

    render(dt);
    requestAnimationFrame(frame);
  }

  function update(dt) {
    if (state.over) return;

    if (!state.ready) {
      state.cooldown -= dt;
      if (state.cooldown <= 0) state.ready = true;
    }

    const sub = dt / SUBSTEPS;
    for (let s = 0; s < SUBSTEPS; s++) stepPhysics(sub);

    checkGameOver(dt);
    if (state.flash > 0) state.flash = Math.max(0, state.flash - dt * 2.2);
  }

  function render(dt) {
    ctx.setTransform(view.scale, 0, 0, view.scale, 0, 0);
    ctx.clearRect(0, 0, W, H);

    drawBoard();
    drawBalls();
    drawAim();
    drawEffects(dt);

    if (state.flash > 0) {
      ctx.save();
      ctx.globalAlpha = state.flash * 0.35;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  /* ---------------------------------------------------------
   *  输入
   * ------------------------------------------------------- */

  function pointerToX(clientX) {
    const rect = canvas.getBoundingClientRect();
    return (clientX - rect.left) * (W / rect.width);
  }

  let touchAiming = false;

  stage.addEventListener('pointermove', (e) => {
    if (state.over) return;
    if (e.pointerType === 'touch' && !touchAiming) return;
    moveAim(pointerToX(e.clientX));
  });

  stage.addEventListener('pointerdown', (e) => {
    if (state.over) return;
    Sound.ensure();
    moveAim(pointerToX(e.clientX));
    if (e.pointerType === 'touch') {
      touchAiming = true;
      if (stage.setPointerCapture) {
        try { stage.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      }
    } else {
      tryDrop();
    }
  });

  stage.addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'touch') return;
    if (!touchAiming) return;
    touchAiming = false;
    if (state.over) return;
    moveAim(pointerToX(e.clientX));
    tryDrop();
  });

  stage.addEventListener('pointercancel', () => { touchAiming = false; });

  stage.addEventListener('contextmenu', (e) => e.preventDefault());

  function isTyping(e) {
    const t = e.target;
    if (!t) return false;
    const tag = (t.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || t.isContentEditable === true;
  }

  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;

    if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
      state.aimX = clamp(state.aimX - 14, WALL, W);
      e.preventDefault();
    } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
      state.aimX = clamp(state.aimX + 14, WALL, W);
      e.preventDefault();
    } else if (e.code === 'Space' || e.code === 'Enter' || e.code === 'ArrowDown') {
      if (!state.over) { tryDrop(); e.preventDefault(); }
    } else if (e.code === 'KeyR') {
      reset();
      e.preventDefault();
    }
  });

  function paintSoundBtn() {
    const ico = soundBtn.querySelector('.ico');
    const lbl = soundBtn.querySelector('.lbl');
    if (ico) ico.textContent = Sound.muted ? '🔇' : '🔊';
    if (lbl) lbl.textContent = Sound.muted ? '音效关' : '音效开';
    soundBtn.setAttribute('aria-pressed', String(!Sound.muted));
  }

  soundBtn.addEventListener('click', () => {
    Sound.muted = !Sound.muted;
    localStorage.setItem(MUTE_KEY, Sound.muted ? '1' : '0');
    paintSoundBtn();
    if (!Sound.muted) Sound.merge(1);
  });

  resetBtn.addEventListener('click', reset);
  restartBtn.addEventListener('click', reset);

  /* ---------------------------------------------------------
   *  素材加载（支持玩家上传图）
   * ------------------------------------------------------- */

  function loadSprites() {
    let left = 0;
    for (let i = 0; i < FRUITS.length; i++) {
      const f = FRUITS[i];
      /* 自定义形象模式：只有上传了图的档位才加载贴图，未选档位直接用程序化圆球 */
      let src = null;
      if (customImages && customImages[i]) src = customImages[i];
      else if (!customImages) src = f.file;   /* 完全没有自定义图时才用默认贴图 */
      if (!src) continue;
      left++;
      const img = new Image();
      img.onload = () => {
        const ready = () => {
          f.img = img;
          left--;
          if (left === 0) refreshPreviews();
        };
        if (img.decode) img.decode().then(ready, ready);
        else ready();
      };
      img.onerror = () => {
        left--;
        if (window.console) console.warn('[randomsyn] 素材载入失败，已回退为程序化圆球：' + src.slice(0, 40));
      };
      img.src = src;
    }
    return left;
  }

  function refreshPreviews() {
    drawNext();
    drawChain();
  }

  /* ---------------------------------------------------------
   *  选图界面
   * ------------------------------------------------------- */

  const pickerScreen = document.getElementById('pickerScreen');
  const slotsEl = document.getElementById('slots');
  const startBtn = document.getElementById('startBtn');
  const fileInput = document.getElementById('fileInput');

  /* 把玩家上传的图处理成透明底圆形贴图（512×512） */
  function imageToRoundDataURL(img, size) {
    size = size || 512;
    const cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, size, size);

    /* 圆形裁切 */
    c.save();
    c.beginPath();
    c.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    c.clip();

    /* cover 缩放，居中 */
    const iw = img.width, ih = img.height;
    const scale = Math.max(size / iw, size / ih);
    const dw = iw * scale, dh = ih * scale;
    c.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
    c.restore();

    /* 细描边，让贴图更有"球"感 */
    c.beginPath();
    c.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    c.lineWidth = 6;
    c.strokeStyle = 'rgba(255,255,255,.35)';
    c.stroke();

    return cv.toDataURL('image/png');
  }

  let selectedSlot = 0;
  const slotImages = new Array(FRUITS.length).fill(null);

  function buildSlots() {
    slotsEl.innerHTML = '';
    for (let i = 0; i < FRUITS.length; i++) {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'slot';
      slot.dataset.idx = i;

      const num = document.createElement('span');
      num.className = 'slot-num';
      num.textContent = '档' + (i + 1);

      const preview = document.createElement('span');
      preview.className = 'slot-preview';

      const tip = document.createElement('span');
      tip.className = 'slot-tip';
      tip.textContent = '点此选图';

      slot.appendChild(num);
      slot.appendChild(preview);
      slot.appendChild(tip);

      slot.addEventListener('click', () => {
        selectedSlot = i;
        fileInput.click();
      });

      slotsEl.appendChild(slot);
    }
  }

  function renderSlots() {
    const slots = slotsEl.querySelectorAll('.slot');
    for (let i = 0; i < slots.length; i++) {
      const preview = slots[i].querySelector('.slot-preview');
      const tip = slots[i].querySelector('.slot-tip');
      if (slotImages[i]) {
        preview.style.backgroundImage = 'url(' + slotImages[i] + ')';
        preview.classList.add('filled');
        tip.textContent = '点击换图';
      } else {
        preview.style.backgroundImage = '';
        preview.classList.remove('filled');
        tip.textContent = '点此选图';
      }
    }
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { alert('请选择图片文件'); return; }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        slotImages[selectedSlot] = imageToRoundDataURL(img);
        renderSlots();
      };
      img.onerror = () => { alert('图片读取失败，请换一张试试'); };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

  function enterGame() {
    /* 用玩家图覆盖贴图；未选的档位回退到程序化圆球 */
    customImages = slotImages.slice();
    window.__CUSTOM_IMAGES__ = customImages;
    pickerScreen.classList.remove('show');
    reset();
    loadSprites();
  }

  startBtn.addEventListener('click', enterGame);

  function openPicker() {
    state.over = true;   /* 冻结当前局 */
    pickerScreen.classList.add('show');
  }

  if (changeBtn) changeBtn.addEventListener('click', openPicker);
  if (changeTopBtn) changeTopBtn.addEventListener('click', openPicker);

  /* ---------------------------------------------------------
   *  启动
   * ------------------------------------------------------- */

  function boot() {
    resizeCanvas();
    if (window.ResizeObserver) {
      new ResizeObserver(resizeCanvas).observe(stage);
    }
    window.addEventListener('resize', resizeCanvas);
    window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 120));

    paintSoundBtn();

    buildSlots();
    renderSlots();

    drawChain();

    /* 若已有自定义图（例如重新进入），直接进游戏 */
    if (customImages && customImages.some(v => v)) {
      pickerScreen.classList.remove('show');
      reset();
      loadSprites();
    } else {
      pickerScreen.classList.add('show');
      reset();
    }

    requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* 调试句柄 */
  window.__RS__ = { state, reset, tryDrop, stepPhysics, FRUITS, render, resizeCanvas, shapeOf, makeBall, customImages: () => customImages };
})();
