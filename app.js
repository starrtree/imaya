(() => {
  const canvas = document.querySelector('#stage');
  const ctx = canvas.getContext('2d');
  const scenePanel = document.querySelector('#scenePanel');
  const controls = document.querySelector('#controls');
  const status = document.querySelector('#status');
  const keyGuide = document.querySelector('#keyGuide');

  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0;
  let H = 0;
  let t = 0;
  let last = performance.now() / 1000;
  let mode = 'idle';
  let draggingOrb = false;
  let audioContext = null;
  let statusTimer = null;
  let sequenceTimers = [];

  const pointer = { x: 0, y: 0, active: false };
  const held = {
    left: false,
    right: false,
    up: false,
    down: false,
    boost: false
  };

  const state = {
    centerX: 0,
    centerY: 0,
    bodyOffsetX: 0,
    bodyOffsetY: 0,
    bodyVelocityX: 0,
    bodyVelocityY: 0,
    orbOffsetX: 0,
    orbOffsetY: 0,
    orbTargetX: 0,
    orbTargetY: 0,
    eyeRadius: 46,
    orbRadius: 59,
    stemWidth: 29,
    hue: 199,
    orbHue: 43,
    bob: 0,
    energy: 0.2,
    shock: 0,
    starTime: 0,
    speech: '',
    speechTime: 0,
    modeStart: 0
  };

  const stars = [];
  const sparks = [];
  const trails = [];
  const clones = [];
  const lightning = [];

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, amount) => a + (b - a) * amount;
  const hsla = (h, s = 100, l = 60, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;

    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    state.centerX = W / 2;
    state.centerY = H * 0.42;

    stars.length = 0;
    const count = Math.min(130, Math.floor((W * H) / 6000));
    for (let i = 0; i < count; i += 1) {
      stars.push({
        x: Math.random() * W,
        y: Math.random() * H,
        radius: 0.3 + Math.random() * 1.7,
        alpha: 0.12 + Math.random() * 0.52,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();

  function bodyX() {
    return state.centerX + state.bodyOffsetX;
  }

  function bodyY() {
    return state.centerY + state.bodyOffsetY;
  }

  function eyeY() {
    return bodyY() - 112 + state.bob;
  }

  function orbBaseY() {
    return bodyY() + 98 + state.bob;
  }

  function orbX() {
    return bodyX() + state.orbOffsetX;
  }

  function orbY() {
    return orbBaseY() + state.orbOffsetY;
  }

  function notify(text, duration = 1100) {
    status.textContent = text;
    status.classList.add('show');
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => status.classList.remove('show'), duration);
  }

  function roundedRect(x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function radialGlow(x, y, radius, color) {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function clearSequence() {
    sequenceTimers.forEach(window.clearTimeout);
    sequenceTimers = [];
    document.querySelectorAll('button').forEach(button => button.classList.remove('active'));
  }

  function later(delay, callback) {
    sequenceTimers.push(window.setTimeout(callback, delay));
  }

  function spawnBurst(count, x = orbX(), y = orbY(), hue = state.orbHue) {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 5;
      sparks.push({
        x,
        y,
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        radius: 1.5 + Math.random() * 4,
        life: 0.7 + Math.random() * 0.8,
        hue
      });
    }
  }

  function spawnClones() {
    clones.length = 0;
    for (let i = 0; i < 7; i += 1) {
      clones.push({
        angle: (i * Math.PI * 2) / 7,
        orbitRadius: 105 + Math.random() * 45,
        life: 4.8,
        hue: state.orbHue + i * 28
      });
    }
  }

  function spawnStorm() {
    lightning.length = 0;
    for (let i = 0; i < 9; i += 1) {
      lightning.push({
        angle: Math.random() * Math.PI * 2,
        length: 80 + Math.random() * 130,
        life: 0.75 + Math.random() * 0.45
      });
    }
    spawnBurst(24, orbX(), orbY(), 190);
  }

  function speak(text = 'Ndewo.') {
    state.speech = text;
    state.speechTime = 2.2;

    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      const tones = [392, 523.25, 659.25, 783.99];
      tones.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = audioContext.currentTime + index * 0.08;

        oscillator.type = index % 2 ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.001, start);
        gain.gain.linearRampToValueAtTime(0.08, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);

        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.21);
      });
    } catch (_) {
      // Browsers can block audio until direct user interaction. Visual animation still runs.
    }
  }

  function setMode(nextMode) {
    mode = nextMode;
    state.modeStart = performance.now() / 1000;
    state.shock = 0.8;

    if (nextMode === 'color') {
      state.hue = (state.hue + 90 + Math.random() * 100) % 360;
      state.orbHue = (state.orbHue + 130 + Math.random() * 80) % 360;
      spawnBurst(28);
    }

    if (nextMode === 'bloom') spawnBurst(90);
    if (nextMode === 'clone') spawnClones();
    if (nextMode === 'storm') spawnStorm();

    if (nextMode === 'star') {
      state.starTime = 2.8;
      spawnBurst(45);
    }

    if (nextMode === 'speak') speak();

    if (nextMode === 'idle') {
      state.orbTargetX = 0;
      state.orbTargetY = 0;
    }
  }

  function playScene(scene) {
    clearSequence();
    document.querySelector(`[data-scene="${scene}"]`)?.classList.add('active');

    if (scene === 'awaken') {
      notify('Ịmaya awakens');
      setMode('glow');
      later(800, () => setMode('speak'));
      later(1600, () => setMode('bloom'));
      later(3000, () => setMode('idle'));
    }

    if (scene === 'scan') {
      notify('Scanning energy field');
      setMode('storm');
      later(500, () => speak('Scanning...'));
      later(1350, () => setMode('color'));
      later(2200, () => speak('Balanced.'));
    }

    if (scene === 'teach') {
      notify('Teach mode');
      speak('Watch the dot become an idea.');
      later(650, () => setMode('bloom'));
      later(1500, () => setMode('orbit'));
      later(3900, () => setMode('idle'));
    }

    if (scene === 'jump') {
      notify('Portal jump');
      setMode('portal');
      later(550, () => {
        state.orbTargetX = Math.min(155, W * 0.28);
        state.orbTargetY = -60;
        spawnBurst(24);
      });
      later(1350, () => {
        state.orbTargetX = -Math.min(155, W * 0.28);
        state.orbTargetY = 65;
        spawnBurst(24);
      });
      later(2300, () => setMode('idle'));
    }

    if (scene === 'build') {
      notify('Building sacred geometry');
      setMode('trail');
      const points = [[0, -85], [105, -15], [65, 90], [-65, 90], [-105, -15], [0, -85]];
      points.forEach((point, index) => {
        later(index * 320, () => {
          state.orbTargetX = point[0];
          state.orbTargetY = point[1];
          trails.push({ x: orbX(), y: orbY(), radius: state.orbRadius, life: 1, hue: state.orbHue });
          spawnBurst(7);
        });
      });
      later(2200, () => setMode('star'));
      later(3900, () => setMode('idle'));
    }

    if (scene === 'guard') {
      notify('Guardian shield active');
      setMode('storm');
      later(650, () => setMode('portal'));
      later(1400, spawnStorm);
      later(2100, () => speak('Protected.'));
    }

    if (scene === 'heal') {
      notify('Healing aura');
      setMode('color');
      later(500, () => setMode('glow'));
      later(1200, () => setMode('bloom'));
      later(1900, () => speak('Breathe in light.'));
      later(2900, () => setMode('levitate'));
    }

    if (scene === 'celebrate') {
      notify('Creation complete');
      setMode('clone');
      later(650, () => setMode('bloom'));
      later(1350, () => setMode('levitate'));
      later(2100, () => setMode('star'));
      later(3100, () => {
        spawnBurst(70);
        speak('Creation complete.');
      });
    }
  }

  scenePanel.addEventListener('click', event => {
    const button = event.target.closest('[data-scene]');
    if (button) playScene(button.dataset.scene);
  });

  controls.addEventListener('click', event => {
    const button = event.target.closest('[data-mode]');
    if (!button) return;

    clearSequence();
    button.classList.add('active');
    window.setTimeout(() => button.classList.remove('active'), 220);
    setMode(button.dataset.mode);
  });

  const sceneKeys = {
    '1': 'awaken',
    '2': 'scan',
    '3': 'teach',
    '4': 'jump',
    '5': 'build',
    '6': 'guard',
    '7': 'heal',
    '8': 'celebrate'
  };

  const modeKeys = {
    '0': 'idle',
    q: 'glow',
    w: 'portal',
    e: 'bloom',
    r: 'clone',
    t: 'trail',
    y: 'speak',
    u: 'color',
    i: 'levitate',
    o: 'storm',
    p: 'star'
  };

  window.addEventListener('keydown', event => {
    const key = event.key.toLowerCase();

    if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) {
      event.preventDefault();
      if (key === 'arrowleft') held.left = true;
      if (key === 'arrowright') held.right = true;
      if (key === 'arrowup') held.up = true;
      if (key === 'arrowdown') held.down = true;
      held.boost = event.shiftKey;
      return;
    }

    if (key === 'shift') {
      held.boost = true;
      return;
    }

    if (key === 'h') {
      keyGuide.classList.toggle('hidden');
      return;
    }

    if (event.repeat) return;

    if (sceneKeys[key]) {
      event.preventDefault();
      playScene(sceneKeys[key]);
    } else if (modeKeys[key]) {
      event.preventDefault();
      clearSequence();
      setMode(modeKeys[key]);
      notify(`${key.toUpperCase()} · ${modeKeys[key]}`);
    }
  });

  window.addEventListener('keyup', event => {
    const key = event.key.toLowerCase();
    if (key === 'arrowleft') held.left = false;
    if (key === 'arrowright') held.right = false;
    if (key === 'arrowup') held.up = false;
    if (key === 'arrowdown') held.down = false;
    if (key === 'shift') held.boost = false;
  });

  window.addEventListener('blur', () => {
    Object.assign(held, { left: false, right: false, up: false, down: false, boost: false });
  });

  canvas.addEventListener('pointerdown', event => {
    pointer.active = true;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (Math.hypot(pointer.x - orbX(), pointer.y - orbY()) < state.orbRadius * 1.7) {
      draggingOrb = true;
      setMode('trail');
      canvas.setPointerCapture?.(event.pointerId);
    }
  });

  canvas.addEventListener('pointermove', event => {
    pointer.active = true;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (!draggingOrb) return;

    state.orbTargetX = clamp(pointer.x - bodyX(), -W * 0.34, W * 0.34);
    state.orbTargetY = clamp(pointer.y - orbBaseY(), -H * 0.26, H * 0.28);
    trails.push({ x: orbX(), y: orbY(), radius: state.orbRadius, life: 1, hue: state.orbHue });
    if (trails.length > 60) trails.shift();
  });

  window.addEventListener('pointerup', () => {
    draggingOrb = false;
    if (mode === 'trail') {
      state.orbTargetX *= 0.68;
      state.orbTargetY *= 0.68;
    }
  });

  function drawBackground() {
    ctx.clearRect(0, 0, W, H);

    const gradient = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.5, Math.max(W, H) * 0.85);
    gradient.addColorStop(0, 'rgba(30,101,188,.32)');
    gradient.addColorStop(0.52, 'rgba(3,12,29,.14)');
    gradient.addColorStop(1, 'rgba(0,0,0,.38)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.strokeStyle = 'rgba(84,232,255,.16)';
    const grid = 42;
    for (let x = (t * 15) % grid - grid; x < W + grid; x += grid) {
      ctx.beginPath();
      ctx.moveTo(x, H * 0.16);
      ctx.lineTo(x + (W / 2 - x) * 0.12, H * 0.86);
      ctx.stroke();
    }
    for (let y = H * 0.2; y < H * 0.88; y += grid) {
      ctx.beginPath();
      ctx.moveTo(W * 0.04, y);
      ctx.lineTo(W * 0.96, y);
      ctx.stroke();
    }
    ctx.restore();

    stars.forEach(star => {
      star.phase += 0.02;
      ctx.fillStyle = `rgba(180,230,255,${star.alpha * (0.7 + 0.3 * Math.sin(star.phase))})`;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawEnergyCord(x1, y1, x2, y2) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let layer = 0; layer < 3; layer += 1) {
      ctx.strokeStyle = layer === 0
        ? 'rgba(84,232,255,.22)'
        : layer === 1
          ? 'rgba(255,212,93,.15)'
          : 'rgba(255,255,255,.1)';
      ctx.lineWidth = 2.1 - layer * 0.5;
      ctx.beginPath();

      for (let i = 0; i <= 70; i += 1) {
        const u = i / 70;
        const middleX = lerp(x1, x2, u);
        const middleY = lerp(y1, y2, u);
        const amplitude = Math.sin(u * Math.PI) * (13 + state.energy * 12);
        const x = middleX + Math.sin(u * Math.PI * 2 + t * 2 + layer * 2) * amplitude;
        const y = middleY + Math.cos(u * Math.PI * 2 + t * 2) * amplitude * 0.1;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawStem(eyeXValue, eyeYValue, orbXValue, orbYValue) {
    const dx = orbXValue - eyeXValue;
    const dy = orbYValue - eyeYValue;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const unitX = dx / distance;
    const unitY = dy / distance;

    const startX = eyeXValue + unitX * state.eyeRadius * 0.83;
    const startY = eyeYValue + unitY * state.eyeRadius * 0.83;
    const endX = orbXValue - unitX * state.orbRadius * 0.83;
    const endY = orbYValue - unitY * state.orbRadius * 0.83;

    const lineX = endX - startX;
    const lineY = endY - startY;
    const length = Math.max(8, Math.hypot(lineX, lineY));
    const angle = Math.atan2(lineY, lineX);
    const width = state.stemWidth + Math.sin(t * 2) * 1.3;

    ctx.save();
    ctx.translate(startX, startY);
    ctx.rotate(angle);
    ctx.shadowColor = hsla(state.hue, 100, 60, 0.45);
    ctx.shadowBlur = 20;

    const gradient = ctx.createLinearGradient(0, 0, length, 0);
    gradient.addColorStop(0, hsla(state.hue, 100, 62, 0.95));
    gradient.addColorStop(0.5, '#12376e');
    gradient.addColorStop(1, hsla(state.orbHue, 100, 55, 0.92));

    ctx.fillStyle = gradient;
    roundedRect(0, -width / 2, length, width, width / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.17)';
    ctx.stroke();
    ctx.restore();
  }

  function drawEye(x, y) {
    const radius = state.eyeRadius * (1 + state.shock * 0.04 + Math.sin(t * 2) * 0.015);
    radialGlow(x, y, radius * 2.3, hsla(state.hue, 100, 60, 0.25));

    ctx.save();
    ctx.shadowColor = hsla(state.hue, 100, 62, 0.9);
    ctx.shadowBlur = 24;

    const gradient = ctx.createRadialGradient(x - radius * 0.22, y - radius * 0.24, 2, x, y, radius);
    gradient.addColorStop(0, '#f7feff');
    gradient.addColorStop(0.28, hsla(state.hue + 18, 100, 75, 1));
    gradient.addColorStop(1, hsla(state.hue, 100, 41, 1));

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.68)';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    const targetX = pointer.active ? pointer.x : x + Math.sin(t) * 25;
    const targetY = pointer.active ? pointer.y : y + Math.cos(t * 0.7) * 16;
    const angle = Math.atan2(targetY - y, targetX - x);
    const distance = clamp(Math.hypot(targetX - x, targetY - y) / 220, 0, 1);
    const pupilX = x + Math.cos(angle) * distance * radius * 0.23;
    const pupilY = y + Math.sin(angle) * distance * radius * 0.23;
    const blink = mode === 'speak' ? Math.abs(Math.sin((t - state.modeStart) * 9)) : 0;

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(x, y, radius * 0.47, radius * (0.28 - blink * 0.18), 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#04101e';
    ctx.beginPath();
    ctx.arc(pupilX, pupilY, radius * 0.17, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(pupilX - radius * 0.055, pupilY - radius * 0.06, radius * 0.04, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawSacredGeometry(x, y, radius) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t * (['glow', 'portal', 'orbit'].includes(mode) ? 2.15 : 0.62));
    ctx.globalCompositeOperation = 'lighter';

    for (let layer = 0; layer < 6; layer += 1) {
      ctx.save();
      ctx.rotate((layer * Math.PI) / 3);
      ctx.strokeStyle = layer % 2 ? 'rgba(255,255,255,.72)' : 'rgba(84,232,255,.5)';
      ctx.lineWidth = 2.2;
      ctx.beginPath();

      for (let i = 0; i < 100; i += 1) {
        const u = i / 99;
        const angle = u * Math.PI * 2.25;
        const currentRadius = radius * u;
        const px = Math.cos(angle) * currentRadius;
        const py = Math.sin(angle) * currentRadius * 0.68;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }

      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawPortal(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < 8; i += 1) {
      const radius = state.orbRadius * (1.1 + i * 0.25 + Math.sin(t * 3 + i) * 0.05);
      ctx.strokeStyle = i % 2 ? 'rgba(84,232,255,.31)' : 'rgba(255,212,93,.26)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, radius, radius * 0.34, t * 0.5 + i * 0.42, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawStarShape(x, y, radius, fill) {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const currentRadius = i % 2 ? radius * 0.48 : radius * 1.05;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5 + t * 1.2;
      const px = x + Math.cos(angle) * currentRadius;
      const py = y + Math.sin(angle) * currentRadius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  function drawEffects(originX, originY) {
    for (let i = trails.length - 1; i >= 0; i -= 1) {
      const trail = trails[i];
      trail.life -= 0.024;
      if (trail.life <= 0) {
        trails.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = hsla(trail.hue, 100, 62, trail.life * 0.32);
      ctx.lineWidth = 4 * trail.life;
      ctx.beginPath();
      ctx.arc(trail.x, trail.y, trail.radius * (1.05 + (1 - trail.life) * 0.8), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const spark = sparks[i];
      spark.x += spark.velocityX;
      spark.y += spark.velocityY;
      spark.velocityX *= 0.985;
      spark.velocityY *= 0.985;
      spark.life -= 0.018;

      if (spark.life <= 0) {
        sparks.splice(i, 1);
        continue;
      }

      ctx.fillStyle = hsla(spark.hue, 100, 64, spark.life);
      ctx.beginPath();
      ctx.arc(spark.x, spark.y, spark.radius * spark.life, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let i = clones.length - 1; i >= 0; i -= 1) {
      const clone = clones[i];
      clone.angle += 0.028;
      clone.life -= 0.007;

      if (clone.life <= 0) {
        clones.splice(i, 1);
        continue;
      }

      const x = originX + Math.cos(clone.angle) * clone.orbitRadius;
      const y = originY + Math.sin(clone.angle) * clone.orbitRadius * 0.58;
      ctx.globalAlpha = clamp(clone.life / 2, 0, 0.75);
      ctx.fillStyle = hsla(clone.hue, 100, 62, 0.8);
      ctx.beginPath();
      ctx.arc(x, y, 10 + Math.sin(t * 5 + i) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = lightning.length - 1; i >= 0; i -= 1) {
      const bolt = lightning[i];
      bolt.life -= 0.02;

      if (bolt.life <= 0) {
        lightning.splice(i, 1);
        continue;
      }

      ctx.strokeStyle = `rgba(128,235,255,${bolt.life})`;
      ctx.lineWidth = 2 + bolt.life * 3;
      ctx.beginPath();
      ctx.moveTo(originX, originY);

      for (let segment = 1; segment <= 7; segment += 1) {
        const u = segment / 7;
        const x = originX + Math.cos(bolt.angle) * bolt.length * u + (Math.random() - 0.5) * 22;
        const y = originY + Math.sin(bolt.angle) * bolt.length * u + (Math.random() - 0.5) * 22;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawOrb(x, y) {
    const radius = state.orbRadius * (1 + (mode === 'glow' ? Math.sin(t * 5) * 0.08 : 0) + state.shock * 0.03);

    if (mode === 'portal') drawPortal(x, y);
    radialGlow(x, y, radius * 2.8, hsla(state.orbHue, 100, 58, 0.31));

    ctx.save();
    ctx.shadowColor = hsla(state.orbHue, 100, 60, 0.9);
    ctx.shadowBlur = mode === 'glow' ? 42 : 24;

    const gradient = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.3, 2, x, y, radius);
    gradient.addColorStop(0, '#fff8bd');
    gradient.addColorStop(0.34, hsla(state.orbHue, 100, 64, 1));
    gradient.addColorStop(1, hsla(state.orbHue - 42, 96, 47, 1));

    if (state.starTime > 0) {
      drawStarShape(x, y, radius, gradient);
    } else {
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = 'rgba(255,255,255,.72)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    drawSacredGeometry(x, y, radius * 0.77);
    drawEffects(x, y);
  }

  function drawSpeech(x, y) {
    if (state.speechTime <= 0) return;

    ctx.save();
    ctx.font = '700 15px system-ui';
    const width = ctx.measureText(state.speech).width;
    const boxX = x - width / 2 - 15;
    const boxY = y - 88;

    roundedRect(boxX, boxY, width + 30, 34, 17);
    ctx.fillStyle = 'rgba(3,12,29,.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(84,232,255,.45)';
    ctx.stroke();
    ctx.fillStyle = '#ecf8ff';
    ctx.fillText(state.speech, x - width / 2, boxY + 22);
    ctx.restore();
  }

  function update(dt) {
    state.energy = lerp(state.energy, mode === 'idle' ? 0.15 : 0.9, 0.025);
    state.shock = Math.max(0, state.shock - dt * 1.8);
    state.starTime = Math.max(0, state.starTime - dt);
    state.speechTime = Math.max(0, state.speechTime - dt);

    const targetBob = mode === 'levitate' ? Math.sin(t * 2.4) * 40 : Math.sin(t * 1.2) * 8;
    state.bob = lerp(state.bob, targetBob, 0.08);

    if (mode === 'orbit') {
      state.orbTargetX = Math.cos(t * 1.7) * Math.min(130, W * 0.22);
      state.orbTargetY = Math.sin(t * 1.7) * 58;
      trails.push({ x: orbX(), y: orbY(), radius: state.orbRadius, life: 0.82, hue: state.orbHue });
    }

    if (mode === 'glow' && Math.random() < 0.22) spawnBurst(1, orbX(), orbY());

    if (mode === 'portal' && Math.random() < 0.17) {
      trails.push({
        x: orbX(),
        y: orbY(),
        radius: state.orbRadius * (1 + Math.random() * 0.5),
        life: 0.7,
        hue: state.hue
      });
    }

    state.orbOffsetX = lerp(state.orbOffsetX, state.orbTargetX, 0.13);
    state.orbOffsetY = lerp(state.orbOffsetY, state.orbTargetY, 0.13);

    // Continuous input state makes movement start immediately and remain fluid while held.
    let moveX = (held.right ? 1 : 0) - (held.left ? 1 : 0);
    let moveY = (held.down ? 1 : 0) - (held.up ? 1 : 0);
    const inputLength = Math.hypot(moveX, moveY);

    // Normalize diagonal movement so diagonals are not faster.
    if (inputLength > 0) {
      moveX /= inputLength;
      moveY /= inputLength;
    }

    const maxSpeed = held.boost ? 520 : 300;
    const responsiveness = held.boost ? 18 : 15;
    const braking = 12;
    const targetVelocityX = moveX * maxSpeed;
    const targetVelocityY = moveY * maxSpeed;
    const blend = 1 - Math.exp(-(inputLength > 0 ? responsiveness : braking) * dt);

    state.bodyVelocityX = lerp(state.bodyVelocityX, inputLength > 0 ? targetVelocityX : 0, blend);
    state.bodyVelocityY = lerp(state.bodyVelocityY, inputLength > 0 ? targetVelocityY : 0, blend);
    state.bodyOffsetX += state.bodyVelocityX * dt;
    state.bodyOffsetY += state.bodyVelocityY * dt;

    const horizontalLimit = Math.max(30, W / 2 - Math.min(105, W * 0.2));
    const verticalLimit = Math.max(50, H / 2 - Math.min(165, H * 0.26));
    const clampedX = clamp(state.bodyOffsetX, -horizontalLimit, horizontalLimit);
    const clampedY = clamp(state.bodyOffsetY, -verticalLimit, verticalLimit);

    if (clampedX !== state.bodyOffsetX) state.bodyVelocityX = 0;
    if (clampedY !== state.bodyOffsetY) state.bodyVelocityY = 0;
    state.bodyOffsetX = clampedX;
    state.bodyOffsetY = clampedY;

    if (!draggingOrb && mode !== 'orbit') {
      state.orbTargetX = lerp(state.orbTargetX, 0, 0.012);
      state.orbTargetY = lerp(state.orbTargetY, 0, 0.012);
    }
  }

  function frame() {
    const now = performance.now() / 1000;
    const dt = Math.min(0.04, now - last);
    last = now;
    t = now;

    update(dt);
    drawBackground();

    const currentEyeX = bodyX();
    const currentEyeY = eyeY();
    const currentOrbX = orbX();
    const currentOrbY = orbY();

    drawEnergyCord(currentEyeX, currentEyeY, currentOrbX, currentOrbY);
    drawStem(currentEyeX, currentEyeY, currentOrbX, currentOrbY);
    drawEye(currentEyeX, currentEyeY);
    drawOrb(currentOrbX, currentOrbY);
    drawSpeech(currentEyeX, currentEyeY);

    window.requestAnimationFrame(frame);
  }

  frame();
})();