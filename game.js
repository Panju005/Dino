/* ============================================
   NEON DINO RUN – Game Engine
   ============================================ */

(() => {
  'use strict';

  // ─── Canvas Setup ───────────────────────────
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');

  function resizeCanvas() {
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // ─── DOM References ─────────────────────────
  const scoreEl = document.getElementById('score');
  const highscoreEl = document.getElementById('highscore');
  const startScreen = document.getElementById('start-screen');
  const gameoverScreen = document.getElementById('gameover-screen');
  const finalScoreEl = document.getElementById('final-score');
  const newBestEl = document.getElementById('new-best');
  const startBtn = document.getElementById('start-btn');
  const restartBtn = document.getElementById('restart-btn');

  // ─── Game Constants ─────────────────────────
  const GRAVITY = 0.65;
  const JUMP_FORCE = -14;
  const GROUND_OFFSET = 60; // pixels from bottom
  const DINO_WIDTH = 44;
  const DINO_HEIGHT = 48;
  const DINO_DUCK_HEIGHT = 28;
  const MIN_OBSTACLE_GAP = 80;
  const STAR_COUNT = 60;
  const PARTICLE_POOL_SIZE = 50;

  // ─── Colors ─────────────────────────────────
  const COLORS = {
    ground: '#1a1a3e',
    groundLine: '#00f0ff',
    groundGlow: 'rgba(0, 240, 255, 0.3)',
    dino: '#00f0ff',
    dinoGlow: 'rgba(0, 240, 255, 0.4)',
    cactus: '#ff00e5',
    cactusGlow: 'rgba(255, 0, 229, 0.4)',
    bird: '#ffe600',
    birdGlow: 'rgba(255, 230, 0, 0.4)',
    star: 'rgba(255, 255, 255, 0.5)',
    particle: '#39ff14',
  };

  // ─── Game State ─────────────────────────────
  let gameState = 'idle'; // 'idle' | 'running' | 'dead'
  let score = 0;
  let highScore = parseInt(localStorage.getItem('neonDinoHighScore') || '0');
  let speed = 6;
  let frameCount = 0;
  let lastObstacleX = 0;

  highscoreEl.textContent = highScore;

  // ─── Dino ───────────────────────────────────
  const dino = {
    x: 80,
    y: 0,
    width: DINO_WIDTH,
    height: DINO_HEIGHT,
    vy: 0,
    grounded: true,
    ducking: false,
    jumpCount: 0,
    maxJumps: 2, // double jump
    legFrame: 0,
    legTimer: 0,

    get groundY() {
      return canvas.height - GROUND_OFFSET - this.height;
    },

    reset() {
      this.y = this.groundY;
      this.vy = 0;
      this.grounded = true;
      this.ducking = false;
      this.jumpCount = 0;
      this.legFrame = 0;
      this.legTimer = 0;
    },

    jump() {
      if (this.jumpCount < this.maxJumps) {
        this.vy = JUMP_FORCE * (this.jumpCount === 1 ? 0.8 : 1);
        this.grounded = false;
        this.jumpCount++;
        spawnJumpParticles();
      }
    },

    duck(active) {
      if (active && this.grounded) {
        this.ducking = true;
        this.height = DINO_DUCK_HEIGHT;
      } else {
        this.ducking = false;
        this.height = DINO_HEIGHT;
      }
    },

    update() {
      // Physics
      this.vy += GRAVITY;
      this.y += this.vy;

      const gY = canvas.height - GROUND_OFFSET - this.height;
      if (this.y >= gY) {
        this.y = gY;
        this.vy = 0;
        this.grounded = true;
        this.jumpCount = 0;
      } else {
        this.grounded = false;
      }

      // Leg animation
      if (this.grounded && !this.ducking) {
        this.legTimer += speed * 0.3;
        if (this.legTimer > 4) {
          this.legTimer = 0;
          this.legFrame = (this.legFrame + 1) % 2;
        }
      }
    },

    draw() {
      ctx.save();

      // Glow
      ctx.shadowColor = COLORS.dinoGlow;
      ctx.shadowBlur = 18;

      const x = this.x;
      const y = this.y;
      const w = this.width;
      const h = this.height;

      ctx.fillStyle = COLORS.dino;
      ctx.strokeStyle = COLORS.dino;
      ctx.lineWidth = 2;

      if (this.ducking) {
        // Ducking dino – flattened body
        ctx.fillRect(x, y + 4, w + 10, h - 8);
        // Eye
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(x + w + 2, y + 8, 4, 4);
        ctx.fillStyle = COLORS.dino;
        // Legs
        ctx.fillRect(x + 8, y + h - 4, 5, 6);
        ctx.fillRect(x + 22, y + h - 4, 5, 6);
      } else {
        // Body
        ctx.fillRect(x + 8, y, w - 8, h - 14);
        // Head
        ctx.fillRect(x + 16, y - 14, w - 8, 18);
        // Eye
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(x + w - 2, y - 8, 5, 5);
        ctx.fillStyle = COLORS.dino;
        // Mouth line
        ctx.fillRect(x + 30, y - 2, 12, 2);
        // Arm
        ctx.fillRect(x + 6, y + 14, 8, 4);
        // Tail
        ctx.fillRect(x, y + 4, 10, 6);

        // Legs (animated)
        if (!this.grounded) {
          ctx.fillRect(x + 12, y + h - 14, 6, 14);
          ctx.fillRect(x + 26, y + h - 14, 6, 14);
        } else if (this.legFrame === 0) {
          ctx.fillRect(x + 12, y + h - 14, 6, 16);
          ctx.fillRect(x + 26, y + h - 10, 6, 10);
        } else {
          ctx.fillRect(x + 12, y + h - 10, 6, 10);
          ctx.fillRect(x + 26, y + h - 14, 6, 16);
        }
      }

      ctx.restore();
    },
  };

  // ─── Obstacles ──────────────────────────────
  let obstacles = [];

  function createCactus() {
    const variants = [
      { w: 18, h: 40 },
      { w: 14, h: 55 },
      { w: 30, h: 45 },
      { w: 24, h: 35 },
    ];
    const v = variants[Math.floor(Math.random() * variants.length)];
    return {
      type: 'cactus',
      x: canvas.width + 20,
      y: canvas.height - GROUND_OFFSET - v.h,
      width: v.w,
      height: v.h,
    };
  }

  function createBird() {
    const heights = [
      canvas.height - GROUND_OFFSET - 30,  // low
      canvas.height - GROUND_OFFSET - 65,  // medium
      canvas.height - GROUND_OFFSET - 100, // high
    ];
    const y = heights[Math.floor(Math.random() * heights.length)];
    return {
      type: 'bird',
      x: canvas.width + 20,
      y: y,
      width: 36,
      height: 24,
      wingFrame: 0,
      wingTimer: 0,
    };
  }

  function spawnObstacle() {
    const minGap = Math.max(200, 400 - speed * 8);
    if (canvas.width - lastObstacleX < minGap) return;

    // Birds only after score 200
    const canBird = score > 200;
    const isBird = canBird && Math.random() < 0.3;

    const obs = isBird ? createBird() : createCactus();
    obstacles.push(obs);
    lastObstacleX = obs.x;
  }

  function updateObstacles() {
    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.x -= speed;

      if (o.type === 'bird') {
        o.wingTimer++;
        if (o.wingTimer > 10) {
          o.wingTimer = 0;
          o.wingFrame = (o.wingFrame + 1) % 2;
        }
      }

      if (o.x + o.width < -20) {
        obstacles.splice(i, 1);
      }
    }

    // Track last obstacle position
    if (obstacles.length > 0) {
      lastObstacleX = Math.max(...obstacles.map(o => o.x));
    } else {
      lastObstacleX = -999;
    }
  }

  function drawObstacles() {
    for (const o of obstacles) {
      ctx.save();

      if (o.type === 'cactus') {
        ctx.shadowColor = COLORS.cactusGlow;
        ctx.shadowBlur = 14;
        ctx.fillStyle = COLORS.cactus;
        ctx.strokeStyle = COLORS.cactus;
        ctx.lineWidth = 2;

        // Main trunk
        ctx.fillRect(o.x, o.y, o.width, o.height);

        // Spines / details
        if (o.width > 20) {
          // Wide cactus: add arms
          ctx.fillRect(o.x - 6, o.y + 10, 8, 4);
          ctx.fillRect(o.x - 6, o.y + 10, 4, 16);
          ctx.fillRect(o.x + o.width - 2, o.y + 16, 8, 4);
          ctx.fillRect(o.x + o.width + 2, o.y + 16, 4, 12);
        } else {
          // Thin cactus: add bumps
          ctx.fillRect(o.x - 4, o.y + 8, 5, 3);
          ctx.fillRect(o.x + o.width - 1, o.y + 14, 5, 3);
        }
      } else if (o.type === 'bird') {
        ctx.shadowColor = COLORS.birdGlow;
        ctx.shadowBlur = 14;
        ctx.fillStyle = COLORS.bird;

        // Body
        ctx.fillRect(o.x + 8, o.y + 8, 20, 10);
        // Head
        ctx.fillRect(o.x + 28, o.y + 6, 10, 10);
        // Beak
        ctx.fillRect(o.x + 36, o.y + 10, 6, 4);
        // Eye
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(o.x + 32, o.y + 8, 3, 3);
        ctx.fillStyle = COLORS.bird;

        // Wings (animated)
        if (o.wingFrame === 0) {
          ctx.fillRect(o.x + 10, o.y, 14, 8);
        } else {
          ctx.fillRect(o.x + 10, o.y + 16, 14, 8);
        }
      }

      ctx.restore();
    }
  }

  // ─── Collision Detection ────────────────────
  function checkCollision() {
    const pad = 6; // collision padding for fairness
    const dx = dino.x + pad;
    const dy = dino.y + pad;
    const dw = dino.width - pad * 2;
    const dh = dino.height - pad * 2;

    for (const o of obstacles) {
      const ox = o.x + (o.type === 'bird' ? 8 : 2);
      const oy = o.y + 2;
      const ow = o.width - (o.type === 'bird' ? 10 : 4);
      const oh = o.height - 4;

      if (dx < ox + ow && dx + dw > ox && dy < oy + oh && dy + dh > oy) {
        return true;
      }
    }
    return false;
  }

  // ─── Particles ──────────────────────────────
  let particles = [];

  function spawnJumpParticles() {
    for (let i = 0; i < 8; i++) {
      particles.push({
        x: dino.x + dino.width / 2,
        y: dino.y + dino.height,
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 1,
        life: 1,
        decay: Math.random() * 0.03 + 0.02,
        size: Math.random() * 3 + 2,
        color: COLORS.particle,
      });
    }
  }

  function spawnDeathParticles() {
    for (let i = 0; i < 20; i++) {
      particles.push({
        x: dino.x + dino.width / 2,
        y: dino.y + dino.height / 2,
        vx: (Math.random() - 0.5) * 10,
        vy: (Math.random() - 0.5) * 10,
        life: 1,
        decay: Math.random() * 0.015 + 0.01,
        size: Math.random() * 5 + 2,
        color: Math.random() < 0.5 ? COLORS.dino : COLORS.cactus,
      });
    }
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }

  // ─── Starfield Background ──────────────────
  let stars = [];
  function initStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * (canvas.height - GROUND_OFFSET - 40),
        size: Math.random() * 2 + 0.5,
        speed: Math.random() * 0.5 + 0.2,
        twinkle: Math.random() * Math.PI * 2,
      });
    }
  }
  initStars();

  function updateStars() {
    for (const s of stars) {
      s.x -= s.speed * (speed / 6);
      s.twinkle += 0.02;
      if (s.x < -5) {
        s.x = canvas.width + 5;
        s.y = Math.random() * (canvas.height - GROUND_OFFSET - 40);
      }
    }
  }

  function drawStars() {
    for (const s of stars) {
      const alpha = 0.3 + Math.sin(s.twinkle) * 0.3;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = COLORS.star;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ─── Ground ─────────────────────────────────
  let groundOffset = 0;

  function drawGround() {
    const gy = canvas.height - GROUND_OFFSET;

    // Ground fill
    ctx.fillStyle = COLORS.ground;
    ctx.fillRect(0, gy, canvas.width, GROUND_OFFSET);

    // Neon line
    ctx.save();
    ctx.shadowColor = COLORS.groundGlow;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = COLORS.groundLine;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(canvas.width, gy);
    ctx.stroke();
    ctx.restore();

    // Ground texture (scrolling dashes)
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = COLORS.groundLine;
    groundOffset = (groundOffset + speed) % 20;
    for (let x = -groundOffset; x < canvas.width; x += 20) {
      const dashW = 6 + Math.sin(x * 0.1) * 3;
      ctx.fillRect(x, gy + 10, dashW, 1.5);
      if (Math.sin(x * 0.23) > 0.5) {
        ctx.fillRect(x + 3, gy + 20, 4, 1.5);
      }
    }
    ctx.restore();
  }

  // ─── Score ──────────────────────────────────
  function updateScore() {
    frameCount++;
    if (frameCount % 4 === 0) {
      score++;
      scoreEl.textContent = score;

      if (score % 50 === 0) {
        scoreEl.classList.add('score-pulse');
        setTimeout(() => scoreEl.classList.remove('score-pulse'), 200);
      }
    }

    // Increase difficulty
    speed = 6 + Math.floor(score / 100) * 0.5;
    if (speed > 16) speed = 16;
  }

  // ─── Spawn Timer ────────────────────────────
  let spawnTimer = 0;

  function updateSpawnTimer() {
    spawnTimer++;
    const minInterval = Math.max(30, 70 - speed * 2);
    if (spawnTimer >= minInterval) {
      spawnTimer = 0;
      if (Math.random() < 0.6) {
        spawnObstacle();
      }
    }
  }

  // ─── Game Loop ──────────────────────────────
  let animId = null;

  function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    updateStars();
    drawStars();

    // Ground
    drawGround();

    if (gameState === 'running') {
      // Updates
      dino.update();
      updateObstacles();
      updateSpawnTimer();
      updateScore();

      // Collision
      if (checkCollision()) {
        gameOver();
      }
    }

    // Draw everything
    drawObstacles();
    dino.draw();
    updateParticles();
    drawParticles();

    animId = requestAnimationFrame(gameLoop);
  }

  // ─── Game State Management ──────────────────
  function startGame() {
    gameState = 'running';
    score = 0;
    speed = 6;
    frameCount = 0;
    spawnTimer = 0;
    lastObstacleX = -999;
    obstacles = [];
    particles = [];
    scoreEl.textContent = '0';

    dino.reset();
    startScreen.classList.add('hidden');
    gameoverScreen.classList.add('hidden');
  }

  function gameOver() {
    gameState = 'dead';
    spawnDeathParticles();

    // Update high score
    const isNewBest = score > highScore;
    if (isNewBest) {
      highScore = score;
      localStorage.setItem('neonDinoHighScore', highScore.toString());
      highscoreEl.textContent = highScore;
    }

    finalScoreEl.textContent = score;
    newBestEl.classList.toggle('hidden', !isNewBest);
    gameoverScreen.classList.remove('hidden');
  }

  // ─── Input Handling ─────────────────────────
  const keys = {};

  document.addEventListener('keydown', (e) => {
    if (keys[e.code]) return; // prevent repeat
    keys[e.code] = true;

    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (gameState === 'idle' || gameState === 'dead') {
        startGame();
      } else if (gameState === 'running') {
        dino.jump();
      }
    }

    if (e.code === 'ArrowDown' && gameState === 'running') {
      e.preventDefault();
      dino.duck(true);
    }
  });

  document.addEventListener('keyup', (e) => {
    keys[e.code] = false;

    if (e.code === 'ArrowDown') {
      dino.duck(false);
    }
  });

  // Touch / Click support
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (gameState === 'running') {
      dino.jump();
    }
  });

  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);

  // ─── Handle Resize ─────────────────────────
  window.addEventListener('resize', () => {
    resizeCanvas();
    initStars();
    if (gameState !== 'running') {
      dino.y = dino.groundY;
    }
  });

  // ─── Init ───────────────────────────────────
  dino.y = dino.groundY;
  gameLoop();

})();
