// ===== PLAYER COLORS (Catan-themed) =====
const PLAYER_COLORS = ['#C0392B', '#2E86C1', '#229954', '#F39C12', '#8E44AD', '#1ABC9C'];
const PLAYER_NAMES  = ['Red', 'Blue', 'Green', 'Orange', 'Purple', 'Teal'];

// ===== STATE =====
let state = {
  players: [],
  turnDuration: 30,      // seconds
  fivePlayerMode: false,
  currentPlayerIndex: 0,
  turnNumber: 1,
  phase: 'idle',         // 'idle' | 'turn' | 'build'
  buildQueue: [],        // player indices who still need to build
  timer: null,
  timeRemaining: 0,
  dragSrcIndex: null,
};

// ===== AUDIO (Web Audio API beeps) =====
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function beep(freq = 440, duration = 0.15, gain = 0.4) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch(e) { /* audio not supported */ }
}
function beepEndOfTurn() {
  beep(880, 0.15, 0.5);
  setTimeout(() => beep(660, 0.2, 0.5), 200);
  setTimeout(() => beep(440, 0.4, 0.6), 420);
}
function beepWarning() {
  beep(660, 0.1, 0.3);
}

// ===== SETUP: TIME SELECTION =====
document.querySelectorAll('.time-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const secs = parseInt(btn.dataset.seconds, 10);
    const customRow = document.getElementById('custom-time-row');
    if (secs === 0) {
      customRow.classList.remove('hidden');
    } else {
      customRow.classList.add('hidden');
      state.turnDuration = secs;
    }
  });
});

document.getElementById('custom-minutes').addEventListener('input', updateCustomTime);
document.getElementById('custom-seconds').addEventListener('input', updateCustomTime);
function updateCustomTime() {
  const m = parseInt(document.getElementById('custom-minutes').value, 10) || 0;
  const s = parseInt(document.getElementById('custom-seconds').value, 10) || 0;
  state.turnDuration = m * 60 + s;
}

document.getElementById('five-player-toggle').addEventListener('change', e => {
  state.fivePlayerMode = e.target.checked;
});

