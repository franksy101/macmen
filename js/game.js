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

  canvas.width = COLS * TILE_SIZE;
  canvas.height = ROWS * TILE_SIZE;

  const state = {
    grid: null,
    pelletsLeft: 0,
    initialPellets: 0,
    score: 0,
    level: 1,
    lives: 3,
    running: false,
    paused: false,
    powerTimer: 0,
    selectedCharacterId: 'marc',
    player: null,
    ghosts: [],
    deathTimer: 0,
    flashTimer: 0,
    bonusFruit: null,    // {x, y, value, timer}
    fruitsEatenThisLevel: 0,
    ghostStreak: 0,      // 200/400/800/1600 in single power-up
    levelStartCountdown: 90, // wait at level start
  };

  // ── Level-tuning ─────────────────────────────────────────────────────
  function levelTuning(lv) {
    return {
      playerSpeed:  Math.min(1.3 + lv * 0.10, 2.6),
      ghostSpeed:   Math.min(1.0 + lv * 0.10, 2.3),
      ghostScared:  Math.max(0.9 - lv * 0.03, 0.6),
      ghostEaten:   3.0,
      powerTime:    Math.max(420 - lv * 30, 120), // frames @60fps
      releaseInterval: Math.max(260 - lv * 18, 80), // frames between ghost releases
      fruitValue:   100 + (lv - 1) * 100,
    };
  }

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

  // ── Entity helpers ───────────────────────────────────────────────────
  function makeEntity(col, row, color, name, personality) {
    return {
      col, row,
      x: col * TILE_SIZE + TILE_SIZE / 2,
      y: row * TILE_SIZE + TILE_SIZE / 2,
      dir: { ...DIR.NONE },
      nextDir: { ...DIR.NONE },
      speed: 2.0,
      color, name, personality,
      mouthPhase: 0,
      scared: false,
      eaten: false,
      inHouse: false,
      releaseTimer: 0,
      home: { col, row },
    };
  }

  function spawnPlayer() {
    const ch = CHARACTERS.find(c => c.id === state.selectedCharacterId);
    const t = levelTuning(state.level);
    state.player = makeEntity(PLAYER_SPAWN.col, PLAYER_SPAWN.row, ch.color, ch.name, 'player');
    state.player.speed = t.playerSpeed;
    state.player.dir = { ...DIR.LEFT };
    state.player.nextDir = { ...DIR.LEFT };
  }

  function spawnGhosts() {
    state.ghosts = [];
    const others = CHARACTERS.filter(c => c.id !== state.selectedCharacterId);
    const t = levelTuning(state.level);
    const shuffled = others.slice().sort(() => Math.random() - 0.5).slice(0, 4);
    shuffled.forEach((ch, i) => {
      const p = GHOST_HOUSE[i];
      const g = makeEntity(p.col, p.row, ch.color, ch.name, ch.personality);
      g.speed = t.ghostSpeed;
      g.inHouse = true;
      g.releaseTimer = i * t.releaseInterval;
      g.dir = { ...(i % 2 === 0 ? DIR.UP : DIR.DOWN) };
      state.ghosts.push(g);
    });
  }

  // ── Movement ─────────────────────────────────────────────────────────
  function tileAt(col, row) {
    if (row < 0 || row >= ROWS) return TILE.WALL;
    if (col < 0 || col >= COLS) return TILE.EMPTY; // tunnel wrap zone
    return state.grid[row][col];
  }

  function isWallForPlayer(col, row) {
    const t = tileAt(col, row);
    return t === TILE.WALL || t === TILE.DOOR || t === TILE.HOUSE;
  }

  function isWallForGhost(col, row, ghost) {
    const t = tileAt(col, row);
    if (t === TILE.WALL) return true;
    // door is passable for ghosts (entering house when eaten OR leaving when released)
    if (t === TILE.DOOR) return false;
    return false;
  }

  function isAtCenter(e) {
    const cx = e.col * TILE_SIZE + TILE_SIZE / 2;
    const cy = e.row * TILE_SIZE + TILE_SIZE / 2;
    return Math.abs(e.x - cx) <= e.speed && Math.abs(e.y - cy) <= e.speed;
  }

  function snap(e) {
    e.x = e.col * TILE_SIZE + TILE_SIZE / 2;
    e.y = e.row * TILE_SIZE + TILE_SIZE / 2;
  }

  function updateTileFromPos(e) {
    e.col = Math.floor(e.x / TILE_SIZE);
    e.row = Math.floor(e.y / TILE_SIZE);
  }

  // Bewegt eine Entity um speed Pixel und stoppt am nächsten Tile-Center,
  // wenn die nächste Richtung versperrt ist. Ruft entscheideFn am Center auf.
  function stepEntity(e, decideFn) {
    const cx = e.col * TILE_SIZE + TILE_SIZE / 2;
    const cy = e.row * TILE_SIZE + TILE_SIZE / 2;
    // Distanz zum Center entlang der aktuellen Richtung
    const distToCenter = (e.dir.x !== 0)
      ? (cx - e.x) * e.dir.x
      : (e.dir.y !== 0)
        ? (cy - e.y) * e.dir.y
        : 0;

    if (e.dir.x === 0 && e.dir.y === 0) {
      // stillstehend: am Center entscheiden
      decideFn(e);
      return;
    }

    let remaining = e.speed;
    // Wenn das Center innerhalb dieses Schritts liegt (oder schon dahinter),
    // erst snappen, neu entscheiden, dann den Rest weiterlaufen.
    if (distToCenter >= 0 && distToCenter <= e.speed) {
      e.x = cx;
      e.y = cy;
      remaining -= distToCenter;
      decideFn(e);
    }
    e.x += e.dir.x * remaining;
    e.y += e.dir.y * remaining;

    // tunnel wrap
    if (e.x < -TILE_SIZE / 2) e.x = canvas.width + TILE_SIZE / 2 - 1;
    else if (e.x > canvas.width + TILE_SIZE / 2) e.x = -TILE_SIZE / 2 + 1;

    updateTileFromPos(e);
  }

  function movePlayer(p) {
    stepEntity(p, (e) => {
      // bevorzuge nextDir, falls möglich
      if ((e.nextDir.x !== 0 || e.nextDir.y !== 0)) {
        const nc = e.col + e.nextDir.x;
        const nr = e.row + e.nextDir.y;
        if (!isWallForPlayer(nc, nr)) {
          e.dir = { ...e.nextDir };
        }
      }
      // wenn aktuelle Richtung blockiert ist → stop
      const cc = e.col + e.dir.x;
      const cr = e.row + e.dir.y;
      if (isWallForPlayer(cc, cr)) {
        e.dir = { ...DIR.NONE };
      }
    });
  }

  function moveGhost(g) {
    stepEntity(g, (e) => ghostThink(e));
  }

  // ── Ghost AI ─────────────────────────────────────────────────────────
  function dirOptions(g) {
    const out = [];
    [DIR.UP, DIR.DOWN, DIR.LEFT, DIR.RIGHT].forEach(d => {
      // no reverse unless forced
      if (d.x === -g.dir.x && d.y === -g.dir.y && (g.dir.x !== 0 || g.dir.y !== 0)) return;
      const nc = g.col + d.x;
      const nr = g.row + d.y;
      const t = tileAt(nc, nr);
      if (t === TILE.WALL) return;
      // ghost in house cannot pass into HOUSE tiles unless moving toward door
      if (t === TILE.HOUSE && !g.inHouse && !g.eaten) return;
      // ghost can pass DOOR only if leaving house (going up) or returning (going down)
      if (t === TILE.DOOR) {
        if (g.eaten) {
          // returning ghost — only down
          if (d.y !== 1) return;
        } else if (g.inHouse) {
          // leaving — only up
          if (d.y !== -1) return;
        } else {
          // outside ghost — cannot re-enter through door
          return;
        }
      }
      out.push(d);
    });
    return out;
  }

  function dist2(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function ghostThink(g) {
    // Eaten — head back to door
    if (g.eaten) {
      const target = GHOST_RETURN;
      pickBestDir(g, target);
      // re-entered house?
      if (g.col === target.col && g.row === target.row + 2) {
        g.eaten = false;
        g.inHouse = true;
        g.releaseTimer = 60;
        g.speed = levelTuning(state.level).ghostSpeed;
      }
      return;
    }

    // Inside house — wait or release
    if (g.inHouse) {
      if (g.releaseTimer > 0) {
        // bob up/down
        const opts = dirOptions(g);
        if (opts.length === 0) {
          g.dir = { x: -g.dir.x, y: -g.dir.y };
          return;
        }
        // prefer vertical bob
        const vert = opts.filter(d => d.y !== 0);
        g.dir = { ...(vert[0] || opts[0]) };
        return;
      }
      // release: head for door
      pickBestDir(g, GHOST_EXIT);
      // emerged?
      if (g.row <= GHOST_EXIT.row) {
        g.inHouse = false;
      }
      return;
    }

    // Outside — choose target by personality
    const player = state.player;
    let target;
    if (g.scared) {
      // run away — target the corner farthest from player
      const corners = [{ col: 1, row: 1 }, { col: COLS - 2, row: 1 }, { col: 1, row: ROWS - 2 }, { col: COLS - 2, row: ROWS - 2 }];
      let best = corners[0]; let bestD = 0;
      corners.forEach(c => {
        const d = dist2(c.col, c.row, player.col, player.row);
        if (d > bestD) { bestD = d; best = c; }
      });
      target = best;
    } else {
      switch (g.personality) {
        case 'chaser':
          target = { col: player.col, row: player.row };
          break;
        case 'ambusher':
          target = { col: player.col + player.dir.x * 4, row: player.row + player.dir.y * 4 };
          break;
        case 'patrol': {
          const corners = [{ col: 1, row: 1 }, { col: COLS - 2, row: 1 }, { col: 1, row: ROWS - 2 }, { col: COLS - 2, row: ROWS - 2 }];
          target = corners[Math.floor((Date.now() / 4000) % 4)];
          break;
        }
        case 'flanker':
          target = { col: COLS - 1 - player.col, row: ROWS - 1 - player.row };
          break;
        case 'scared':
          if (dist2(g.col, g.row, player.col, player.row) < 36) {
            target = g.home;
          } else {
            target = { col: player.col, row: player.row };
          }
          break;
        case 'mirror':
          target = { col: COLS - 1 - player.col, row: player.row };
          break;
        case 'random':
        default:
          if (Math.random() < 0.4) {
            target = { col: player.col, row: player.row };
          } else {
            target = { col: Math.floor(Math.random() * COLS), row: Math.floor(Math.random() * ROWS) };
          }
          break;
      }
    }
    pickBestDir(g, target);
  }

  function pickBestDir(g, target) {
    const opts = dirOptions(g);
    if (opts.length === 0) {
      g.dir = { x: -g.dir.x, y: -g.dir.y };
      return;
    }
    if (opts.length === 1) {
      g.dir = { ...opts[0] };
      return;
    }
    let best = opts[0];
    let bestD = Infinity;
    opts.forEach(d => {
      const nc = g.col + d.x;
      const nr = g.row + d.y;
      const dd = dist2(nc, nr, target.col, target.row);
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
    state.initialPellets = state.pelletsLeft;
    state.powerTimer = 0;
    state.deathTimer = 0;
    state.flashTimer = 0;
    state.bonusFruit = null;
    state.fruitsEatenThisLevel = 0;
    state.ghostStreak = 0;
    state.levelStartCountdown = 90;
    spawnPlayer();
    spawnGhosts();
    updateHud();
  }

  function nextLevel() {
    state.level++;
    Sounds.stopSiren();
    Sounds.levelComplete();
    state.flashTimer = 90;
    setTimeout(() => {
      initLevel();
      Sounds.startSiren();
    }, 1700);
  }

  function loseLife() {
    state.lives--;
    state.deathTimer = 100;
    Sounds.stopSiren();
    Sounds.death();
    updateHud();
  }

  function endGame() {
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

  // ── Pellets / power / fruit ──────────────────────────────────────────
  function eatTile() {
    const p = state.player;
    const t = state.grid[p.row][p.col];
    if (t === TILE.PELLET) {
      state.grid[p.row][p.col] = TILE.EMPTY;
      state.pelletsLeft--;
      state.score += 10;
      Sounds.chomp();
      maybeSpawnFruit();
      updateHud();
    } else if (t === TILE.POWER) {
      state.grid[p.row][p.col] = TILE.EMPTY;
      state.pelletsLeft--;
      state.score += 50;
      const tune = levelTuning(state.level);
      state.powerTimer = tune.powerTime;
      state.ghostStreak = 0;
      state.ghosts.forEach(g => {
        if (!g.eaten && !g.inHouse) {
          g.scared = true;
          g.speed = tune.ghostScared;
          // reverse direction, classic pacman behaviour
          g.dir = { x: -g.dir.x, y: -g.dir.y };
        }
      });
      Sounds.power();
      updateHud();
    }

    // bonus fruit pickup
    if (state.bonusFruit) {
      const f = state.bonusFruit;
      const d = Math.hypot(p.x - f.x, p.y - f.y);
      if (d < TILE_SIZE * 0.7) {
        state.score += f.value;
        state.bonusFruit = null;
        state.fruitsEatenThisLevel++;
        Sounds.power();
        updateHud();
      }
    }
  }

  function maybeSpawnFruit() {
    if (state.bonusFruit) return;
    if (state.fruitsEatenThisLevel >= 2) return;
    const eaten = state.initialPellets - state.pelletsLeft;
    const trigger1 = Math.floor(state.initialPellets * 0.30);
    const trigger2 = Math.floor(state.initialPellets * 0.65);
    const t = levelTuning(state.level);
    if ((state.fruitsEatenThisLevel === 0 && eaten === trigger1) ||
        (state.fruitsEatenThisLevel === 1 && eaten === trigger2)) {
      state.bonusFruit = {
        x: PLAYER_SPAWN.col * TILE_SIZE + TILE_SIZE / 2,
        y: PLAYER_SPAWN.row * TILE_SIZE + TILE_SIZE / 2,
        value: t.fruitValue,
        timer: 540, // 9 seconds @60fps
      };
    }
  }

  function checkGhostCollision() {
    if (state.deathTimer > 0) return;
    const p = state.player;
    state.ghosts.forEach(g => {
      const d = Math.hypot(p.x - g.x, p.y - g.y);
      if (d < TILE_SIZE * 0.55) {
        if (g.scared && !g.eaten) {
          g.eaten = true;
          g.scared = false;
          g.speed = levelTuning(state.level).ghostEaten;
          state.ghostStreak = Math.min(state.ghostStreak + 1, 4);
          state.score += 200 * Math.pow(2, state.ghostStreak - 1); // 200/400/800/1600
          Sounds.ghostEaten();
          updateHud();
        } else if (!g.eaten) {
          loseLife();
        }
      }
    });
  }

  // ── Update ───────────────────────────────────────────────────────────
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
          endGame();
          return;
        }
        spawnPlayer();
        spawnGhosts();
        state.levelStartCountdown = 60;
        Sounds.startSiren();
      }
      return;
    }

    if (state.levelStartCountdown > 0) {
      state.levelStartCountdown--;
      return;
    }

    movePlayer(state.player);
    eatTile();

    state.ghosts.forEach(g => {
      if (g.inHouse && g.releaseTimer > 0) g.releaseTimer--;
      moveGhost(g);
    });

    if (state.bonusFruit) {
      state.bonusFruit.timer--;
      if (state.bonusFruit.timer <= 0) state.bonusFruit = null;
    }

    if (state.powerTimer > 0) {
      state.powerTimer--;
      if (state.powerTimer === 0) {
        const tune = levelTuning(state.level);
        state.ghosts.forEach(g => {
          if (g.scared) {
            g.scared = false;
            g.speed = tune.ghostSpeed;
          }
        });
      }
    }

    checkGhostCollision();

    if (state.pelletsLeft <= 0) nextLevel();
  }

  // ── Render ───────────────────────────────────────────────────────────
  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMaze();
    drawBonusFruit();
    if (state.player) drawPlayer();
    state.ghosts.forEach(drawGhost);
    if (state.deathTimer > 0) drawDeathFlash();
    if (state.flashTimer > 0) drawLevelFlash();
    if (state.levelStartCountdown > 0 && state.running) drawReady();
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
          ctx.arc(x + TILE_SIZE / 2, y + TILE_SIZE / 2, 2.5, 0, Math.PI * 2);
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
          ctx.fillRect(x + 2, y + TILE_SIZE / 2 - 2, TILE_SIZE - 4, 4);
        } else if (t === TILE.HOUSE) {
          // ghost house interior — soft color
          ctx.fillStyle = 'rgba(79, 109, 255, 0.05)';
          ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  function drawWallCell(c, r, x, y) {
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = '#4f6dff';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(79,109,255,0.5)';
    ctx.shadowBlur = 6;
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

  function drawBonusFruit() {
    if (!state.bonusFruit) return;
    const f = state.bonusFruit;
    ctx.save();
    ctx.translate(f.x, f.y);
    const blink = f.timer < 120 && Math.floor(Date.now() / 150) % 2 === 0;
    if (!blink) {
      // simple cherry / fruit
      ctx.fillStyle = '#ff4d4d';
      ctx.shadowColor = '#ff4d4d';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(-3, 3, 5, 0, Math.PI * 2);
      ctx.arc(4, 3, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#4fff8b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-3, -2);
      ctx.quadraticCurveTo(0, -8, 4, -2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer() {
    const p = state.player;
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
    if (g.eaten) color = 'rgba(255,255,255,0.2)';
    else if (g.scared) {
      const blink = state.powerTimer < 90 && Math.floor(Date.now() / 150) % 2 === 0;
      color = blink ? '#fff' : '#3a4fff';
    }

    ctx.save();
    ctx.fillStyle = color;
    if (!g.eaten && !g.scared) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI, 0, false);
    ctx.lineTo(x + r, y + r);
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

  function drawReady() {
    ctx.fillStyle = '#ffd83b';
    ctx.font = 'bold 20px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText('READY!', canvas.width / 2, canvas.height / 2 + 36);
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

  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => {
    Sounds.ensure();
    if (e.touches[0]) touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  });
  canvas.addEventListener('touchend', (e) => {
    if (!touchStart || !e.changedTouches[0]) return;
    const dx = e.changedTouches[0].clientX - touchStart.x;
    const dy = e.changedTouches[0].clientY - touchStart.y;
    if (Math.abs(dx) > Math.abs(dy)) setPlayerDir(dx > 0 ? DIR.RIGHT : DIR.LEFT);
    else setPlayerDir(dy > 0 ? DIR.DOWN : DIR.UP);
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
  render();
  loop();
})();
