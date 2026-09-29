(() => {
  'use strict';

  const W = 1280;
  const H = 720;
  const GROUND_GRAVITY = 1480;
  const PLAYER_RADIUS = 19;
  const STORAGE_KEY = 'loopline-save-v1';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const ui = {
    overlay: document.getElementById('overlay'),
    startPanel: document.getElementById('startPanel'),
    pausePanel: document.getElementById('pausePanel'),
    resultPanel: document.getElementById('resultPanel'),
    hud: document.getElementById('hud'),
    startButton: document.getElementById('startButton'),
    resumeButton: document.getElementById('resumeButton'),
    retryButton: document.getElementById('retryButton'),
    pauseRetryButton: document.getElementById('pauseRetryButton'),
    homeButton: document.getElementById('homeButton'),
    pauseButton: document.getElementById('pauseButton'),
    soundButton: document.getElementById('soundButton'),
    districtName: document.getElementById('districtName'),
    distance: document.getElementById('distance'),
    score: document.getElementById('score'),
    collectCount: document.getElementById('collectCount'),
    titleBest: document.getElementById('titleBest'),
    finalDistance: document.getElementById('finalDistance'),
    finalScore: document.getElementById('finalScore'),
    finalCollect: document.getElementById('finalCollect'),
    resultTitle: document.getElementById('resultTitle'),
    resultMessage: document.getElementById('resultMessage')
  };

  const save = readSave();
  let soundOn = save.sound !== false;
  let audioContext = null;
  let state = 'title';
  let lastTime = 0;
  let sceneTime = 0;
  let runTime = 0;
  let startX = 180;
  let cameraX = 0;
  let score = 0;
  let distance = 0;
  let collected = 0;
  let bestDistance = Number(save.bestDistance) || 0;
  let bestScore = Number(save.bestScore) || 0;
  let platforms = [];
  let anchors = [];
  let obstacles = [];
  let coins = [];
  let gusts = [];
  let particles = [];
  let nextPlatformX = 0;
  let windPhase = 0;
  let shake = 0;
  let newBest = false;
  let player = makePlayer();

  function makePlayer() {
    return {
      x: startX,
      y: 516,
      vy: 0,
      grounded: true,
      groundY: 535,
      tether: null,
      tetherTime: 0,
      runCycle: 0,
      blink: 0,
      trail: []
    };
  }

  function readSave() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (_) { return {}; }
  }

  function writeSave() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ bestDistance, bestScore, sound: soundOn })); }
    catch (_) { /* Storage is optional; the current run still works. */ }
  }

  function playTone(freq, duration = 0.09, type = 'sine', volume = 0.045) {
    if (!soundOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') audioContext.resume();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, audioContext.currentTime);
      gain.gain.setValueAtTime(volume, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      osc.connect(gain).connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + duration);
    } catch (_) { /* Audio can be unavailable in restricted browsers. */ }
  }

  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function currentStage() { return Math.min(2, Math.floor(runTime / 60)); }
  function stageLabel(stage = currentStage()) {
    return ['도심 골목', '상가 지붕', '항구 창고'][stage];
  }
  function runSpeed() {
    return 320 * Math.min(1.5, 1 + currentStage() * 0.12 + Math.max(0, runTime % 60 - 24) * 0.0008);
  }

  function resetRun() {
    runTime = 0;
    score = 0;
    distance = 0;
    collected = 0;
    startX = 180;
    cameraX = 0;
    platforms = [];
    anchors = [];
    obstacles = [];
    coins = [];
    gusts = [];
    particles = [];
    newBest = false;
    shake = 0;
    player = makePlayer();
    platforms.push({ x: -900, w: 1680, y: 535, stage: 0 });
    nextPlatformX = 780;
    addCourseUntil(startX + 2600);
    syncHud();
  }

  function addCourseUntil(untilX) {
    while (nextPlatformX < untilX) {
      const stage = Math.min(2, Math.floor(runTime / 60));
      const prev = platforms[platforms.length - 1];
      const gap = rand(142 + stage * 20, 245 + stage * 39);
      const width = rand(390, 620);
      const roofY = clamp(prev.y + rand(-29, 29), 475, 548);
      const x = nextPlatformX + gap;
      const platform = { x, w: width, y: roofY, stage };
      const gapCenter = nextPlatformX + gap * rand(0.43, 0.58);

      anchors.push({ x: gapCenter, y: Math.min(prev.y, roofY) - rand(186, 220), glow: rand(0, Math.PI * 2), used: false });
      platforms.push(platform);

      const coinCount = Math.floor(rand(2, 5));
      const coinStart = x + rand(52, 95);
      for (let i = 0; i < coinCount; i++) {
        coins.push({ x: coinStart + i * 48, y: roofY - rand(62, 96) - Math.sin(i / Math.max(1, coinCount - 1) * Math.PI) * 28, taken: false, spin: rand(0, 5) });
      }
      if (gap > 190) {
        for (let i = 0; i < 3; i++) {
          coins.push({ x: nextPlatformX + gap * (0.34 + i * 0.12), y: Math.min(prev.y, roofY) - 84 - Math.sin(i / 2 * Math.PI) * 18, taken: false, spin: i });
        }
      }

      if (runTime > 17 && width > 490 && Math.random() < 0.48) {
        obstacles.push({ x: x + rand(170, width - 90), y: roofY, w: rand(34, 48), h: rand(31, 42), type: 'vent', phase: rand(0, 6) });
      }
      if (stage > 0 && width > 500 && Math.random() < 0.17) {
        gusts.push({ x: x + rand(110, width - 150), w: 130, y: roofY - 205, h: 185, phase: rand(0, 6) });
      }
      nextPlatformX = x + width;
    }
  }

  function showPanel(panel) {
    ui.startPanel.hidden = panel !== ui.startPanel;
    ui.pausePanel.hidden = panel !== ui.pausePanel;
    ui.resultPanel.hidden = panel !== ui.resultPanel;
    ui.overlay.hidden = !panel;
  }

  function beginRun() {
    resetRun();
    state = 'playing';
    ui.hud.hidden = false;
    showPanel(null);
    canvas.focus({ preventScroll: true });
    playTone(420, .12, 'triangle', .035);
  }

  function pauseRun() {
    if (state !== 'playing') return;
    state = 'paused';
    showPanel(ui.pausePanel);
  }

  function resumeRun() {
    if (state !== 'paused') return;
    state = 'playing';
    showPanel(null);
    lastTime = performance.now();
    canvas.focus({ preventScroll: true });
  }

  function goHome() {
    state = 'title';
    resetRun();
    ui.hud.hidden = true;
    ui.titleBest.textContent = `${bestDistance.toLocaleString()} m`;
    showPanel(ui.startPanel);
  }

  function finishRun(reason = 'fall') {
    if (state !== 'playing') return;
    state = 'over';
    player.tether = null;
    shake = 1;
    newBest = distance > bestDistance;
    if (newBest) bestDistance = distance;
    if (score > bestScore) bestScore = score;
    writeSave();
    ui.finalDistance.textContent = distance.toLocaleString();
    ui.finalScore.textContent = score.toLocaleString();
    ui.finalCollect.textContent = collected.toString();
    ui.resultTitle.textContent = newBest ? '새 기록이에요!' : '배송 종료';
    ui.resultTitle.classList.toggle('new-best', newBest);
    ui.resultMessage.textContent = reason === 'crash' ? '환풍구에 부딪혔어요. 다음엔 한 박자 일찍 점프해요.' : '지붕 끝에서 미끄러졌어요. 와이어를 놓는 순간을 바꿔보세요.';
    ui.hud.hidden = true;
    showPanel(ui.resultPanel);
    playTone(150, .28, 'triangle', .06);
  }

  function syncHud() {
    ui.distance.textContent = distance.toLocaleString();
    ui.score.textContent = score.toLocaleString();
    ui.collectCount.textContent = collected.toString();
    ui.districtName.textContent = stageLabel();
  }

  function jump() {
    if (state !== 'playing') return;
    if (player.grounded) {
      player.grounded = false;
      player.vy = -650;
      player.y -= 2;
      player.tether = null;
      burst(player.x, player.y + 17, '#f5c78d', 5, 95);
      playTone(285, .08, 'triangle', .03);
    } else if (!player.tether) {
      attachWire();
    }
  }

  function attachWire() {
    const candidates = anchors.filter(anchor => {
      const dx = anchor.x - player.x;
      const dy = player.y - anchor.y;
      const angle = Math.atan2(Math.abs(dy), dx);
      return dx > 22 && dx < 470 && dy > 30 && angle < 1.31;
    }).sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
    if (!candidates.length) {
      playTone(120, .07, 'sine', .018);
      return;
    }
    player.tether = candidates[0];
    player.tether.used = true;
    player.tetherTime = 0;
    burst(player.x + 12, player.y - 10, '#d6f08e', 7, 130);
    playTone(640, .11, 'triangle', .04);
  }

  function releaseWire() {
    if (!player.tether) return;
    player.tether = null;
    player.grounded = false;
    player.vy = Math.min(player.vy, -390);
    player.vy -= 65;
    burst(player.x + 10, player.y - 6, '#ffad72', 8, 160);
    playTone(470, .09, 'triangle', .035);
  }

  function handlePress() {
    if (state === 'playing') jump();
  }

  function handleRelease() {
    if (player.tether) releaseWire();
  }

  let keyHeld = false;
  canvas.addEventListener('pointerdown', event => {
    if (state !== 'playing') return;
    event.preventDefault();
    try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* Optional browser API. */ }
    handlePress();
  });
  canvas.addEventListener('pointerup', handleRelease);
  canvas.addEventListener('pointercancel', handleRelease);
  window.addEventListener('pointerup', handleRelease);

  window.addEventListener('keydown', event => {
    if (event.code === 'Escape' || event.code === 'KeyP') {
      if (state === 'playing') pauseRun();
      else if (state === 'paused') resumeRun();
      return;
    }
    if ((event.code === 'Space' || event.code === 'ArrowUp') && !keyHeld) {
      event.preventDefault();
      keyHeld = true;
      handlePress();
    }
  });
  window.addEventListener('keyup', event => {
    if (event.code === 'Space' || event.code === 'ArrowUp') {
      keyHeld = false;
      handleRelease();
    }
  });
  window.addEventListener('blur', () => {
    keyHeld = false;
    if (state === 'playing') pauseRun();
    handleRelease();
  });

  ui.startButton.addEventListener('click', beginRun);
  ui.retryButton.addEventListener('click', beginRun);
  ui.pauseRetryButton.addEventListener('click', beginRun);
  ui.resumeButton.addEventListener('click', resumeRun);
  ui.pauseButton.addEventListener('click', pauseRun);
  ui.homeButton.addEventListener('click', goHome);
  ui.soundButton.addEventListener('click', () => {
    soundOn = !soundOn;
    ui.soundButton.classList.toggle('is-muted', !soundOn);
    ui.soundButton.textContent = soundOn ? '♫' : '♪̸';
    ui.soundButton.setAttribute('aria-label', soundOn ? '효과음 끄기' : '효과음 켜기');
    writeSave();
    if (soundOn) playTone(520, .08, 'sine', .03);
  });

  function update(dt) {
    sceneTime += dt;
    if (state !== 'playing') {
      particles = particles.filter(p => p.life > 0);
      particles.forEach(updateParticle);
      return;
    }

    runTime += dt;
    const speed = runSpeed();
    const previousY = player.y;
    const previousFeet = player.y + PLAYER_RADIUS;
    const xSpeed = player.tether ? speed * 1.13 : speed;
    player.x += xSpeed * dt;
    player.runCycle += dt * (player.tether ? 11 : speed * .035);
    player.blink = Math.max(0, player.blink - dt);
    windPhase += dt;

    if (player.tether) {
      player.tetherTime += dt;
      const anchor = player.tether;
      const bob = Math.sin(player.tetherTime * 7.2) * 10;
      const targetY = anchor.y + 142 + bob;
      player.y = lerp(player.y, targetY, Math.min(1, dt * 9));
      player.vy = (player.y - previousY) / Math.max(dt, .001);
      if (player.x > anchor.x + 290 || player.tetherTime > 1.48) releaseWire();
    } else {
      player.vy += GROUND_GRAVITY * dt;
      player.y += player.vy * dt;
    }

    let landed = false;
    if (!player.tether && player.vy >= 0) {
      const feet = player.y + PLAYER_RADIUS;
      for (const platform of platforms) {
        const overlapsX = player.x + 12 > platform.x && player.x - 12 < platform.x + platform.w;
        if (overlapsX && previousFeet <= platform.y + 3 && feet >= platform.y && feet < platform.y + 40) {
          player.y = platform.y - PLAYER_RADIUS;
          player.groundY = platform.y;
          player.vy = 0;
          player.grounded = true;
          landed = true;
          break;
        }
      }
    }
    if (!landed && !player.tether) player.grounded = false;

    for (const gust of gusts) {
      if (player.x > gust.x && player.x < gust.x + gust.w && player.y > gust.y && player.y < gust.y + gust.h) {
        player.vy -= 650 * dt;
        if (Math.random() < dt * 9) burst(player.x + rand(-8, 10), player.y + rand(-12, 12), '#b9e8e8', 1, 45);
      }
    }

    for (const obstacle of obstacles) {
      if (player.x + 15 > obstacle.x && player.x - 15 < obstacle.x + obstacle.w) {
        const top = obstacle.y - obstacle.h;
        if (player.y + 15 > top && player.y - 17 < obstacle.y && (player.grounded || player.y + 16 > top + 5)) {
          finishRun('crash');
          return;
        }
      }
    }

    for (const coin of coins) {
      if (coin.taken) continue;
      if (Math.abs(coin.x - player.x) < 31 && Math.abs(coin.y - player.y) < 35) {
        coin.taken = true;
        collected++;
        score += 10;
        burst(coin.x, coin.y, '#d6f08e', 8, 110);
        playTone(760 + (collected % 4) * 95, .075, 'sine', .035);
      }
    }

    if (player.y > H + 100) {
      finishRun('fall');
      return;
    }

    distance = Math.max(0, Math.floor((player.x - startX) / 40));
    score = distance + collected * 10;
    cameraX = lerp(cameraX, player.x - 292, Math.min(1, dt * 5));
    addCourseUntil(player.x + 2300);
    platforms = platforms.filter(p => p.x + p.w > cameraX - 350);
    anchors = anchors.filter(a => a.x > cameraX - 350);
    obstacles = obstacles.filter(o => o.x + o.w > cameraX - 350);
    coins = coins.filter(c => c.x > cameraX - 160 && !c.taken);
    gusts = gusts.filter(g => g.x + g.w > cameraX - 250);

    particles = particles.filter(p => p.life > 0);
    particles.forEach(updateParticle);
    shake = Math.max(0, shake - dt * 2.6);
    syncHud();
  }

  function burst(x, y, color, count, force) {
    for (let i = 0; i < count; i++) {
      const a = rand(-Math.PI, Math.PI);
      const v = rand(force * .25, force);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color, life: rand(.22, .55), maxLife: .55, r: rand(1.5, 3.5) });
    }
  }

  function updateParticle(p) {
    p.life -= 1 / 60;
    p.x += p.vx / 60;
    p.y += p.vy / 60;
    p.vy += 120 / 60;
    p.vx *= .985;
  }

  function render() {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    const stage = currentStage();
    drawSky(stage);
    drawCity(stage);
    ctx.save();
    if (shake > 0) ctx.translate(rand(-5, 5) * shake, rand(-4, 4) * shake);
    drawCourse(stage);
    drawPlayer();
    drawParticles();
    ctx.restore();
    if (state === 'playing') drawSpeedStreaks();
    ctx.restore();
  }

  function drawSky(stage) {
    const palettes = [
      ['#172344', '#46557a', '#df8d8a'],
      ['#14273e', '#53728a', '#e5a27e'],
      ['#151f36', '#535b7a', '#ec9871']
    ];
    const colors = palettes[stage];
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(.56, colors[1]);
    grad.addColorStop(1, colors[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const sunX = 925 - (stage * 95);
    const sunY = 352 + Math.sin(sceneTime * .12) * 4;
    const halo = ctx.createRadialGradient(sunX, sunY, 20, sunX, sunY, 250);
    halo.addColorStop(0, 'rgba(255,220,164,.58)');
    halo.addColorStop(1, 'rgba(255,185,145,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(sunX - 250, sunY - 250, 500, 500);
    ctx.fillStyle = '#ffd9aa';
    ctx.globalAlpha = .83;
    ctx.beginPath(); ctx.arc(sunX, sunY, 43, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    for (let i = 0; i < 42; i++) {
      const x = ((i * 317 + 83) % W);
      const y = 37 + ((i * 149 + 17) % 260);
      const blink = .2 + .55 * (Math.sin(sceneTime * (i % 4 + 1) + i) * .5 + .5);
      ctx.fillStyle = `rgba(255,244,219,${stage === 0 ? blink * .52 : blink * .3})`;
      ctx.fillRect(x, y, i % 7 === 0 ? 2 : 1, i % 7 === 0 ? 2 : 1);
    }

    drawClouds(stage);
    ctx.fillStyle = 'rgba(16,28,51,.18)';
    ctx.beginPath();
    ctx.moveTo(0, 435); ctx.lineTo(0, 399); ctx.quadraticCurveTo(145, 372, 289, 420); ctx.quadraticCurveTo(470, 382, 608, 423); ctx.quadraticCurveTo(783, 364, 955, 421); ctx.quadraticCurveTo(1110, 387, 1280, 415); ctx.lineTo(1280, 490); ctx.closePath(); ctx.fill();
  }

  function drawClouds(stage) {
    for (let i = 0; i < 6; i++) {
      const x = ((i * 251 - cameraX * .075 + sceneTime * (4 + i)) % (W + 260) + W + 260) % (W + 260) - 120;
      const y = 115 + (i * 67 % 180);
      ctx.fillStyle = stage === 2 ? 'rgba(216,205,208,.10)' : 'rgba(255,220,197,.12)';
      ctx.beginPath();
      ctx.ellipse(x, y, 65, 13, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 34, y - 7, 37, 18, 0, 0, Math.PI * 2);
      ctx.ellipse(x - 27, y - 4, 31, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCity(stage) {
    const layers = [
      { speed: .12, base: 473, color: stage === 2 ? '#29314b' : '#35415f', step: 86, maxH: 170 },
      { speed: .22, base: 515, color: stage === 2 ? '#242d47' : '#2b3857', step: 116, maxH: 230 },
      { speed: .36, base: 559, color: stage === 2 ? '#202943' : '#222f4d', step: 146, maxH: 290 }
    ];
    layers.forEach((layer, li) => {
      const offset = cameraX * layer.speed;
      const first = Math.floor(offset / layer.step) - 1;
      for (let n = first; n < first + 17; n++) {
        const seed = Math.abs(Math.sin(n * 127.1 + li * 311.7) * 43758.5453) % 1;
        const x = n * layer.step - offset;
        const width = layer.step * (.62 + seed * .34);
        const height = 60 + seed * layer.maxH;
        const top = layer.base - height;
        ctx.fillStyle = layer.color;
        ctx.fillRect(x, top, width, height + 100);
        ctx.fillStyle = 'rgba(198,207,217,.10)';
        ctx.fillRect(x + 5, top + 6, width - 10, 2);
        if (li > 0) {
          const rows = Math.floor(height / 27);
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < 3; col++) {
              const light = Math.sin(n * 12 + row * 9 + col * 31) > .38;
              ctx.fillStyle = light ? `rgba(255,202,138,${.16 + seed * .12})` : 'rgba(131,164,192,.10)';
              ctx.fillRect(x + 10 + col * ((width - 25) / 3), top + 17 + row * 25, 6, 9);
            }
          }
        }
      }
    });
  }

  function screenX(x) { return x - cameraX; }

  function drawCourse(stage) {
    for (const gust of gusts) drawGust(gust);
    for (const platform of platforms) drawPlatform(platform, stage);
    for (const anchor of anchors) drawAnchor(anchor);
    for (const obstacle of obstacles) drawObstacle(obstacle);
    for (const coin of coins) if (!coin.taken) drawCoin(coin);
  }

  function drawPlatform(platform, stage) {
    const x = screenX(platform.x);
    if (x > W + 30 || x + platform.w < -40) return;
    const palette = [
      ['#253047', '#d19b85', '#59627d'],
      ['#27364a', '#c68f77', '#647288'],
      ['#252d43', '#cf947b', '#64687d']
    ][stage];
    const y = platform.y;
    ctx.fillStyle = palette[0];
    ctx.fillRect(x, y, platform.w, H - y + 60);
    ctx.fillStyle = palette[1];
    ctx.fillRect(x, y, platform.w, 8);
    ctx.fillStyle = 'rgba(255,232,198,.2)';
    ctx.fillRect(x, y + 8, platform.w, 2);
    ctx.fillStyle = palette[2];
    ctx.fillRect(x, y + 24, platform.w, 3);
    for (let bx = x + 26; bx < x + platform.w - 10; bx += 64) {
      ctx.fillStyle = 'rgba(251,205,144,.28)';
      ctx.fillRect(bx, y + 49, 20, 31);
      ctx.fillRect(bx + 27, y + 49, 18, 31);
      ctx.fillStyle = 'rgba(16,26,47,.48)';
      ctx.fillRect(bx + 3, y + 53, 5, 8);
      ctx.fillRect(bx + 12, y + 53, 5, 8);
    }
    ctx.fillStyle = 'rgba(255,242,213,.23)';
    ctx.fillRect(x, y - 2, platform.w, 2);
  }

  function drawAnchor(anchor) {
    const x = screenX(anchor.x);
    if (x < -60 || x > W + 60) return;
    const pulse = Math.sin(sceneTime * 4 + anchor.glow) * 2;
    ctx.save();
    ctx.shadowColor = '#d6f08e';
    ctx.shadowBlur = 17;
    ctx.strokeStyle = anchor.used ? 'rgba(214,240,142,.62)' : '#d6f08e';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, anchor.y, 11 + pulse, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff0b2';
    ctx.beginPath(); ctx.arc(x, anchor.y, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(214,240,142,.28)';
    ctx.setLineDash([3, 7]);
    ctx.beginPath(); ctx.moveTo(x, anchor.y + 12); ctx.lineTo(x, anchor.y + 42); ctx.stroke();
    ctx.restore();
  }

  function drawObstacle(o) {
    const x = screenX(o.x);
    if (x < -80 || x > W + 80) return;
    ctx.fillStyle = 'rgba(10,16,32,.28)';
    ctx.beginPath(); ctx.ellipse(x + o.w / 2, o.y + 2, o.w * .7, 6, 0, 0, Math.PI * 2); ctx.fill();
    roundRect(x, o.y - o.h, o.w, o.h, 5, '#48536b');
    ctx.fillStyle = '#758095';
    ctx.fillRect(x + 4, o.y - o.h + 5, o.w - 8, 4);
    ctx.fillStyle = '#2b344c';
    ctx.fillRect(x + 7, o.y - o.h + 13, o.w - 14, 4);
    ctx.strokeStyle = 'rgba(235,190,139,.65)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 9, o.y - 5); ctx.lineTo(x + o.w - 9, o.y - 5); ctx.stroke();
  }

  function drawCoin(coin) {
    const x = screenX(coin.x);
    if (x < -25 || x > W + 25) return;
    const spin = .38 + Math.abs(Math.sin(sceneTime * 5 + coin.spin)) * .62;
    ctx.save();
    ctx.translate(x, coin.y);
    ctx.scale(spin, 1);
    ctx.shadowColor = '#d6f08e'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#d6f08e';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(48,75,51,.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  function drawGust(gust) {
    const x = screenX(gust.x);
    if (x > W || x + gust.w < 0) return;
    const alpha = .12 + (Math.sin(sceneTime * 4 + gust.phase) * .5 + .5) * .13;
    ctx.fillStyle = `rgba(178,225,224,${alpha})`;
    ctx.fillRect(x, gust.y, gust.w, gust.h);
    ctx.strokeStyle = `rgba(208,246,233,${alpha * 2})`;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const yy = gust.y + 26 + i * 39;
      const travel = ((sceneTime * 90 + i * 34) % (gust.w + 80)) - 40;
      ctx.beginPath(); ctx.moveTo(x + travel, yy); ctx.lineTo(x + travel + 28, yy); ctx.lineTo(x + travel + 20, yy - 5); ctx.moveTo(x + travel + 28, yy); ctx.lineTo(x + travel + 20, yy + 5); ctx.stroke();
    }
  }

  function drawPlayer() {
    const x = screenX(player.x);
    const y = player.y;
    if (player.tether) {
      const ax = screenX(player.tether.x);
      const ay = player.tether.y;
      ctx.save();
      ctx.strokeStyle = 'rgba(214,240,142,.24)'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.moveTo(x + 4, y - 8); ctx.quadraticCurveTo((x + ax) / 2, Math.min(y, ay) - 32, ax, ay); ctx.stroke();
      ctx.strokeStyle = '#efffb5'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 4, y - 8); ctx.quadraticCurveTo((x + ax) / 2, Math.min(y, ay) - 32, ax, ay); ctx.stroke();
      ctx.restore();
    }

    const bob = player.grounded && state !== 'over' ? Math.sin(player.runCycle * 2) * 2 : 0;
    const tilt = player.tether ? -0.22 : clamp(player.vy / 1700, -.34, .3);
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(tilt);

    // Tail: a soft, looping shape gives the courier a clear silhouette.
    ctx.fillStyle = '#bb735c';
    ctx.beginPath();
    ctx.moveTo(-8, 6);
    ctx.bezierCurveTo(-37, 22, -47, -9, -36, -25);
    ctx.bezierCurveTo(-26, -41, -7, -33, -11, -21);
    ctx.bezierCurveTo(-14, -12, -27, -17, -26, -25);
    ctx.bezierCurveTo(-34, -11, -23, 8, -6, -1);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,205,157,.8)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-30, -27); ctx.quadraticCurveTo(-40, -8, -19, 0); ctx.stroke();

    // Body and satchel.
    ctx.fillStyle = '#d89a68';
    ctx.beginPath(); ctx.ellipse(1, 4, 14, 21, -.14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2d6ae';
    ctx.beginPath(); ctx.ellipse(4, 9, 8, 12, -.1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#547d77';
    roundRect(-12, -1, 12, 17, 4, '#547d77');
    ctx.fillStyle = '#d6f08e';
    ctx.fillRect(-10, 2, 8, 3);

    // Head, ears, and face.
    ctx.fillStyle = '#e4aa79';
    ctx.beginPath(); ctx.ellipse(4, -17, 16, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-5, -29, 5, 9, -.35, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(9, -30, 5, 9, .2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9d5e59';
    ctx.beginPath(); ctx.ellipse(-5, -29, 2, 5, -.35, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(9, -30, 2, 5, .2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5dfc3';
    ctx.beginPath(); ctx.ellipse(9, -12, 8, 6, .1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#26304a';
    if (player.blink > 0) {
      ctx.fillRect(9, -19, 4, 1.5);
    } else {
      ctx.beginPath(); ctx.arc(10, -19, 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#bb735c';
    ctx.beginPath(); ctx.arc(16, -13, 2, 0, Math.PI * 2); ctx.fill();

    // Scarf and tiny leg strokes.
    ctx.fillStyle = '#f08f72';
    ctx.beginPath(); ctx.moveTo(-8, -5); ctx.quadraticCurveTo(1, -11, 9, -5); ctx.lineTo(7, 1); ctx.quadraticCurveTo(-2, -1, -8, 1); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-4, 0); ctx.quadraticCurveTo(-10, 9, -19, 5); ctx.lineTo(-17, 10); ctx.quadraticCurveTo(-7, 14, -1, 5); ctx.fill();
    const step = player.grounded ? Math.sin(player.runCycle * 2) * 5 : 2;
    ctx.strokeStyle = '#714c4f'; ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-3, 20); ctx.lineTo(-7 + step, 25); ctx.lineTo(-13 + step, 25); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(7, 19); ctx.lineTo(10 - step, 24); ctx.lineTo(16 - step, 24); ctx.stroke();
    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const alpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(screenX(p.x), p.y, p.r * alpha, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawSpeedStreaks() {
    const amount = clamp((runSpeed() - 320) / 260, 0, .55);
    if (amount <= 0) return;
    ctx.save();
    ctx.globalAlpha = amount;
    ctx.strokeStyle = 'rgba(255,241,218,.32)'; ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const y = 270 + ((i * 83 + sceneTime * 190) % 310);
      const x = (i * 211 + sceneTime * 480) % W;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 26 + amount * 35, y); ctx.stroke();
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); ctx.fill();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.round(rect.width * dpr);
    const height = Math.round(rect.height * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    ctx.setTransform(width / W, 0, 0, height / H, 0, 0);
  }

  function frame(time) {
    const dt = lastTime ? Math.min(.034, (time - lastTime) / 1000) : 0;
    lastTime = time;
    update(dt);
    resize();
    render();
    requestAnimationFrame(frame);
  }

  ui.titleBest.textContent = `${bestDistance.toLocaleString()} m`;
  if (!soundOn) {
    ui.soundButton.classList.add('is-muted');
    ui.soundButton.textContent = '♪̸';
    ui.soundButton.setAttribute('aria-label', '효과음 켜기');
  }
  resetRun();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
})();
