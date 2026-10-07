/* ============================================================
   扫雷 · 由 C 语言作业升级而来
   —— 保留了 InitBoard / SetMine / GetMineCount / FindMine 的核心思路
   并修复了原代码里的两个小 bug，新增：首次点击保护、连锁展开、音效、触屏
   ============================================================ */

(function () {
  'use strict';

  // ---- 难度配置 ----
  const LEVELS = {
    easy:   { rows: 9,  cols: 9,  mines: 10 },
    normal: { rows: 16, cols: 16, mines: 40 },
    hard:   { rows: 16, cols: 30, mines: 99 },
  };

  // ---- DOM ----
  const boardEl   = document.getElementById('board');
  const faceEl    = document.getElementById('face');
  const mineCntEl = document.getElementById('mineCounter');
  const timerEl   = document.getElementById('timer');
  const diffEl    = document.getElementById('difficulty');

  // ---- 游戏状态 ----
  let rows, cols, mineCount;
  let board;        // board[r][c] = -1 表示雷，>=0 表示周围雷数
  let revealed;     // 是否已翻开
  let flagged;      // 是否插旗
  let gameOver;     // true = 输/赢，禁止操作
  let firstClick;   // 首次点击保护标记
  let flagCount;    // 已插旗数量
  let timerId;
  let seconds;

  // ============================================================
  //  一、核心逻辑（翻译自 C 语言版）
  // ============================================================

  // 对应 C 的 InitBoard —— 把棋盘填成初始值
  function initBoards() {
    board = [];
    revealed = [];
    flagged = [];
    for (let r = 0; r < rows; r++) {
      board.push(new Array(cols).fill(0));
      revealed.push(new Array(cols).fill(false));
      flagged.push(new Array(cols).fill(false));
    }
    flagCount = 0;
    gameOver = false;
    firstClick = true;
    seconds = 0;
    updateMineCounter();
    updateTimer();
    faceEl.textContent = '🙂';
  }

  // 对应 C 的 SetMine —— 布雷（修复了 = 写成 == 的 bug）
  function setMines(safeR, safeC) {
    let placed = 0;
    while (placed < mineCount) {
      const r = Math.floor(Math.random() * rows);
      const c = Math.floor(Math.random() * cols);
      // 首击保护：第一下的格子及其周围一圈都不布雷
      if (board[r][c] === -1) continue;
      if (safeR !== null && Math.abs(r - safeR) <= 1 && Math.abs(c - safeC) <= 1) continue;
      board[r][c] = -1;
      placed++;
    }
    // 计算每个格子的周围雷数
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c] === -1) continue;
        board[r][c] = countAround(r, c);
      }
    }
  }

  // 对应 C 的 GetMineCount —— 统计周围 8 格雷数（修复了坐标重复/遗漏的 bug）
  function countAround(r, c) {
    let n = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        if (board[nr][nc] === -1) n++;
      }
    }
    return n;
  }

  // ============================================================
  //  二、交互：翻开 / 连锁展开 / 插旗
  // ============================================================

  // 翻开一格（首次点击会先布雷，保证安全）
  function reveal(r, c) {
    if (gameOver) return;
    if (flagged[r][c]) return;
    if (revealed[r][c]) return;

    // 首次点击：先布好雷再翻
    if (firstClick) {
      setMines(r, c);
      firstClick = false;
      startTimer();
    }

    if (board[r][c] === -1) {
      // 踩雷
      revealCell(r, c, true);
      lose();
      return;
    }

    // 空白格（数字为 0）连锁展开 —— 用广度优先搜索
    if (board[r][c] === 0) {
      floodFill(r, c);
    } else {
      revealCell(r, c);
      playSound('click');
    }
    checkWin();
  }

  // 广度优先展开空白区域（对应 C 里逐个排查的升级版）
  function floodFill(sr, sc) {
    const queue = [[sr, sc]];
    const visited = new Set();
    while (queue.length) {
      const [r, c] = queue.shift();
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      if (visited.has(r * cols + c)) continue;
      if (revealed[r][c] || flagged[r][c]) continue;
      visited.add(r * cols + c);
      revealCell(r, c);
      if (board[r][c] === 0) {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            queue.push([r + dr, c + dc]);
          }
        }
      }
    }
    playSound('click');
  }

  function revealCell(r, c, isBoom) {
    revealed[r][c] = true;
    const cell = cellAt(r, c);
    cell.classList.add('open');
    if (isBoom) {
      cell.classList.add('mine', 'boom');
      cell.textContent = '💣';
    } else if (board[r][c] > 0) {
      cell.textContent = board[r][c];
      cell.classList.add('n' + board[r][c]);
    }
  }

  // 插旗 / 取消旗
  function toggleFlag(r, c) {
    if (gameOver) return;
    if (revealed[r][c]) return;
    flagged[r][c] = !flagged[r][c];
    const cell = cellAt(r, c);
    if (flagged[r][c]) {
      cell.classList.add('flag');
      cell.textContent = '🚩';
      flagCount++;
      playSound('flag');
      if (navigator.vibrate) navigator.vibrate(30);
    } else {
      cell.classList.remove('flag');
      cell.textContent = '';
      flagCount--;
    }
    updateMineCounter();
  }

  // ============================================================
  //  三、胜负判定
  // ============================================================

  function lose() {
    gameOver = true;
    stopTimer();
    faceEl.textContent = '😵';
    playSound('boom');
    if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
    // 显示所有雷
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c] === -1 && !flagged[r][c]) {
          const cell = cellAt(r, c);
          cell.classList.add('open', 'mine');
          cell.textContent = '💣';
        }
      }
    }
  }

  function checkWin() {
    // 所有非雷格子都翻开即胜利（对应 C 的 win < r*c-10）
    let opened = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (revealed[r][c]) opened++;
    if (opened === rows * cols - mineCount) {
      gameOver = true;
      stopTimer();
      faceEl.textContent = '😎';
      playSound('win');
      // 自动给所有雷插旗
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (board[r][c] === -1 && !flagged[r][c]) {
            flagged[r][c] = true;
            const cell = cellAt(r, c);
            cell.classList.add('flag');
            cell.textContent = '🚩';
          }
        }
      }
      flagCount = mineCount;
      updateMineCounter();
    }
  }

  // ============================================================
  //  四、计时器 & 计数器
  // ============================================================

  function startTimer() {
    if (timerId) return;
    timerId = setInterval(() => {
      seconds++;
      if (seconds > 999) seconds = 999;
      updateTimer();
    }, 1000);
  }
  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
  }
  function updateTimer() {
    timerEl.textContent = String(seconds).padStart(3, '0');
  }
  function updateMineCounter() {
    const left = mineCount - flagCount;
    mineCntEl.textContent = (left < 0 ? '-' : '') + String(Math.abs(left)).padStart(3, '0');
  }

  // ============================================================
  //  五、音效（Web Audio 现场合成，无需音频文件）
  // ============================================================

  let audioCtx = null;
  function getCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function playTone(freq, dur, type, vol, when) {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime + (when || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }

  function playNoise(dur, vol) {
    const ctx = getCtx();
    if (!ctx) return;
    const t = ctx.currentTime;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    src.buffer = buffer;
    gain.gain.value = vol || 0.3;
    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(t);
  }

  function playSound(kind) {
    switch (kind) {
      case 'click':
        playTone(500, 0.06, 'triangle', 0.15);
        break;
      case 'flag':
        playTone(880, 0.08, 'square', 0.08);
        playTone(1320, 0.08, 'square', 0.06, 0.06);
        break;
      case 'boom':
        playNoise(0.6, 0.5);
        playTone(120, 0.5, 'sawtooth', 0.25);
        playTone(60, 0.6, 'sine', 0.3);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => playTone(f, 0.18, 'triangle', 0.2, i * 0.13));
        break;
    }
  }

  // ============================================================
  //  六、渲染棋盘
  // ============================================================

  function cellAt(r, c) {
    return boardEl.children[r * cols + c];
  }

  function setCellSize() {
    const maxW = Math.min(window.innerWidth - 40, 560) - 28; // 面板内宽
    const size = Math.max(20, Math.floor(maxW / cols) - 2);
    boardEl.style.setProperty('--cell-size', size + 'px');
  }

  function renderBoard() {
    boardEl.innerHTML = '';
    boardEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = document.createElement('button');
        cell.className = 'cell';
        cell.dataset.r = r;
        cell.dataset.c = c;
        bindCellEvents(cell, r, c);
        boardEl.appendChild(cell);
      }
    }
    setCellSize();
  }

  // ============================================================
  //  七、事件绑定：点击翻开 / 长按 & 右键插旗
  // ============================================================

  function bindCellEvents(cell, r, c) {
    let timer = null;
    let longPressed = false;
    let downX = 0, downY = 0;

    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      toggleFlag(r, c);
    });

    cell.addEventListener('pointerdown', (e) => {
      if (gameOver) return;
      getCtx(); // 首次交互解锁音频
      downX = e.clientX; downY = e.clientY;
      longPressed = false;
      timer = setTimeout(() => {
        longPressed = true;
        toggleFlag(r, c);
      }, 380);
    });

    cell.addEventListener('pointermove', (e) => {
      if (Math.abs(e.clientX - downX) > 10 || Math.abs(e.clientY - downY) > 10) {
        clearTimeout(timer);
      }
    });

    cell.addEventListener('pointerup', () => {
      clearTimeout(timer);
      if (!longPressed) reveal(r, c);
    });

    cell.addEventListener('pointercancel', () => clearTimeout(timer));
    cell.addEventListener('pointerleave', () => clearTimeout(timer));
  }

  // ============================================================
  //  八、难度切换 & 重新开始
  // ============================================================

  function startGame(level) {
    const cfg = LEVELS[level];
    rows = cfg.rows; cols = cfg.cols; mineCount = cfg.mines;
    stopTimer();
    initBoards();
    renderBoard();
  }

  diffEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.diff-btn');
    if (!btn) return;
    diffEl.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    startGame(btn.dataset.level);
  });

  faceEl.addEventListener('click', () => {
    const active = diffEl.querySelector('.diff-btn.active');
    startGame(active.dataset.level);
  });

  window.addEventListener('resize', setCellSize);

  // 调试钩子：在浏览器控制台可以用 MS_DEBUG 查看棋盘、模拟点击
  window.MS_DEBUG = {
    reveal,
    toggleFlag,
    getState: () => ({ rows, cols, mineCount, gameOver, board, revealed, flagged }),
  };

  // 初始进入：初级
  startGame('easy');
})();
