// DOM layer: start overlay, HUD (shell counter, phase, objective, toast) and
// the touch joystick + jump button. Keeps no game state; main.js reads input
// vectors from here every frame.

export function createUI({ onStart }) {
  const el = {
    loading: document.getElementById('loading'),
    startBtn: document.getElementById('startBtn'),
    hud: document.getElementById('hud'),
    phase: document.getElementById('phase'),
    shells: document.getElementById('shells'),
    objective: document.getElementById('objective'),
    toast: document.getElementById('toast'),
    joystick: document.getElementById('joystick'),
    knob: document.getElementById('joystickKnob'),
    jumpBtn: document.getElementById('jumpBtn')
  };

  const input = {
    moveX: 0, // screen space: right is +, up is +
    moveY: 0,
    joystickActive: false,
    jumpQueued: false,
    keys: new Set()
  };

  // ---- start overlay -------------------------------------------------------
  let started = false;
  el.startBtn.addEventListener('click', () => {
    if (started) return;
    started = true;
    el.loading.classList.add('hidden');
    el.hud.classList.add('on');
    onStart();
  });

  // ---- keyboard ------------------------------------------------------------
  const KEYMAP = {
    KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down',
    KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right'
  };
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      input.jumpQueued = true;
      e.preventDefault();
      return;
    }
    const k = KEYMAP[e.code];
    if (k) input.keys.add(k);
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (k) input.keys.delete(k);
  });

  // ---- joystick ------------------------------------------------------------
  let joyPointer = null;
  const joyRadius = 46;
  function setKnob(dx, dy) {
    el.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }
  el.joystick.addEventListener('pointerdown', (e) => {
    joyPointer = e.pointerId;
    try { el.joystick.setPointerCapture(e.pointerId); } catch { /* synthetic pointers in tests */ }
    input.joystickActive = true;
    e.preventDefault();
  });
  el.joystick.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joyPointer) return;
    const rect = el.joystick.getBoundingClientRect();
    let dx = e.clientX - (rect.left + rect.width / 2);
    let dy = e.clientY - (rect.top + rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > joyRadius) {
      dx *= joyRadius / len;
      dy *= joyRadius / len;
    }
    setKnob(dx, dy);
    input.moveX = dx / joyRadius;
    input.moveY = -dy / joyRadius;
  });
  function endJoystick(e) {
    if (e.pointerId !== joyPointer) return;
    joyPointer = null;
    input.joystickActive = false;
    input.moveX = 0;
    input.moveY = 0;
    setKnob(0, 0);
  }
  el.joystick.addEventListener('pointerup', endJoystick);
  el.joystick.addEventListener('pointercancel', endJoystick);

  // ---- jump button ---------------------------------------------------------
  el.jumpBtn.addEventListener('pointerdown', (e) => {
    input.jumpQueued = true;
    e.preventDefault();
  });

  // ---- toast ---------------------------------------------------------------
  let toastTimer = 0;
  function toast(text, ms = 2600) {
    el.toast.textContent = text;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), ms);
  }

  return {
    elements: el,
    get started() { return started; },
    // Resolved per-frame move input in screen space (x right, y forward).
    readMove() {
      if (input.joystickActive) return { x: input.moveX, y: input.moveY };
      let x = 0;
      let y = 0;
      if (input.keys.has('up')) y += 1;
      if (input.keys.has('down')) y -= 1;
      if (input.keys.has('left')) x -= 1;
      if (input.keys.has('right')) x += 1;
      return { x, y };
    },
    consumeJump() {
      const j = input.jumpQueued;
      input.jumpQueued = false;
      return j;
    },
    queueJump() { input.jumpQueued = true; },
    setJoystick(x, y) {
      input.joystickActive = true;
      input.moveX = x;
      input.moveY = y;
      setKnob(x * joyRadius, -y * joyRadius);
    },
    releaseJoystick() {
      input.joystickActive = false;
      input.moveX = 0;
      input.moveY = 0;
      setKnob(0, 0);
    },
    setShells(collected, total) {
      el.shells.textContent = `🐚 ${collected}/${total}`;
    },
    setPhase(name) {
      el.phase.textContent = name.toUpperCase();
    },
    setObjective(text) {
      el.objective.textContent = text;
    },
    toast
  };
}
