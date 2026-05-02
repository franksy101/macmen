// MacMen — Pacman-Engine
(() => {
  const CHARACTERS = [
    { id: 'marc',  name: 'Marc',  color: '#ff4fb1', personality: 'chaser' },
    { id: 'emil',  name: 'Emil',  color: '#4fe3ff', personality: 'ambusher' },
    { id: 'simon', name: 'Simon', color: '#ff9f43', personality: 'random' },
    { id: 'leo',   name: 'Leo',   color: '#ff4d4d', personality: 'patrol' },
    { id: 'frank', name: 'Frank', color: '#a259ff', personality: 'flanker' },
    { id: 'milo',  name: 'Milo',  color: '#4fff8b', personality: 'scared' },
    { id: 'bela',  name: 'Bela',  color: '#4f8bff', personality: 'mirror' },
  ];

  const DIR = {
    NONE:  { x: 0,  y: 0  },
    UP:    { x: 0,  y: -1 },
    DOWN:  { x: 0,  y: 1  },
    LEFT:  { x: -1, y: 0  },
    RIGHT: { x: 1,  y: 0  },
  };

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const scoreEl = document.getElementById('score');
  const highEl = document.getElementById('highscore');
  const levelEl = document.getElementById('level');
  const livesEl = document.getElementById('lives');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const startBtn = document.getElementById('startBtn');
  const muteBtn = document.getElementById('muteBtn');
  const scoresBtn = document.getElementById('scoresBtn');
  const scoresPanel = document.getElementById('scoresPanel');
  const scoreList = document.getElementById('scoreList');
  const closeScores = document.getElementById('closeScores');
  const namePanel = document.getElementById('namePanel');
  const finalScoreEl = document.getElementById('finalScore');
  const nameInput = document.getElementById('nameInput');
  const saveScoreBtn = document.getElementById('saveScore');
  const charPicker = document.getElementById('characterPicker');

  // Sizing
  canvas.width = COLS * TILE_SIZE;
  canvas.height = ROWS * TILE_SIZE;

  // Game State
  const state = {
    grid: null,
    pelletsLeft: 0,
    score: 0,
    level: 1,
    lives: 3,
    running: false,
    paused: false,
    powerTimer: 0,
    selectedCharacterId: 'marc',
    player: null,
    ghosts: [],
    pendingDir: null,
    deathTimer: 0,
    flashTimer: 0,
    levelTimer: 0,
  };

  // ── Character picker ─────────────────────────────────────────────────
  function renderCharacterPicker() {
    charPicker.innerHTML = '';
    CHARACTERS.forEach(ch => {
      const card = document.createElement('div');
      card.className = 'char-card' + (ch.id === state.selectedCharacterId ? ' active' : '');
      card.dataset.id = ch.id;
      const av = document.createElement('div');
      av.className = 'avatar';
      av.style.background = ch.color;
      av.style.boxShadow = `0 0 12px ${ch.color}`;
      card.appendChild(av);
      const lbl = document.createElement('div');
      lbl.textContent = ch.name;
      card.appendChild(lbl);
      card.addEventListener('click', () => {
        state.selectedCharacterId = ch.id;
        renderCharacterPicker();
      });
      charPicker.appendChild(card);
    });
  }

  // ── Entities ─────────────────────────────────────────────────────────
  function makeEntity(col, row, color, name, personality) {
    return {
      col, row,
      x: col * TILE_SIZE + TILE_SIZE / 2,
      y: row * TILE_SIZE + TILE_SIZE / 2,
      dir: { ...DIR.LEFT },
      nextDir: { ...DIR.LEFT },
      speed: 2.0,
      color,
      name,
      personality,
      mouthPhase: 0,
      scared: false,
      eaten: false,
      home: { col, row },
      changeTimer: 0,
    };
  }

  function spawnPlayer() {
    const ch = CHARACTERS.find(c => c.id === state.selectedCharacterId);
    state.player = makeEntity(10, 16, ch.color, ch.name, 'player');
    state.player.speed = 2.2;
    state.player.dir = { ...DIR.NONE };
    state.player.nextDir = { ...DIR.NONE };
  }

  function spawnGhosts() {
    state.ghosts = [];
    const others = CHARACTERS.filter(c => c.id !== state.selectedCharacterId);
    // 4 ghosts
    const positions = [
      { col: 9,  row: 10 },
      { col: 10, row: 10 },
      { col: 9,  row: 9  },
      { col: 10, row: 9  },
    ];
    // shuffle others, pick 4
    const shuffled = others.sort(() => Math.random() - 0.5).slice(0, 4);
    shuffled.forEach((ch, i) => {
      const p = positions[i];
      const g = makeEntity(p.col, p.row, ch.color, ch.name, ch.personality);
      g.speed = 1.6 + state.level * 0.05;
      g.dir = { ...(Math.random() < 0.5 ? DIR.LEFT : DIR.RIGHT) };
      state.ghosts.push(g);
    });
  }

  // ── Movement ─────────────────────────────────────────────────────────
  function tileAt(col, row) {
    if (row < 0 || row >= ROWS) return TILE.WALL;
    // tunnel wrap
    if (col < 0 || col >= COLS) return TILE.EMPTY;
    return state.grid[row][col];
  }

  function canMove(col, row, isGhost = false) {
    const t = tileAt(col, row);
    if (t === TILE.WALL) return false;
    if (t === TILE.DOOR) return isGhost;
    return true;
  }

  function isAtCenter(e) {
    const cx = e.col * TILE_SIZE + TILE_SIZE / 2;
    const cy = e.row * TILE_SIZE + TILE_SIZE / 2;
    return Math.abs(e.x - cx) < 0.6 && Math.abs(e.y - cy) < 0.6;
  }

  function snap(e) {
    e.x = e.col * TILE_SIZE + TILE_SIZE / 2;
    e.y = e.row * TILE_SIZE + TILE_SIZE / 2;
  }

  function updateTileFromPos(e) {
    e.col = Math.floor(e.x / TILE_SIZE);
    e.row = Math.floor(e.y / TILE_SIZE);
  }

  function moveEntity(e, isGhost = false) {
    // try to apply nextDir at center
    if (isAtCenter(e)) {
      snap(e);
      const nc = e.col + e.nextDir.x;
      const nr = e.row + e.nextDir.y;
      if ((e.nextDir.x !== 0 || e.nextDir.y !== 0) && canMove(nc, nr, isGhost)) {
        e.dir = { ...e.nextDir };
      }
      // check current dir
      const cc = e.col + e.dir.x;
      const cr = e.row + e.dir.y;
      if (!canMove(cc, cr, isGhost)) {
        e.dir = { ...DIR.NONE };
      }
    }
    e.x += e.dir.x * e.speed;
    e.y += e.dir.y * e.speed;

    // tunnel wrap
    if (e.x < -TILE_SIZE / 2) e.x = canvas.width + TILE_SIZE / 2 - 1;
    else if (e.x > canvas.width + TILE_SIZE / 2) e.x = -TILE_SIZE / 2 + 1;

    updateTileFromPos(e);
  }

  // ── Ghost AI ─────────────────────────────────────────────────────────
  function dirsAt(e, isGhost = true) {
    const opts = [];
    [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT].forEach(d => {
      // dont reverse
      if (d.x === -e.dir.x && d.y === -e.dir.y && (e.dir.x !== 0 || e.dir.y !== 0)) return;
      const nc = e.col + d.x;
      const nr = e.row + d.y;
      if (canMove(nc, nr, isGhost)) opts.push(d);
    });
    return opts;
  }

  function dist(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function ghostThink(g) {
    if (!isAtCenter(g)) return;
    const opts = dirsAt(g, true);
    if (opts.length === 0) {
      // reverse
      g.dir = { x: -g.dir.x, y: -g.dir.y };
      return;
    }
    if (opts.length === 1) {
      g.dir = { ...opts[0] };
      return;
    }

    const player = state.player;
    let target;

    if (g.scared) {
      // run away
      target = { col: g.col - (player.col - g.col), row: g.row - (player.row - g.row) };
    } else if (g.eaten) {
      // back home
      target = g.home;
    } else {
      switch (g.personality) {
        case 'chaser':   // direkt jagen
          target = { col: player.col, row: player.row };
          break;
        case 'ambusher': // 4 vor dem Spieler
          target = { col: player.col + player.dir.x * 4, row: player.row + player.dir.y * 4 };
          break;
        case 'patrol': { // patroulliert in Quadranten
          const corners = [{ col: 1, row: 1 }, { col: 18, row: 1 }, { col: 1, row: 20 }, { col: 18, row: 20 }];
          target = corners[Math.floor((Date.now() / 4000) % 4)];
          break;
        }
        case 'flanker':  // gegenüber-Flanke
          target = { col: 19 - player.col, row: 21 - player.row };
          break;
        case 'scared':   // bleibt etwas distanziert
          if (dist(g.col, g.row, player.col, player.row) < 36) {
            target = { col: g.home.col, row: g.home.row };
          } else {
            target = { col: player.col, row: player.row };
          }
          break;
        case 'mirror':   // spiegelt Bewegung
          target = { col: 19 - player.col, row: player.row };
          break;
        case 'random':
        default:
          target = { col: Math.floor(Math.random() * COLS), row: Math.floor(Math.random() * ROWS) };
          break;
      }
    }

    // pick option closest to target
    let best = opts[0];
    let bestD = Infinity;
    opts.forEach(d => {
      const nc = g.col + d.x;
      const nr = g.row + d.y;
      const dd = dist(nc, nr, target.col, target.row);
      if (dd < bestD) { bestD = dd; best = d; }
    });
    g.dir = { ...best };
  }

  // ── Game flow ────────────────────────────────────────────────────────
  function startNewGame() {
    state.score = 0;
    state.level = 1;
    state.lives = 3;
    state.running = true;
    initLevel();
    Sounds.start();
    setTimeout(() => Sounds.startSiren(), 700);
    overlay.classList.add('hidden');
  }

  function initLevel() {
    state.grid = parseMaze();
    state.pelletsLeft = countPellets(state.grid);
    state.powerTimer = 0;
    state.deathTimer = 0;
    state.flashTimer = 0;
    spawnPlayer();
    spawnGhosts();
    updateHud();
  }

  function nextLevel() {
    state.level++;
    Sounds.stopSiren();
    Sounds.levelComplete();
    state.flashTimer = 60;
    setTimeout(() => {
      initLevel();
      Sounds.startSiren();
    }, 1600);
  }

  function loseLife() {
    state.lives--;
    state.deathTimer = 90;
    Sounds.stopSiren();
    Sounds.death();
    updateHud();
  }

  function gameOver() {
    state.running = false;
    Sounds.stopSiren();
    Sounds.gameOver();
    if (Highscore.isHighscore(state.score)) {
      finalScoreEl.textContent = state.score;
      namePanel.classList.remove('hidden');
      setTimeout(() => nameInput.focus(), 100);
    } else {
      showStartOverlay('Game Over', `Du hast ${state.score} Punkte erreicht.`);
    }
  }

  function showStartOverlay(title, text) {
    overlayTitle.textContent = title;
    overlayText.textContent = text || 'Sammle alle Punkte ein und weiche den anderen aus!';
    overlay.classList.remove('hidden');
  }

  // ── Collisions / pellets ─────────────────────────────────────────────
  function eatPellet() {
    const p = state.player;
    const t = state.grid[p.row][p.col];
    if (t === TILE.PELLET) {
      state.grid[p.row][p.col] = TILE.EMPTY;
      state.pelletsLeft--;
      state.score += 10;
      Sounds.chomp();
      updateHud();
    } else if (t === TILE.POWER) {
      state.grid[p.row][p.col] = TILE.EMPTY;
      state.pelletsLeft--;
      state.score += 50;
      state.powerTimer = 360; // ~6s
      state.ghosts.forEach(g => { if (!g.eaten) g.scared = true; });
      Sounds.power();
      updateHud();
    }
  }

  function checkGhostCollision() {
    if (state.deathTimer > 0) return;
    const p = state.player;
    state.ghosts.forEach(g => {
      const d = Math.hypot(p.x - g.x, p.y - g.y);
      if (d < TILE_SIZE * 0.6) {
        if (g.scared && !g.eaten) {
          g.eaten = true;
          g.scared = false;
          g.speed = 3.2;
          state.score += 200;
          Sounds.ghostEaten();
          updateHud();
        } else if (!g.eaten) {
          loseLife();
        }
      }
      // returned home?
      if (g.eaten && g.col === g.home.col && g.row === g.home.row) {
        g.eaten = false;
        g.speed = 1.6 + state.level * 0.05;
      }
    });
  }

  // ── Update / Render ──────────────────────────────────────────────────
  function update() {
    if (!state.running) return;

    if (state.flashTimer > 0) {
      state.flashTimer--;
      return;
    }

    if (state.deathTimer > 0) {
      state.deathTimer--;
      if (state.deathTimer === 0) {
        if (state.lives <= 0) {
          gameOver();
          return;
        }
        spawnPlayer();
        spawnGhosts();
        Sounds.startSiren();
      }
      return;
    }

    moveEntity(state.player, false);
    eatPellet();

    state.ghosts.forEach(g => {
      ghostThink(g);
      moveEntity(g, true);
    });

    if (state.powerTimer > 0) {
      state.powerTimer--;
      if (state.powerTimer === 0) {
        state.ghosts.forEach(g => g.scared = false);
      }
    }

    checkGhostCollision();

    if (state.pelletsLeft <= 0) {
      nextLevel();
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMaze();
    drawPlayer();
    state.ghosts.forEach(drawGhost);
    if (state.deathTimer > 0) drawDeathFlash();
    if (state.flashTimer > 0) drawLevelFlash();
  }

  function drawMaze() {
    if (!state.grid) return;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = state.grid[r][c];
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;
        if (t === TILE.WALL) {
          drawWallCell(c, r, x, y);
        } else if (t === TILE.PELLET) {
          ctx.fillStyle = '#ffe7a8';
          ctx.beginPath();
          ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 3, 0, Math.PI * 2);
          ctx.fill();
        } else if (t === TILE.POWER) {
          const pulse = 4 + Math.sin(Date.now() / 150) * 2;
          ctx.fillStyle = '#ffd83b';
          ctx.shadowColor = '#ffd83b';
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (t === TILE.DOOR) {
          ctx.fillStyle = '#ff4fb1';
          ctx.fillRect(x + 4, y + TILE_SIZE / 2 - 2, TILE_SIZE - 8, 4);
        }
      }
    }
  }

  function drawWallCell(c, r, x, y) {
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = '#4f6dff';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(79,109,255,0.4)';
    ctx.shadowBlur = 6;
    // draw edges only where neighbour is non-wall
    const top = tileAt(c, r - 1) !== TILE.WALL;
    const bottom = tileAt(c, r + 1) !== TILE.WALL;
    const left = tileAt(c - 1, r) !== TILE.WALL;
    const right = tileAt(c + 1, r) !== TILE.WALL;
    ctx.beginPath();
    if (top)    { ctx.moveTo(x, y); ctx.lineTo(x + TILE_SIZE, y); }
    if (bottom) { ctx.moveTo(x, y + TILE_SIZE); ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE); }
    if (left)   { ctx.moveTo(x, y); ctx.lineTo(x, y + TILE_SIZE); }
    if (right)  { ctx.moveTo(x + TILE_SIZE, y); ctx.lineTo(x + TILE_SIZE, y + TILE_SIZE); }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function drawPlayer() {
    const p = state.player;
    if (!p) return;
    const r = TILE_SIZE / 2 - 2;
    let angle = 0;
    if (p.dir.x === 1) angle = 0;
    else if (p.dir.x === -1) angle = Math.PI;
    else if (p.dir.y === -1) angle = -Math.PI / 2;
    else if (p.dir.y === 1) angle = Math.PI / 2;

    const moving = p.dir.x !== 0 || p.dir.y !== 0;
    if (moving) p.mouthPhase += 0.25;
    const mouth = Math.abs(Math.sin(p.mouthPhase)) * 0.6 + 0.05;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, mouth, Math.PI * 2 - mouth);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();

    // name tag
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(p.name.toUpperCase(), p.x, p.y - r - 4);
  }

  function drawGhost(g) {
    const r = TILE_SIZE / 2 - 2;
    const x = g.x;
    const y = g.y;

    let color = g.color;
    if (g.eaten) color = 'rgba(255,255,255,0.25)';
    else if (g.scared) {
      const blink = state.powerTimer < 90 && Math.floor(Date.now() / 150) % 2 === 0;
      color = blink ? '#fff' : '#3a4fff';
    }

    ctx.save();
    ctx.fillStyle = color;
    if (!g.eaten && !g.scared) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI, 0, false);
    ctx.lineTo(x + r, y + r);
    // wavy bottom
    const waves = 4;
    const step = (r * 2) / waves;
    for (let i = 0; i < waves; i++) {
      const wx = x + r - i * step;
      ctx.lineTo(wx - step / 2, y + r - 4);
      ctx.lineTo(wx - step, y + r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // eyes
    if (!g.scared || g.eaten) {
      const ex = g.dir.x * 2;
      const ey = g.dir.y * 2;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(x - 4, y - 2, 3, 0, Math.PI * 2);
      ctx.arc(x + 4, y - 2, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(x - 4 + ex, y - 2 + ey, 1.5, 0, Math.PI * 2);
      ctx.arc(x + 4 + ex, y - 2 + ey, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // scared face
      ctx.fillStyle = '#fff';
      ctx.fillRect(x - 5, y - 3, 2, 2);
      ctx.fillRect(x + 3, y - 3, 2, 2);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 5, y + 4);
      for (let i = 0; i < 4; i++) {
        ctx.lineTo(x - 5 + (i + 1) * 2.5, y + 4 + (i % 2 === 0 ? -2 : 0));
      }
      ctx.stroke();
    }
    ctx.restore();

    // name tag
    if (!g.eaten) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText(g.name.toUpperCase(), x, y - r - 4);
    }
  }

  function drawDeathFlash() {
    ctx.fillStyle = 'rgba(255,77,77,0.18)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawLevelFlash() {
    ctx.fillStyle = 'rgba(255,216,59,0.25)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffd83b';
    ctx.font = 'bold 32px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(`LEVEL ${state.level + 1}`, canvas.width / 2, canvas.height / 2);
  }

  // ── HUD ──────────────────────────────────────────────────────────────
  function updateHud() {
    scoreEl.textContent = state.score;
    levelEl.textContent = state.level;
    livesEl.textContent = state.lives;
    highEl.textContent = Highscore.bestScore();
  }

  // ── Input ────────────────────────────────────────────────────────────
  function setPlayerDir(d) {
    if (!state.player) return;
    state.player.nextDir = { ...d };
  }

  document.addEventListener('keydown', (e) => {
    Sounds.ensure();
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W': setPlayerDir(DIR.UP); e.preventDefault(); break;
      case 'ArrowDown': case 's': case 'S': setPlayerDir(DIR.DOWN); e.preventDefault(); break;
      case 'ArrowLeft': case 'a': case 'A': setPlayerDir(DIR.LEFT); e.preventDefault(); break;
      case 'ArrowRight': case 'd': case 'D': setPlayerDir(DIR.RIGHT); e.preventDefault(); break;
      case 'p': case 'P': state.paused = !state.paused; break;
    }
  });

  document.querySelectorAll('.tbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      Sounds.ensure();
      const map = { up: DIR.UP, down: DIR.DOWN, left: DIR.LEFT, right: DIR.RIGHT };
      setPlayerDir(map[btn.dataset.dir]);
    });
  });

  // swipe
  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => {
    Sounds.ensure();
    if (e.touches[0]) touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  });
  canvas.addEventListener('touchend', (e) => {
    if (!touchStart || !e.changedTouches[0]) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > Math.abs(dy)) {
      setPlayerDir(dx > 0 ? DIR.RIGHT : DIR.LEFT);
    } else {
      setPlayerDir(dy > 0 ? DIR.DOWN : DIR.UP);
    }
    touchStart = null;
  });

  // ── UI Buttons ───────────────────────────────────────────────────────
  startBtn.addEventListener('click', () => {
    Sounds.ensure();
    startNewGame();
  });

  muteBtn.addEventListener('click', () => {
    const m = !Sounds.isMuted();
    Sounds.setMuted(m);
    muteBtn.textContent = m ? '🔇' : '🔊';
    if (!m && state.running) Sounds.startSiren();
  });

  scoresBtn.addEventListener('click', () => {
    renderScoreList();
    scoresPanel.classList.remove('hidden');
  });
  closeScores.addEventListener('click', () => {
    scoresPanel.classList.add('hidden');
  });

  saveScoreBtn.addEventListener('click', () => {
    const name = nameInput.value.trim() || 'ANON';
    const ch = CHARACTERS.find(c => c.id === state.selectedCharacterId);
    Highscore.add(name, state.score, ch ? ch.name : '');
    nameInput.value = '';
    namePanel.classList.add('hidden');
    showStartOverlay('Game Over', `Eingetragen mit ${state.score} Punkten!`);
    updateHud();
  });

  function renderScoreList() {
    const list = Highscore.top();
    scoreList.innerHTML = '';
    if (list.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Noch keine Highscores';
      scoreList.appendChild(li);
      return;
    }
    list.forEach((h, i) => {
      const li = document.createElement('li');
      const left = document.createElement('span');
      left.textContent = `${i + 1}. ${h.name}${h.character ? ' · ' + h.character : ''}`;
      const right = document.createElement('span');
      right.textContent = h.score;
      li.appendChild(left);
      li.appendChild(right);
      scoreList.appendChild(li);
    });
  }

  // ── Loop ─────────────────────────────────────────────────────────────
  function loop() {
    if (!state.paused) {
      update();
      render();
    }
    requestAnimationFrame(loop);
  }

  // ── Boot ─────────────────────────────────────────────────────────────
  renderCharacterPicker();
  state.grid = parseMaze();
  updateHud();
  // initial render so the maze is visible behind overlay
  render();
  loop();
})();
