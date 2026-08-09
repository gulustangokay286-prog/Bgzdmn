class SoundManager {
  constructor() {
    this.audioCtx = null;
  }

  init() {
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  playSuccessDing() {
    try {
      this.init();
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine'; // Pürüzsüz ve klas bir zil sesi
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 notası (Parlak ve tatmin edici)
      osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.1); // Hafif tizleşme efekti

      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.02); // Hızlı giriş (Attack)
      gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6); // Yavaşça sönme (Decay)

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    } catch (e) {
      console.log("Audio not supported or blocked");
    }
  }

  playErrorBuzzer() {
    try {
      this.init();
      const ctx = this.audioCtx;
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sawtooth'; // Sert ve uyarıcı bir ses
      osc.frequency.setValueAtTime(150, ctx.currentTime); // Boğuk bir frekans
      osc.frequency.setValueAtTime(120, ctx.currentTime + 0.1); // Frekans düşüşü (hata hissi)

      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gainNode.gain.linearRampToValueAtTime(0.001, ctx.currentTime + 0.4);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.4);
    } catch (e) {
      console.log("Audio not supported or blocked");
    }
  }
}

export const soundManager = new SoundManager();