// ===== SETUP: PLAYER MANAGEMENT =====
function addPlayer() {
  if (state.players.length >= 6) return;
  const idx = state.players.length;
  const id  = Date.now() + Math.random();
  state.players.push({ id, name: '', color: PLAYER_COLORS[idx] });
  renderPlayerList();
  // focus new input
  setTimeout(() => {
    const inputs = document.querySelectorAll('.player-name-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 50);
}

function removePlayer(id) {
  state.players = state.players.filter(p => p.id !== id);
  // re-assign colors by position
  state.players.forEach((p, i) => { p.color = PLAYER_COLORS[i]; });
  renderPlayerList();
}

function movePlayer(index, dir) {
  const newIdx = index + dir;
  if (newIdx < 0 || newIdx >= state.players.length) return;
  const tmp = state.players[index];
  state.players[index] = state.players[newIdx];
  state.players[newIdx] = tmp;
  // re-assign colors
  state.players.forEach((p, i) => { p.color = PLAYER_COLORS[i]; });
  renderPlayerList();
}

function renderPlayerList() {
  const list = document.getElementById('player-list');
  list.innerHTML = '';
  state.players.forEach((player, i) => {
    const li = document.createElement('li');
    li.className = 'player-item';
    li.draggable = true;
    li.dataset.index = i;

    li.innerHTML = `
      <span class="drag-handle" title="Drag to reorder">⠿</span>
      <span class="player-color-dot" style="background:${player.color}"></span>
      <input class="player-name-input" type="text" placeholder="${PLAYER_NAMES[i]}" maxlength="20" value="${escHtml(player.name)}" data-id="${player.id}" />
      <div class="order-btns">
        <button class="order-btn" onclick="movePlayer(${i}, -1)" title="Move up">▲</button>
        <button class="order-btn" onclick="movePlayer(${i}, 1)" title="Move down">▼</button>
      </div>
      <button class="remove-btn" onclick="removePlayer(${player.id})" title="Remove">✕</button>
    `;

    // Sync name input
    li.querySelector('.player-name-input').addEventListener('input', e => {
      const p = state.players.find(p => p.id == e.target.dataset.id);
      if (p) p.name = e.target.value;
    });

    // Drag-and-drop
    li.addEventListener('dragstart', e => {
      state.dragSrcIndex = i;
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => li.style.opacity = '0.4', 0);
    });
    li.addEventListener('dragend', () => { li.style.opacity = ''; });
    li.addEventListener('dragover', e => { e.preventDefault(); li.classList.add('drag-over'); });
    li.addEventListener('dragleave', () => li.classList.remove('drag-over'));
    li.addEventListener('drop', e => {
      e.preventDefault();
      li.classList.remove('drag-over');
      if (state.dragSrcIndex === null || state.dragSrcIndex === i) return;
      const moved = state.players.splice(state.dragSrcIndex, 1)[0];
      state.players.splice(i, 0, moved);
      state.players.forEach((p, idx) => { p.color = PLAYER_COLORS[idx]; });
      state.dragSrcIndex = null;
      renderPlayerList();
    });

    list.appendChild(li);
  });
}

// Initial players
addPlayer();
addPlayer();

// ===== START GAME =====
function startGame() {
  // Collect player names from inputs
  document.querySelectorAll('.player-name-input').forEach((input, i) => {
    if (state.players[i]) {
      state.players[i].name = input.value.trim() || PLAYER_NAMES[i];
    }
  });

  const errorEl = document.getElementById('setup-error');
  if (state.players.length < 2) {
    errorEl.textContent = 'Add at least 2 players!';
    errorEl.classList.remove('hidden');
    return;
  }
  if (state.turnDuration < 5) {
    errorEl.textContent = 'Turn time must be at least 5 seconds.';
    errorEl.classList.remove('hidden');
    return;
  }
  errorEl.classList.add('hidden');

  state.currentPlayerIndex = 0;
  state.turnNumber = 1;
  state.phase = 'idle';
  state.timeRemaining = state.turnDuration;

  showScreen('game-screen');
  showPhase('turn');
  renderGame();
}

function backToSetup() {
  clearTimer();
  state.phase = 'idle';
  showScreen('setup-screen');
}

// ===== GAME LOGIC =====
function startTurn() {
  if (state.phase !== 'idle') return;
  state.phase = 'turn';
  state.timeRemaining = state.turnDuration;
  renderGame();

  state.timer = setInterval(() => {
    state.timeRemaining--;
    renderTimerDisplay();
    if (state.timeRemaining <= 10 && state.timeRemaining > 0) beepWarning();
    if (state.timeRemaining <= 0) {
      clearTimer();
      beepEndOfTurn();
      endTurn();
    }
  }, 1000);
}

function endTurn() {
  clearTimer();
  if (state.fivePlayerMode && state.players.length >= 2) {
    startBuildPhase();
  } else {
    nextPlayer();
  }
}

function startBuildPhase() {
  // Build queue: all OTHER players in turn order starting after current
  state.buildQueue = [];
  const n = state.players.length;
  for (let i = 1; i < n; i++) {
    state.buildQueue.push((state.currentPlayerIndex + i) % n);
  }
  state.phase = 'build';
  showPhase('build');
  renderBuildPhase();
}

function doneBuilding() {
  beep(550, 0.12, 0.3);
  state.buildQueue.shift();
  if (state.buildQueue.length === 0) {
    nextPlayer();
  } else {
    renderBuildPhase();
  }
}

function nextPlayer() {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  if (state.currentPlayerIndex === 0) state.turnNumber++;
  state.phase = 'idle';
  state.timeRemaining = state.turnDuration;
  showPhase('turn');
  renderGame();
}

// ===== RENDER =====
function renderGame() {
  const player = state.players[state.currentPlayerIndex];

  document.getElementById('turn-number').textContent = `Turn ${state.turnNumber}`;
  document.getElementById('current-player-name').textContent = player.name;
  document.getElementById('player-role').textContent = 'Your turn';

  renderTimerDisplay();
  renderTurnControls();
  renderTurnOrderList();
}

function renderTimerDisplay() {
  const el = document.getElementById('timer-display');
  const t  = state.timeRemaining;
  if (state.phase === 'idle') {
    el.textContent = formatTime(state.turnDuration);
    el.className = 'timer-display';
  } else if (state.phase === 'turn') {
    el.textContent = formatTime(t);
    el.className = 'timer-display' + (t <= 10 ? ' danger' : t <= 20 ? ' warning' : '');
  }
}

function renderTurnControls() {
  const startBtn = document.getElementById('start-turn-btn');
  const endBtn   = document.getElementById('end-turn-btn');
  if (state.phase === 'idle') {
    startBtn.classList.remove('hidden');
    endBtn.classList.add('hidden');
  } else {
    startBtn.classList.add('hidden');
    endBtn.classList.remove('hidden');
  }
}

function renderTurnOrderList() {
  const ul = document.getElementById('turn-order-list');
  ul.innerHTML = '';
  state.players.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = 'turn-order-item' + (i === state.currentPlayerIndex ? ' is-active' : '');
    li.innerHTML = `
      <span class="order-num">${i + 1}</span>
      <span class="order-dot" style="background:${p.color}"></span>
      <span>${escHtml(p.name)}</span>
    `;
    ul.appendChild(li);
  });
}

function renderBuildPhase() {
  const buildingPlayerIdx = state.buildQueue[0];
  const player = state.players[buildingPlayerIdx];
  document.getElementById('build-player-name').textContent = player.name;

  const ul = document.getElementById('build-order-list');
  ul.innerHTML = '';
  // Show all non-active players in build queue order
  const n = state.players.length;
  for (let i = 1; i < n; i++) {
    const idx = (state.currentPlayerIndex + i) % n;
    const p   = state.players[idx];
    const isDone = !state.buildQueue.includes(idx);
    const isNow  = idx === buildingPlayerIdx;
    const li = document.createElement('li');
    li.className = 'turn-order-item' + (isNow ? ' is-active' : '') + (isDone ? ' is-done' : '');
    li.innerHTML = `
      <span class="order-dot" style="background:${p.color}"></span>
      <span>${escHtml(p.name)}</span>
      ${isDone ? '<span style="margin-left:auto;font-size:0.8rem">✓</span>' : ''}
    `;
    ul.appendChild(li);
  }
}

// ===== UTILITIES =====
function formatTime(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function clearTimer() {
  if (state.timer) { clearInterval(state.timer); state.timer = null; }
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function showPhase(phase) {
  document.getElementById('turn-phase').classList.toggle('hidden', phase !== 'turn');
  document.getElementById('build-phase').classList.toggle('hidden', phase !== 'build');
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
