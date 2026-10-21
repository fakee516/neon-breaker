/* NEON BREAKER - procedural sound. No audio files, everything is synthesised. */
(function (root) {
  'use strict';

  var ac = null;
  var master = null;
  var noiseBuffer = null;
  var muted = false;
  var musicTimer = null;
  var nextStepTime = 0;
  var step = 0;
  var MASTER_VOL = 0.5;
  var STEP = 0.25;

  try { muted = root.localStorage && root.localStorage.getItem('neonbreaker.muted') === '1'; } catch (e) { /* private mode */ }

  var BASS = [55, 43.65, 65.41, 49];
  var ARP = [
    [220, 261.63, 329.63, 261.63, 440, 329.63, 261.63, 329.63],
    [174.61, 220, 261.63, 220, 349.23, 261.63, 220, 261.63],
    [261.63, 329.63, 392, 329.63, 523.25, 392, 329.63, 392],
    [196, 246.94, 293.66, 246.94, 392, 293.66, 246.94, 293.66]
  ];

  function ensure() {
    if (!ac) {
      var AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return false;
      ac = new AC();
      master = ac.createGain();
      master.gain.value = muted ? 0 : MASTER_VOL;
      master.connect(ac.destination);
    }
    if (ac.state === 'suspended' && ac.resume) ac.resume();
    return true;
  }

  function getNoise() {
    if (!noiseBuffer) {
      var len = Math.floor(ac.sampleRate * 0.6);
      noiseBuffer = ac.createBuffer(1, len, ac.sampleRate);
      var data = noiseBuffer.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  function toneAt(freq, dur, type, vol, at, slideTo, attack) {
    if (!ac || master.gain.value === 0) return;
    var o = ac.createOscillator();
    var g = ac.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + (attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(master);
    o.start(at);
    o.stop(at + dur + 0.04);
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!ensure()) return;
    toneAt(freq, dur, type, vol, ac.currentTime + (delay || 0), slideTo);
  }

  function noiseAt(dur, vol, freq, at) {
    if (!ac || master.gain.value === 0) return;
    var src = ac.createBufferSource();
    src.buffer = getNoise();
    var filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(freq, at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, freq * 0.25), at + dur);
    var g = ac.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start(at);
    src.stop(at + dur + 0.05);
  }

  function play(name) {
    if (!ensure()) return;
    var t = ac.currentTime;
    switch (name) {
      case 'brick':
        toneAt(620 + Math.random() * 180, 0.08, 'square', 0.07, t, 940);
        break;
      case 'tough':
        toneAt(190, 0.07, 'square', 0.06, t, 140);
        toneAt(380, 0.05, 'triangle', 0.05, t);
        break;
      case 'paddle':
        toneAt(240, 0.07, 'triangle', 0.11, t, 360);
        break;
      case 'wall':
        toneAt(150, 0.04, 'sine', 0.05, t, 120);
        break;
      case 'laser':
        toneAt(1500, 0.07, 'sawtooth', 0.035, t, 420);
        break;
      case 'power':
        toneAt(523.25, 0.09, 'triangle', 0.10, t);
        toneAt(659.25, 0.09, 'triangle', 0.09, t + 0.07);
        toneAt(987.77, 0.16, 'triangle', 0.09, t + 0.14);
        break;
      case 'life':
        toneAt(784, 0.1, 'triangle', 0.1, t);
        toneAt(1174.66, 0.2, 'triangle', 0.09, t + 0.1);
        break;
      case 'explode':
        noiseAt(0.4, 0.32, 1400, t);
        toneAt(110, 0.38, 'sawtooth', 0.16, t, 32);
        break;
      case 'lose':
        toneAt(320, 0.45, 'sawtooth', 0.12, t, 70);
        toneAt(160, 0.5, 'square', 0.06, t, 48);
        break;
      case 'clear':
        [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) {
          toneAt(f, 0.24, 'triangle', 0.09, t + i * 0.09);
        });
        break;
      case 'start':
        toneAt(220, 0.18, 'triangle', 0.1, t, 440);
        toneAt(440, 0.22, 'triangle', 0.1, t + 0.12, 880);
        break;
      case 'over':
        [392, 329.63, 261.63, 196].forEach(function (f, i) {
          toneAt(f, 0.4, 'sawtooth', 0.07, t + i * 0.14, f * 0.98);
        });
        break;
      case 'click':
        toneAt(880, 0.03, 'sine', 0.04, t, 700);
        break;
      default:
        break;
    }
  }

  function scheduleMusic() {
    if (!ac) return;
    if (nextStepTime < ac.currentTime - 0.5) nextStepTime = ac.currentTime + 0.05;
    while (nextStepTime < ac.currentTime + 0.25) {
      var bar = Math.floor(step / 8) % 4;
      var inBar = step % 8;
      var at = nextStepTime;

      if (inBar % 4 === 0) {
        toneAt(BASS[bar], 0.5, 'sine', 0.075, at, BASS[bar] * 0.98, 0.02);
        toneAt(BASS[bar] * 2, 0.35, 'triangle', 0.025, at);
      }
      if (inBar % 2 === 1) {
        toneAt(ARP[bar][inBar], 0.18, 'triangle', 0.022, at);
      }
      if (inBar === 0 || inBar === 4) {
        noiseAt(0.03, 0.012, 6000, at);
      }

      step = (step + 1) % 32;
      nextStepTime += STEP;
    }
  }

  function startMusic() {
    if (!ensure() || musicTimer) return;
    step = 0;
    nextStepTime = ac.currentTime + 0.1;
    scheduleMusic();
    musicTimer = root.setInterval(scheduleMusic, 80);
  }

  function stopMusic() {
    if (musicTimer) {
      root.clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  function setMuted(value) {
    muted = !!value;
    try { root.localStorage && root.localStorage.setItem('neonbreaker.muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (master && ac) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOL, ac.currentTime, 0.02);
  }

  function toggleMute() {
    setMuted(!muted);
    return muted;
  }

  function isMuted() { return muted; }

  root.NBSound = {
    ensure: ensure,
    play: play,
    startMusic: startMusic,
    stopMusic: stopMusic,
    toggleMute: toggleMute,
    isMuted: isMuted
  };
})(window);
