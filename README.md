# 🍉 随机大合成（自定义形象版）

一个基于开源「合成大奶娃 / 合成大西瓜」玩法改造的自定义合成小游戏。
**玩家开局前从自己相册为 11 个档位各选一张形象图**，相同的形象撞在一起就合成高一级形象，越合越大。

纯前端，零依赖、零构建，部署到任意静态托管即可成为一个"自己的网址"。

---

## 玩法

1. 打开页面 → 出现选图界面，有 **档1 ~ 档11** 共 11 个槽位（从小到大）。
2. 每个槽位点一下，从相册选一张形象图（会处理成透明底圆形小球）。
   - 某档不选也没关系，会自动用"彩色圆球"代替，游戏照常能玩。
3. 点「开始游戏」→ 相同形象接触即合成高一级形象。
4. 结算时本局成绩**自动上传在线排行榜**（数据存在免费服务器）。

---

## 目录结构

```
random-synthesis/
├── index.html       页面结构（选图界面 + 游戏区 + 排行榜/赞助弹窗）
├── style.css        样式
├── game.js          核心游戏逻辑（物理 + 选图 + 自定义贴图）
├── leaderboard.js   在线排行榜（TinyWebDB 免费服务器）
├── sponsor.js       赞助弹窗（收款码）
├── favicon.png      站点图标
└── assets/
    └── sponsor-qr.png   赞助收款码（当前为占位图，换成你的）
```

---

## 如何把它变成"你自己的网址"

任选一种免费方式：

### 方式一：GitHub Pages（推荐，完全免费）
1. 在 GitHub 新建一个仓库（如 `my-synthesis`）。
2. 把本目录下所有文件上传到仓库根目录。
3. 打开仓库 Settings → Pages → 选 `main` 分支 → Save。
4. 等 1 分钟，你的网址就是 `https://你的用户名.github.io/my-synthesis/`。

### 方式二：任意静态托管
- Netlify / Vercel / Cloudflare Pages：把本文件夹拖进去即可，都是免费。
- 直接把整个文件夹丢到任何支持静态网站的服务器也行（例如 `nginx` 的 web 根目录）。

> 本地预览：在 `random-synthesis` 目录执行 `python -m http.server 8765`，浏览器打开 `http://localhost:8765`。

---

## 排行榜数据（免费服务器）

排行榜数据**不存本地**，存的是 **MIT 免费服务 TinyWebDB**（`https://tinywebdb.appinventor.mit.edu/api`），纯前端读写、免费、无需自建服务器。

- 每个站点有独立的数据空间：在 `leaderboard.js` 顶部的 `USER / SECRET / PREFIX` 三个配置。
- **想让排行榜完全是自己的**：去 https://tinywebdb.appinventor.mit.edu 注册一个账号，拿到你的 `user` 和 `secret`，把 `leaderboard.js` 里的 `USER`、`SECRET` 换成你自己的，`PREFIX` 换一个新前缀（如 `mysite_`），就是一个全新的榜，别人看不到你的数据。

当前默认值是我为本站随机生成的专属凭据（`xbypriokfu` / `5nlrhtq37zak4f`，前缀 `rs_260930_`），已经是一块独立榜单，与原作互不影响。

---

## 替换你的收款码

赞助按钮在结算弹窗里（"🖤 感谢支持我一下嘛"），弹出的二维码图片是：

```
assets/sponsor-qr.png
```

把你的收款码（微信/支付宝都行）命名为 `sponsor-qr.png` 覆盖这个文件即可，无需改代码。
想要改按钮文案，搜 `index.html` 里的「感谢支持我一下嘛」和「请我喝杯奶茶」。

---

## 常见自定义

| 想改什么 | 改哪里 |
|---|---|
| 游戏标题/页面名 | `index.html` 的 `<title>`、两个 `<h1>` |
| 掉落难度 | `game.js` 顶部 `SPAWN_WEIGHTS`（越小越常见） |
| 合成档位数 | `game.js` 的 `FRUITS` 数组（增删一项） |
| 音效开关 | `game.js` 的 `Sound` |
| 每个档位默认圆球颜色 | `game.js` 的 `FRUITS` 里 `c1/c2` |
| 排行榜数据空间 | `leaderboard.js` 顶部 `USER/SECRET/PREFIX` |

---

## 说明

- 本版本由开源「合成大奶娃」改造：去掉了对原作者在线排行榜/赞助的后端依赖，改为自己的免费服务器 + 自己的收款码；新增了「逐档上传自定义形象」的玩法。
- 原项目仓库 `YHSome/BigNaiWa` 未声明开源协议，本版本仅供个人学习与自用部署。
