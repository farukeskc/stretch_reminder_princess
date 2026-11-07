// Rehberli esneme oturumu: adım adım geri sayım, ekranı açık tutma, yumuşak zil sesi.

export class Player {
  /**
   * @param {{text:string, sec:number}[]} steps
   * @param {{ onTick?: Function, onStep?: Function, onDone?: Function, sound?: boolean }} opts
   */
  constructor(steps, { onTick, onStep, onDone, sound = true } = {}) {
    this.steps = steps;
    this.total = steps.reduce((a, s) => a + s.sec, 0);
    this.onTick = onTick;
    this.onStep = onStep;
    this.onDone = onDone;
    this.sound = sound;
    this.index = 0;
    this.stepElapsed = 0; // sn
    this.running = false;
    this.timer = null;
    this.last = 0;
    this.wakeLock = null;
    this.audio = null;
    this.onVisibility = () => {
      if (document.visibilityState === 'visible' && this.running) this.lockScreen();
    };
  }

  get elapsed() {
    return this.steps.slice(0, this.index).reduce((a, s) => a + s.sec, 0) + this.stepElapsed;
  }

  start() {
    // Ses bağlamı kullanıcı dokunuşu içinde oluşturulmalı (iOS).
    if (this.sound && !this.audio) {
      try {
        this.audio = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        this.audio = null;
      }
    }
    this.audio?.resume?.();
    this.running = true;
    this.last = performance.now();
    this.timer = setInterval(() => this.tick(), 200);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.lockScreen();
    this.onStep?.(this.index);
    this.chime(660);
  }

  pause() {
    this.running = false;
    clearInterval(this.timer);
    this.releaseScreen();
  }

  resume() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.timer = setInterval(() => this.tick(), 200);
    this.lockScreen();
  }

  toggle() {
    if (this.running) this.pause();
    else this.resume();
    return this.running;
  }

  next() {
    if (this.index >= this.steps.length - 1) return this.finish();
    this.index += 1;
    this.stepElapsed = 0;
    this.onStep?.(this.index);
    this.chime(this.index % 2 ? 784 : 660);
    this.emit();
  }

  tick() {
    const now = performance.now();
    const dt = (now - this.last) / 1000;
    this.last = now;
    this.stepElapsed += dt;
    if (this.stepElapsed >= this.steps[this.index].sec) {
      if (this.index >= this.steps.length - 1) return this.finish();
      this.next();
      return;
    }
    this.emit();
  }

  emit() {
    const step = this.steps[this.index];
    this.onTick?.({
      index: this.index,
      remaining: Math.max(0, Math.ceil(step.sec - this.stepElapsed)),
      stepProgress: Math.min(1, this.stepElapsed / step.sec),
      totalProgress: Math.min(1, this.elapsed / this.total),
    });
  }

  finish() {
    this.pause();
    this.stepElapsed = this.steps[this.index].sec;
    this.emit();
    this.chime(988, 0.5);
    this.onDone?.();
  }

  destroy() {
    this.pause();
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.audio?.close?.();
  }

  async lockScreen() {
    try {
      if ('wakeLock' in navigator && !this.wakeLock) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener?.('release', () => {
          this.wakeLock = null;
        });
      }
    } catch {
      /* desteklenmiyor ya da reddedildi */
    }
  }

  releaseScreen() {
    this.wakeLock?.release?.().catch?.(() => {});
    this.wakeLock = null;
  }

  chime(freq = 660, dur = 0.35) {
    const ctx = this.audio;
    if (!this.sound || !ctx) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch {
      /* yoksay */
    }
  }
}
