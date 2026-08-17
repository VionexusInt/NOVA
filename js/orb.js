const canvas = document.getElementById('orb');
const ctx = canvas.getContext('2d');

let W = window.innerWidth;
let H = window.innerHeight;
let cx = W / 2;
let cy = H / 2;

function resizeCanvas() {
  const DPR = window.devicePixelRatio || 1;
  W = window.innerWidth;
  H = window.innerHeight;
  cx = W / 2;
  cy = H / 2;

  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100vw';
  canvas.style.height = '100vh';
  canvas.style.pointerEvents = 'none';
  canvas.style.zIndex = '1';

  canvas.width = Math.floor(W * DPR);
  canvas.height = Math.floor(H * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0); // Resetea y aplica la escala sin acumular
}

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

let orbSt = 'idle';
let time = 0;
let targetLvl = 0;
let audioLvl = 0;

function gC() {
  switch (orbSt) {
    case 'listening':
      return [[255, 30, 60], [255, 110, 70], [200, 0, 40]];
    case 'thinking':
      return [[255, 170, 0], [255, 230, 80], [170, 70, 0]];
    case 'speaking':
      return [[0, 255, 170], [80, 255, 220], [0, 130, 90]];
    default:
      return [[0, 180, 255], [70, 210, 255], [0, 70, 170]];
  }
}

