/* ============================================================
 *  随机大合成 · 在线排行榜（Supabase 版）
 *  数据存在 Supabase Postgres（免费套餐），纯前端 REST 读写，
 *  全球共享排行榜，比旧版 TinyWebDB 稳定可靠。
 *  表 scores：id / name / score / created_at
 * ============================================================ */
(function () {
  'use strict';

  /* —— Supabase 配置（本站专用）—— */
  var SUPA_URL = 'https://fsbsvotpgiuylztidqjq.supabase.co';
  var SUPA_KEY = 'sb_publishable_tObhPL-V2iTS47lsJB8RSw_lFWUbBD4';
  var TABLE    = 'scores';

  var NAME_KEY   = 'randomsyn.name.v1';
  var DEFAULT_NAME = '默认用户';
  var MUTE_MIN_GAP = 3000;
  var MAX_SCORE = 99999999;
  var WINDOW = 20;

  var $ = function (id) { return document.getElementById(id); };

  function supaHeaders() {
    return {
      'apikey': SUPA_KEY,
      'Authorization': 'Bearer ' + SUPA_KEY,
      'Content-Type': 'application/json'
    };
  }

  /* 提交一条成绩 */
  function addScore(name, score) {
    return fetch(SUPA_URL + '/rest/v1/' + TABLE, {
      method: 'POST',
      headers: supaHeaders(),
      body: JSON.stringify({ name: name, score: score })
    }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw new Error('HTTP ' + res.status + ' ' + t.slice(0, 80)); });
      return true;
    });
  }

  /* 拉取最高分前 WINDOW 名（按昵称去重，每人只留最高分） */
  function fetchTop() {
    var q = '/rest/v1/' + TABLE + '?select=name,score,created_at'
          + '&order=score.desc&limit=' + (WINDOW * 5);
    return fetch(SUPA_URL + q, { headers: supaHeaders() })
      .then(function (res) {
        if (!res.ok) return res.text().then(function (t) { throw new Error('HTTP ' + res.status + ' ' + t.slice(0, 80)); });
        return res.json();
      })
      .then(function (rows) {
        var best = {};
        (rows || []).forEach(function (rec) {
          var s = Number(rec && rec.score);
          if (!isFinite(s) || s < 0 || s > MAX_SCORE) return;
          var n = String((rec && rec.name) || '匿名玩家').slice(0, 16);
          if (!best[n] || s > best[n].score) {
            best[n] = {
              name: n,
              score: s,
              t: rec && rec.created_at ? Date.parse(rec.created_at) || 0 : 0
            };
          }
        });
        return Object.keys(best).map(function (k) { return best[k]; })
          .sort(function (a, b) { return b.score - a.score; })
          .slice(0, WINDOW);
      });
  }

  function cleanName(raw) {
    var n = String(raw || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
    if (n.length > 12) n = n.slice(0, 12);
    return n;
  }
  function loadName() { try { return cleanName(localStorage.getItem(NAME_KEY) || ''); } catch (e) { return ''; } }
  function saveName(n) { try { localStorage.setItem(NAME_KEY, n); } catch (e) { } }
  function myName() { return loadName() || DEFAULT_NAME; }

  /* 检查某昵称是否已在排行榜中被使用（自己的名字不算） */
  function checkNameExists(name) {
    var q = '/rest/v1/' + TABLE + '?select=name&name=eq.' + encodeURIComponent(name) + '&limit=1';
    return fetch(SUPA_URL + q, { headers: supaHeaders() })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (rows) {
        return (rows || []).length > 0;
      });
  }

  var listEl = $('boardList');
  var modal = $('boardModal');
  var msgEl = $('submitMsg');
  var nickInput = $('nickInput');
  var nameLabel = $('myNameLabel');
  var submitBtn = $('submitBtn');
  var submitBox = $('submitBox');
  var lastSubmitAt = 0;
  var submitting = false;
  var pendingScore = 0;

  function setMsg(text, kind) {
    if (!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.className = 'submit-msg' + (kind ? ' is-' + kind : '');
  }
  function showRetry(show) { if (submitBtn) submitBtn.hidden = !show; }
  function paintName() {
    var n = myName();
    if (nameLabel) nameLabel.textContent = n;
    if (nickInput && document.activeElement !== nickInput) nickInput.value = loadName();
  }
  function boardMessage(text) {
    if (!listEl) return;
    listEl.textContent = '';
    var p = document.createElement('p');
    p.className = 'board-empty';
    p.textContent = text;
    listEl.appendChild(p);
  }
  function rankClass(i) { return i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : ''; }
  function renderBoard(rows, myScore) {
    if (!listEl) return;
    listEl.textContent = '';
    if (!rows.length) { boardMessage('最近还没有人提交，快去玩一局！'); return; }
    var marked = false;
    rows.forEach(function (row, i) {
      var line = document.createElement('div');
      line.className = 'board-row ' + rankClass(i);
      var rank = document.createElement('span');
      rank.className = 'board-rank';
      rank.textContent = i < 3 ? ['🥇', '🥈', '🥉'][i] : String(i + 1);
      var name = document.createElement('span');
      name.className = 'board-name';
      name.textContent = row.name;
      var score = document.createElement('span');
      score.className = 'board-score';
      score.textContent = row.score;
      line.appendChild(rank); line.appendChild(name); line.appendChild(score);
      if (!marked && myScore != null && row.score === myScore) {
        line.classList.add('is-mine'); marked = true;
      }
      listEl.appendChild(line);
    });
  }
  function refreshBoard(myScore) {
    boardMessage('正在读取排行榜…');
    return fetchTop().then(function (rows) {
      renderBoard(rows, myScore);
      return rows;
    }).catch(function (err) {
      boardMessage('读取失败：' + err.message + '（检查一下网络？）');
      throw err;
    });
  }
  function openBoard() {
    if (!modal) return;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    refreshBoard(null).catch(function () { });
  }
  function closeBoard() {
    if (!modal) return;
    modal.classList.remove('show');
    modal.setAttribute('aria-hidden', 'true');
  }
  function pushScore(name, score, viaRetry) {
    if (submitting) return Promise.resolve(false);
    if (!viaRetry) {
      var now = Date.now();
      if (now - lastSubmitAt < MUTE_MIN_GAP) {
        setMsg('刚提交过啦，稍等一下', 'bad');
        return Promise.resolve(false);
      }
    }
    submitting = true;
    showRetry(false);
    setMsg('正在提交…', '');
    return addScore(name, score).then(function () {
      lastSubmitAt = Date.now();
      setMsg('已上榜 ✓　' + name + ' · ' + score + ' 分', 'good');
      return refreshBoard(score).then(function () { return true; }, function () { return true; });
    }).catch(function (err) {
      setMsg('提交失败：' + err.message, 'bad');
      showRetry(true);
      return false;
    }).then(function (ok) { submitting = false; return ok; });
  }
  function retry() { if (pendingScore) pushScore(myName(), pendingScore, true); }
  function onGameOver(score) {
    if (!submitBox) return;
    pendingScore = Number(score) || 0;
    paintName();
    showRetry(false);
    if (!(pendingScore > 0)) { submitBox.style.display = 'none'; return; }
    submitBox.style.display = '';
    setMsg('正在结算…', '');
    pushScore(myName(), pendingScore, true);
  }
  function bind() {
    var boardBtn = $('boardBtn');
    if (boardBtn) boardBtn.addEventListener('click', openBoard);
    var boardBtn2 = $('boardBtn2');
    if (boardBtn2) boardBtn2.addEventListener('click', openBoard);
    var closeBtn = $('boardClose');
    if (closeBtn) closeBtn.addEventListener('click', closeBoard);
    var refreshBtn = $('boardRefresh');
    if (refreshBtn) refreshBtn.addEventListener('click', function () { refreshBoard(null).catch(function () { }); });
    if (modal) modal.addEventListener('click', function (e) { if (e.target === modal) closeBoard(); });
    if (submitBtn) submitBtn.addEventListener('click', retry);
    if (nickInput) {
      nickInput.value = loadName();
      var commit = function () {
        var raw = cleanName(nickInput.value);
        if (!raw) { saveName(''); nickInput.value = loadName(); paintName(); return; }
        if (raw === loadName()) { nickInput.value = raw; return; }
        /* 检查该名字是否已被使用 */
        setMsg('检查名称…', '');
        checkNameExists(raw).then(function (exists) {
          if (exists) {
            setMsg('「' + raw + '」已被使用，换一个吧', 'bad');
            nickInput.value = loadName();
            nickInput.focus();
            return;
          }
          saveName(raw);
          nickInput.value = raw;
          paintName();
          setMsg('昵称已更新 ✓', 'good');
        }).catch(function () {
          /* 网络失败就先保存本地，下次再校验 */
          saveName(raw);
          nickInput.value = raw;
          paintName();
        });
      };
      nickInput.addEventListener('change', commit);
      nickInput.addEventListener('blur', commit);
      nickInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); commit(); nickInput.blur(); }
      });
    }
    var editNameBtn = $('editNameBtn');
    if (editNameBtn) {
      editNameBtn.addEventListener('click', function () {
        openBoard();
        if (nickInput) setTimeout(function () { nickInput.focus(); nickInput.select(); }, 260);
      });
    }
    paintName();
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeBoard(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  window.DanaiwaBoard = {
    open: openBoard, close: closeBoard, refresh: refreshBoard,
    onGameOver: onGameOver, fetchTop: fetchTop, submitScore: addScore,
    myName: myName, setName: function (n) { saveName(cleanName(n)); paintName(); },
    hasName: function () { return !!loadName(); }
  };
})();
