// ===== PLAYER COLORS (Catan-themed defaults) =====
const PLAYER_COLORS = ['#C0392B', '#2E86C1', '#229954', '#F39C12', '#8E44AD', '#1ABC9C'];
const PLAYER_NAMES  = ['Red', 'Blue', 'Green', 'Orange', 'Purple', 'Teal'];

// ===== STATE =====
let state = {
  players: [],
  turnDuration: 30,
  fivePlayerMode: false,
  currentPlayerIndex: 0,
  turnNumber: 1,
  phase: 'idle',       // 'idle' | 'turn' | 'build'
  timer: null,
  timeRemaining: 0,
  paused: false,
  dragSrcIndex: null,
};

// ===== AUDIO =====
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}
function beep(freq, duration, gain, type = 'sine') {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const g   = ctx.createGain();
    osc.connect(g);
    g.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) { /* audio not supported */ }
}
function beepEndOfTurn() {
  // Three-tone descending alert — loud and distinct
  beep(880, 0.18, 0.7);
  setTimeout(() => beep(660, 0.18, 0.7), 220);
  setTimeout(() => beep(440, 0.5,  0.8), 440);
}
function beepWarning() {
  beep(700, 0.08, 0.25);
}
function beepDoneBuilding() {
  beep(550, 0.12, 0.3);
}
// Warm up audio context on first user interaction so end-of-turn beep always works
document.addEventListener('click', () => { try { getAudioCtx(); } catch(e){} }, { once: true });

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
  // Assign a default color not already in use
  const usedColors = new Set(state.players.map(p => p.color));
  const color = PLAYER_COLORS.find(c => !usedColors.has(c)) || PLAYER_COLORS[idx % PLAYER_COLORS.length];
  state.players.push({ id, name: '', color });
  renderPlayerList();
  setTimeout(() => {
    const inputs = document.querySelectorAll('.player-name-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 50);
}

function removePlayer(id) {
  state.players = state.players.filter(p => p.id !== id);
  // Do NOT reassign colors — keep each player's chosen color
  renderPlayerList();
}

function movePlayer(index, dir) {
  const newIdx = index + dir;
  if (newIdx < 0 || newIdx >= state.players.length) return;
  [state.players[index], state.players[newIdx]] = [state.players[newIdx], state.players[index]];
  // Do NOT reassign colors on reorder
  renderPlayerList();
}

function updatePlayerColor(id, color) {
  const p = state.players.find(p => p.id == id);
  if (p) p.color = color;
  // update the dot on the color input itself (handled by value binding)
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
      <input class="color-picker" type="color" value="${player.color}" data-id="${player.id}" title="Pick colour" />
      <input class="player-name-input" type="text" placeholder="${PLAYER_NAMES[i]}" maxlength="20" value="${escHtml(player.name)}" data-id="${player.id}" />
      <div class="order-btns">
        <button class="order-btn" onclick="movePlayer(${i}, -1)" title="Move up">▲</button>
        <button class="order-btn" onclick="movePlayer(${i}, 1)" title="Move down">▼</button>
      </div>
      <button class="remove-btn" onclick="removePlayer(${player.id})" title="Remove">✕</button>
    `;

    // Sync name
    li.querySelector('.player-name-input').addEventListener('input', e => {
      const p = state.players.find(p => p.id == e.target.dataset.id);
      if (p) p.name = e.target.value;
    });

    // Sync color — prevent drag from firing on color input click
    const colorInput = li.querySelector('.color-picker');
    colorInput.addEventListener('input', e => updatePlayerColor(e.target.dataset.id, e.target.value));
    colorInput.addEventListener('mousedown', e => e.stopPropagation());
    colorInput.addEventListener('touchstart', e => e.stopPropagation());

    // ===== DRAG AND DROP =====
    li.addEventListener('dragstart', e => {
      // Must set data for Firefox compatibility
      e.dataTransfer.setData('text/plain', String(i));
      e.dataTransfer.effectAllowed = 'move';
      state.dragSrcIndex = i;
      // Delay opacity so ghost image captures full opacity
      requestAnimationFrame(() => li.classList.add('dragging'));
    });

    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      // Clean up any lingering drag-over highlights
      document.querySelectorAll('.player-item').forEach(el => el.classList.remove('drag-over'));
    });

    li.addEventListener('dragenter', e => {
      e.preventDefault();
      if (state.dragSrcIndex !== null && state.dragSrcIndex !== i) {
        li.classList.add('drag-over');
      }
    });

    // dragover must be prevented to allow drop
    li.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });

    // Only remove highlight when actually leaving the li (not just entering a child)
    li.addEventListener('dragleave', e => {
      if (!li.contains(e.relatedTarget)) li.classList.remove('drag-over');
    });

    li.addEventListener('drop', e => {
      e.preventDefault();
      li.classList.remove('drag-over');
      if (state.dragSrcIndex === null || state.dragSrcIndex === i) return;
      const moved = state.players.splice(state.dragSrcIndex, 1)[0];
      state.players.splice(i, 0, moved);
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
  // Collect current input values
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
  state.paused = false;
  showScreen('setup-screen');
}

// ===== GAME LOGIC =====
function startTurn() {
  if (state.phase !== 'idle') return;
  state.phase = 'turn';
  state.paused = false;
  state.timeRemaining = state.turnDuration;
  renderGame();
  runTimer();
}

function runTimer() {
  clearTimer();
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

function pauseTurn() {
  if (state.phase !== 'turn') return;
  state.paused = !state.paused;
  if (state.paused) {
    clearTimer();
  } else {
    runTimer();
  }
  renderTurnControls();
  renderTimerDisplay();
}

function addTime(secs) {
  if (state.phase !== 'turn') return;
  state.timeRemaining += secs;
  renderTimerDisplay();
}

function resetTimer() {
  state.timeRemaining = state.turnDuration;
  renderTimerDisplay();
}

function selectPlayer(idx) {
  clearTimer();
  state.currentPlayerIndex = idx;
  state.phase = 'idle';
  state.paused = false;
  state.timeRemaining = state.turnDuration;
  showPhase('turn');
  renderGame();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function endTurn() {
  clearTimer();
  state.paused = false;
  if (state.fivePlayerMode) {
    startBuildPhase();
  } else {
    nextPlayer();
  }
}

function startBuildPhase() {
  state.phase = 'build';
  showPhase('build');
}

function doneBuilding() {
  beepDoneBuilding();
  nextPlayer();
}

function nextPlayer() {
  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  if (state.currentPlayerIndex === 0) state.turnNumber++;
  state.phase = 'idle';
  state.paused = false;
  state.timeRemaining = state.turnDuration;
  showPhase('turn');
  renderGame();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  const panel = document.getElementById('turn-phase');
  panel.classList.add('new-turn-flash');
  setTimeout(() => panel.classList.remove('new-turn-flash'), 700);
}

// ===== RENDER =====
function renderGame() {
  const player = state.players[state.currentPlayerIndex];
  document.getElementById('turn-number').textContent = `Turn ${state.turnNumber}`;
  document.getElementById('current-player-name').textContent = player.name;
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
    if (state.paused)   el.className = 'timer-display paused';
    else if (t <= 10)   el.className = 'timer-display danger';
    else if (t <= 20)   el.className = 'timer-display warning';
    else                el.className = 'timer-display';
  }
}

function renderTurnControls() {
  const isActive = state.phase === 'turn';
  document.getElementById('start-turn-btn').classList.toggle('hidden', isActive);
  document.getElementById('active-controls').classList.toggle('hidden', !isActive);
  if (isActive) {
    document.getElementById('pause-btn').textContent = state.paused ? 'Resume' : 'Pause';
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
    li.addEventListener('click', () => selectPlayer(i));
    ul.appendChild(li);
  });
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