function rc(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

class AccretionParticle {
  constructor() { this.reset(); }
  reset() {
    this.angle = Math.random() * Math.PI * 2;
    this.radius = 80 + Math.random() * 70;
    this.speed = 0.003 + Math.random() * 0.01;
    this.size = 0.4 + Math.random() * 1.8;
    this.bright = 0.2 + Math.random() * 0.8;
    this.trail = [];
    this.maxTrail = 8 + Math.floor(Math.random() * 10);
  }
  update() {
    this.angle += this.speed * (1 + audioLvl * 3);
    this.radius -= (0.4 + audioLvl * 1.8); 
    if (this.radius < 25) this.reset();
    
    const x = cx + Math.cos(this.angle) * this.radius;
    const y = cy + Math.sin(this.angle) * this.radius;
    
    this.trail.push({ x, y });
    if (this.trail.length > this.maxTrail) this.trail.shift();
  }
  draw(C, e) {
    if (this.trail.length < 2) return;
    ctx.beginPath();
    for (let i = 0; i < this.trail.length; i++) {
      const p = this.trail[i];
      const ratio = i / this.trail.length;
      const alpha = ratio * this.bright * (0.2 + e * 0.6) * 0.3;
      const size = this.size * ratio;
      ctx.fillStyle = rc(C[0], alpha);
      ctx.moveTo(p.x, p.y);
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}
const accretionParticles = Array.from({ length: 140 }, () => new AccretionParticle());

class Node3D {
  constructor() {
    this.reset();
    this.radius = 10 + Math.random() * 80;
  }
  reset() {
    this.phi = Math.random() * Math.PI * 2;
    this.theta = (Math.random() - 0.5) * Math.PI;
    this.baseRadius = 40 + Math.random() * 35;
    this.radius = this.baseRadius;
    this.speed = 0.002 + Math.random() * 0.006;
    this.size = 1.2 + Math.random() * 2.2;
    this.pulse = Math.random() * Math.PI * 2;
    this.projX = 0; this.projY = 0; this.projSize = 0; this.zIdx = 0;
  }
  update() {
    this.phi += this.speed * (1 + audioLvl * 0.8);
    this.pulse += 0.03 + audioLvl * 0.1;
    this.radius = this.baseRadius + Math.sin(this.pulse) * (1 + audioLvl * 10);

    const cosTheta = Math.cos(this.theta);
    const sinTheta = Math.sin(this.theta);
    const cosPhi = Math.cos(this.phi);
    const sinPhi = Math.sin(this.phi);

    let x3d = this.radius * cosTheta * cosPhi;
    let y3d = this.radius * sinTheta;
    let z3d = this.radius * cosTheta * sinPhi;

    const rotY = time * 0.2;
    const finalX = x3d * Math.cos(rotY) + z3d * Math.sin(rotY);
    const finalZ = -x3d * Math.sin(rotY) + z3d * Math.cos(rotY);
    const finalY = y3d;

    const perspective = 1 + finalZ / 150;
    this.zIdx = finalZ;
    this.projX = cx + finalX * perspective;
    this.projY = cy + finalY * perspective;
    this.projSize = this.size * perspective * (0.8 + Math.sin(this.pulse) * 0.2);
  }
  draw(C, e) {
    const intensity = 0.4 + e * 0.6;
    ctx.beginPath();
    ctx.arc(this.projX, this.projY, this.projSize * 3, 0, Math.PI * 2);
    ctx.fillStyle = rc(C[0], 0.1 * intensity);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(this.projX, this.projY, this.projSize, 0, Math.PI * 2);
    ctx.fillStyle = rc(C[1], intensity);
    ctx.fill();
  }
}
const nodes3D = Array.from({ length: 45 }, () => new Node3D());

function drawNeuralNetwork(C, e) {
  nodes3D.sort((a, b) => a.zIdx - b.zIdx);

  ctx.lineWidth = 0.5;
  for (let i = 0; i < nodes3D.length; i++) {
    for (let j = i + 1; j < nodes3D.length; j++) {
      const n1 = nodes3D[i];
      const n2 = nodes3D[j];
      const distSq = Math.pow(n1.projX - n2.projX, 2) + Math.pow(n1.projY - n2.projY, 2);
      
      const maxDist = 55 + e * 20;
      if (distSq < maxDist * maxDist) {
        const dist = Math.sqrt(distSq);
        const alpha = (1 - dist / maxDist) * (0.15 + e * 0.3);
        ctx.beginPath();
        ctx.moveTo(n1.projX, n1.projY);
        ctx.lineTo(n2.projX, n2.projY);
        const grad = ctx.createLinearGradient(n1.projX, n1.projY, n2.projX, n2.projY);
        grad.addColorStop(0, rc(C[0], alpha * (n1.zIdx > 0 ? 1 : 0.5)));
        grad.addColorStop(1, rc(C[1], alpha * (n2.zIdx > 0 ? 1 : 0.5)));
        ctx.strokeStyle = grad;
        ctx.stroke();
      }
    }
  }
  nodes3D.forEach(n => n.draw(C, e));
}

class Shockwave {
  constructor(delay) { this.delay = delay; this.reset(); }
  reset() {
    this.r = 30;
    this.alpha = 0;
    this.active = false;
    this.timer = this.delay;
    this.width = 1.5 + Math.random() * 2;
  }
  trigger() {
    if (this.active) return;
    this.active = true;
    this.r = 30;
    this.alpha = 0.8 + audioLvl * 0.2;
  }
  update() {
    if (this.active) {
      this.r += 4.5 + audioLvl * 9;
      const maxR = Math.hypot(cx, cy);
      this.alpha = (1 - (this.r / maxR)) * (0.7 + audioLvl * 0.3);

      if (this.r >= maxR || this.alpha <= 0) this.reset();
    } else {
      this.timer--;
      if (this.timer <= 0 || (audioLvl > 0.8 && Math.random() < 0.05)) {
        this.trigger();
        this.timer = 50 + Math.random() * 70 - audioLvl * 30;
      }
    }
  }
  draw(C) {
    if (!this.active || this.alpha <= 0) return;
    ctx.beginPath();
    ctx.arc(cx, cy, this.r, 0, Math.PI * 2);
    ctx.strokeStyle = rc(C[1], Math.max(0, this.alpha));
    ctx.lineWidth = this.width;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(cx, cy, this.r, 0, Math.PI * 2);
    ctx.strokeStyle = rc(C[0], Math.max(0, this.alpha * 0.3));
    ctx.lineWidth = this.width * 2.5;
    ctx.stroke();
  }
}
const shockwaves = [new Shockwave(0), new Shockwave(40), new Shockwave(80), new Shockwave(120)];

class EnergyBeam {
  constructor() { this.reset(); }
  reset() {
    this.angle = Math.random() * Math.PI * 2;
    this.len = 50 + Math.random() * 50;
    this.width = 1 + Math.random() * 4;
    this.speed = 0.01 + Math.random() * 0.02;
    this.life = 0;
    this.maxLife = 30 + Math.random() * 40;
    this.active = false;
  }
  update() {
    if (!this.active) {
      if (Math.random() < 0.01 + audioLvl * 0.1) {
        this.reset();
        this.active = true;
      }
      return;
    }
    this.life++;
    this.angle += this.speed * (Math.random() < 0.5 ? 1 : -1) * (1 + audioLvl);
    if (this.life >= this.maxLife) this.active = false;
  }
  draw(C, e) {
    if (!this.active) return;
    const progress = this.life / this.maxLife;
    const alpha = Math.sin(progress * Math.PI) * (0.5 + e * 0.5) * 0.7;
    const currentLen = this.len * (1 + e * 1.5) * (0.8 + progress * 0.2);
    
    const x1 = cx + Math.cos(this.angle) * 20;
    const y1 = cy + Math.sin(this.angle) * 20;
    const x2 = cx + Math.cos(this.angle) * (20 + currentLen);
    const y2 = cy + Math.sin(this.angle) * (20 + currentLen);

    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, rc(C[1], alpha));
    grad.addColorStop(0.5, rc(C[0], alpha * 0.5));
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = grad;
    ctx.lineWidth = this.width * (1 - progress * 0.5);
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}
const beams = Array.from({ length: 12 }, () => new EnergyBeam());

function drawCore(C, e) {
  const basePulse = Math.sin(time * 2) * 2;
  const audioPulse = e * 12;
  const coreR = 36 + basePulse + audioPulse;

  const exteriorGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 2.5);
  exteriorGrad.addColorStop(0, rc(C[0], 0.2 + e * 0.2));
  exteriorGrad.addColorStop(0.6, rc(C[2], 0.05));
  exteriorGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath(); ctx.arc(cx, cy, coreR * 2.5, 0, Math.PI * 2);
  ctx.fillStyle = exteriorGrad; ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(time * 0.3);
  ctx.scale(1, 0.3);
  ctx.beginPath();
  ctx.arc(0, 0, coreR * 1.6, 0, Math.PI * 2);
  ctx.strokeStyle = rc(C[1], 0.2 + e * 0.2);
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.lineWidth = 1;
  ctx.beginPath();
  for(let i=0; i<4; i++){
    const ang = (i/4) * Math.PI * 2 + time;
    ctx.moveTo(Math.cos(ang)*coreR*1.2, Math.sin(ang)*coreR*1.2);
    ctx.lineTo(Math.cos(ang)*coreR*1.6, Math.sin(ang)*coreR*1.6);
  }
  ctx.strokeStyle = rc(C[0], 0.3 + e * 0.3); ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
  const ringGrad = ctx.createRadialGradient(cx, cy, coreR * 0.8, cx, cy, coreR * 1.1);
  ringGrad.addColorStop(0, rc(C[2], 0));
  ringGrad.addColorStop(0.5, rc(C[1], 0.9 + e * 0.1));
  ringGrad.addColorStop(1, rc(C[0], 0));
  ctx.fillStyle = ringGrad;
  ctx.fill();

  ctx.beginPath(); ctx.arc(cx, cy, coreR * 0.8, 0, Math.PI * 2);
  const darkGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 0.8);
  darkGrad.addColorStop(0, 'rgba(0,10,30,1)');
  darkGrad.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = darkGrad; ctx.fill();

  const innerR = coreR * 0.5;
  ctx.beginPath(); ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
  const innerGrad = ctx.createRadialGradient(cx - innerR*0.3, cy - innerR*0.3, 0, cx, cy, innerR);
  innerGrad.addColorStop(0, 'rgba(255,255,255,1)');
  innerGrad.addColorStop(0.2, rc(C[1], 1));
  innerGrad.addColorStop(0.6, rc(C[0], 0.6));
  innerGrad.addColorStop(1, rc(C[2], 0.1));
  ctx.fillStyle = innerGrad; ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx - innerR*0.2, cy - innerR*0.3, innerR*0.6, innerR*0.3, Math.PI/4, 0, Math.PI*2);
  const specGrad = ctx.createLinearGradient(cx - innerR, cy - innerR, cx, cy);
  specGrad.addColorStop(0, 'rgba(255,255,255,0.7)');
  specGrad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = specGrad; ctx.fill();
}

