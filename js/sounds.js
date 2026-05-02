// WebAudio sound generator — keine externen Assets nötig
const Sounds = (() => {
  let ctx = null;
  let muted = false;
  let masterGain = null;

  function init() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.25;
    masterGain.connect(ctx.destination);
  }

  function ensure() {
    if (!ctx) init();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, duration, type = 'square', vol = 0.3, slideTo = null) {
    if (muted || !ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo !== null) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    }
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  // pellet eat
  function chomp() {
    ensure();
    tone(440 + Math.random() * 80, 0.05, 'square', 0.15);
  }

  // power pellet
  function power() {
    ensure();
    tone(220, 0.08, 'square', 0.3, 660);
    setTimeout(() => tone(440, 0.12, 'square', 0.3, 880), 80);
  }

  // ghost eaten
  function ghostEaten() {
    ensure();
    tone(880, 0.1, 'square', 0.4, 220);
    setTimeout(() => tone(440, 0.15, 'square', 0.3, 880), 100);
  }

  // death
  function death() {
    ensure();
    const seq = [880, 740, 620, 520, 440, 370, 310, 260, 220, 180];
    seq.forEach((f, i) => {
      setTimeout(() => tone(f, 0.12, 'square', 0.4), i * 100);
    });
  }

  // game start
  function start() {
    ensure();
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      setTimeout(() => tone(f, 0.15, 'square', 0.3), i * 120);
    });
  }

  // level complete
  function levelComplete() {
    ensure();
    const notes = [523, 659, 784, 1047, 1318];
    notes.forEach((f, i) => {
      setTimeout(() => tone(f, 0.18, 'triangle', 0.35), i * 100);
    });
  }

  // game over
  function gameOver() {
    ensure();
    const seq = [440, 415, 392, 370, 349, 330, 311, 294];
    seq.forEach((f, i) => {
      setTimeout(() => tone(f, 0.2, 'sawtooth', 0.3), i * 130);
    });
  }

  // siren — looped while ghosts roam
  let sirenInterval = null;
  function startSiren() {
    if (muted || !ctx || sirenInterval) return;
    let phase = 0;
    sirenInterval = setInterval(() => {
      if (muted) return;
      const f = phase % 2 === 0 ? 220 : 330;
      tone(f, 0.18, 'triangle', 0.08);
      phase++;
    }, 220);
  }
  function stopSiren() {
    if (sirenInterval) {
      clearInterval(sirenInterval);
      sirenInterval = null;
    }
  }

  function setMuted(v) {
    muted = v;
    if (muted) stopSiren();
  }

  function isMuted() { return muted; }

  return {
    init, ensure,
    chomp, power, ghostEaten, death, start, levelComplete, gameOver,
    startSiren, stopSiren,
    setMuted, isMuted,
  };
})();