function loop() {
  ctx.clearRect(0, 0, W, H);

  time += 0.016;
  audioLvl += (targetLvl - audioLvl) * 0.12;
  
  const C = gC();
  const e = audioLvl;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.5);
  bgGrad.addColorStop(0, rc(C[0], 0.12 + e * 0.15));
  bgGrad.addColorStop(0.5, rc(C[2], 0.03));
  bgGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  accretionParticles.forEach(p => { p.update(); p.draw(C, e); });
  shockwaves.forEach(w => { w.update(); w.draw(C); });
  beams.forEach(b => { b.update(); b.draw(C, e); });

  nodes3D.forEach(n => n.update());
  drawNeuralNetwork(C, e);

  ctx.globalCompositeOperation = 'source-over';
  drawCore(C, e);

  ctx.restore();

  requestAnimationFrame(loop);
}

loop();

export function setOrb(s) {
  orbSt = s;
  const L = {
    idle: 'SISTEMA COMPLETO - EN ESPERA',
    listening: 'RECONOCIMIENTO DE VOZ ACTIVO',
    thinking: 'PROCESANDO CONSULTA N.O.V.A.',
    speaking: 'SINTETIZANDO RESPUESTA'
  };
  const lbl = document.getElementById('orbLbl');
  if(lbl) lbl.textContent = L[s] || 'EN ESPERA';
  
  if (s !== 'idle') targetLvl = Math.max(targetLvl, 0.3);
}

export function setTargetLevel(v) {
  targetLvl = v;
}