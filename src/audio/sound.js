// The noise itself.
//
// Every sound in this game is synthesised at runtime. There are no audio
// files, because there is no build step and no package manager to fetch
// them with, and because a project whose whole look comes from clip-space
// vertex snapping and a 640×360 framebuffer should not be shipping 48kHz
// stereo samples. Short, dry, band-limited, mono-ish: a PS1 sound chip is
// the reference, not a film mix.
//
// The mixing decisions live in `kit.js` and are tested in Node. This file
// only knows how to make a cue audible.

import { mix, bedFor, BED } from './kit.js';

/** Browsers refuse to start audio until the player has clicked something. */
const NEEDS_GESTURE = 'suspended';

export class Sound {
  constructor({ muted = false } = {}) {
    this.ctx = null;
    this.muted = muted;
    this.noise = null;
    this.master = null;
    /** Rolling count, so a test can prove a cue actually reached the graph. */
    this.played = 0;
    this.lastCues = [];
    /** The room tone. One graph for the whole session, gain-ridden. */
    this.bed = null;
  }

  get available() {
    return typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined';
  }

  /**
   * Build the graph. Safe to call repeatedly — the first click of the
   * session is what actually starts it, and every later call just nudges a
   * context the browser suspended when the tab lost focus.
   */
  start() {
    if (!this.available) return false;
    if (!this.ctx) {
      const Ctx = typeof AudioContext !== 'undefined' ? AudioContext : webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(this.ctx.destination);
      this.noise = this.buildNoise();
      this.bed = this.buildBed();
    }
    if (this.ctx.state === NEEDS_GESTURE) this.ctx.resume().catch(() => {});
    return true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.7;
    return this.muted;
  }

  toggleMute() { return this.setMuted(!this.muted); }

  /**
   * The room.
   *
   * A looping noise source through a lowpass, plus a sub sine nobody
   * consciously hears. Built once and left running for the session — a bed
   * that starts and stops with each deployment clicks, and the click is
   * more noticeable than the bed.
   */
  buildBed() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = BED.cutoff;
    filter.Q.value = 0.4;

    const gain = this.ctx.createGain();
    gain.gain.value = 0;

    const drone = this.ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = BED.drone;
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = BED.droneGain;

    src.connect(filter);
    filter.connect(gain);
    drone.connect(droneGain);
    droneGain.connect(gain);
    gain.connect(this.master);
    src.start();
    drone.start();
    return { src, filter, gain, drone };
  }

  /**
   * Ride the bed toward where the sector is.
   *
   * Ramped rather than set: heat moves every frame, and a filter cutoff
   * snapping sixty times a second is a zipper noise, not an atmosphere.
   */
  room(heat, playing) {
    this.lastBed = bedFor(heat, { playing });
    if (!this.bed) return this.lastBed;
    const t = this.ctx.currentTime;
    this.bed.gain.gain.setTargetAtTime(this.lastBed.gain, t, 0.35);
    this.bed.filter.frequency.setTargetAtTime(this.lastBed.cutoff, t, 0.5);
    return this.lastBed;
  }

  /** One second of white noise, reused by everything percussive. */
  buildNoise() {
    const rate = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, rate, rate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /**
   * Play a frame of simulation events.
   *
   * Does not drain them: the renderer owns that, and audio has to be able
   * to run before it without the two fighting over the array.
   */
  consume(events, listener) {
    const cues = mix(events, listener);
    this.lastCues = cues;
    if (!this.ctx || this.muted || !cues.length) return cues;
    for (const c of cues) {
      this.played += 1;
      this.voice(c);
    }
    return cues;
  }

  // ------------------------------------------------------------ voices

  /** Gain → pan → master. Every voice hangs off one of these. */
  channel(gain, pan) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      p.connect(this.master);
    } else {
      g.connect(this.master);
    }
    return g;
  }

  /** A filtered burst of the noise buffer. The backbone of everything dry. */
  burst(out, { length = 0.08, type = 'bandpass', freq = 1400, q = 1, decay = null }) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 1;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const env = this.ctx.createGain();
    const t = this.ctx.currentTime;
    env.gain.setValueAtTime(1, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + (decay ?? length));
    src.connect(f);
    f.connect(env);
    env.connect(out);
    src.start(t);
    src.stop(t + length + 0.02);
    return f;
  }

  /** A tone, optionally sliding. Everything melodic in the game is one of these. */
  tone(out, { from = 440, to = null, length = 0.2, wave = 'sine', level = 1 }) {
    const osc = this.ctx.createOscillator();
    osc.type = wave;
    const t = this.ctx.currentTime;
    osc.frequency.setValueAtTime(from, t);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t + length);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(level, t + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(env);
    env.connect(out);
    osc.start(t);
    osc.stop(t + length + 0.02);
    return osc;
  }

  voice({ id, gain, pan }) {
    const out = this.channel(gain, pan);
    switch (id) {
      // The squad and the opposition have to be tellable apart with your
      // eyes on the other side of the block. Ours is tighter and higher;
      // theirs is flatter and lower.
      case 'SHOT':
        this.burst(out, { length: 0.07, freq: 1900, q: 0.8, decay: 0.05 });
        this.tone(out, { from: 180, to: 60, length: 0.05, wave: 'square', level: 0.4 });
        break;
      case 'SHOT_ENEMY':
        this.burst(out, { length: 0.09, freq: 900, q: 0.7, decay: 0.07 });
        this.tone(out, { from: 120, to: 48, length: 0.06, wave: 'square', level: 0.35 });
        break;
      case 'HIT':
        this.burst(out, { length: 0.05, type: 'lowpass', freq: 700, decay: 0.04 });
        break;
      case 'RICOCHET':
        this.burst(out, { length: 0.05, freq: 3200, q: 6, decay: 0.05 });
        break;
      // Two flat blips, which is what an alarm sounds like on a system that
      // was never designed to have one.
      case 'WARN':
        this.tone(out, { from: 880, length: 0.08, wave: 'square', level: 0.5 });
        this.delayed(0.12, () => this.tone(out, { from: 880, length: 0.08, wave: 'square', level: 0.5 }));
        break;
      case 'COLLAPSE':
        this.burst(out, { length: 1.3, type: 'lowpass', freq: 320, decay: 1.2 });
        this.tone(out, { from: 70, to: 28, length: 1.1, wave: 'sine', level: 0.9 });
        break;
      case 'STRIKE':
        this.burst(out, { length: 0.9, type: 'lowpass', freq: 520, decay: 0.8 });
        this.tone(out, { from: 46, to: 22, length: 0.9, wave: 'sine', level: 1 });
        break;
      // The Aligner is the one thing in the game that should sound
      // pleasant, because that is the joke.
      case 'ALIGN':
        this.tone(out, { from: 440, to: 660, length: 0.16, wave: 'sine', level: 0.7 });
        break;
      case 'TURNED':
        this.tone(out, { from: 330, to: 880, length: 0.3, wave: 'triangle', level: 0.8 });
        break;
      // No handshake. A tone that starts to resolve and does not.
      case 'REFUSED':
        this.tone(out, { from: 520, to: 300, length: 0.34, wave: 'sine', level: 0.7 });
        this.tone(out, { from: 511, to: 296, length: 0.34, wave: 'sine', level: 0.35 });
        break;
      case 'DEVICE':
        this.tone(out, { from: 160, to: 90, length: 0.12, wave: 'triangle', level: 0.9 });
        this.burst(out, { length: 0.05, type: 'lowpass', freq: 900, decay: 0.05 });
        break;
      case 'DOWNED':
        this.tone(out, { from: 220, to: 70, length: 0.5, wave: 'sine', level: 0.8 });
        break;
      case 'SECURED':
        this.tone(out, { from: 523, length: 0.1, wave: 'triangle', level: 0.7 });
        this.delayed(0.11, () => this.tone(out, { from: 784, length: 0.16, wave: 'triangle', level: 0.7 }));
        break;
      case 'ALERT':
        this.tone(out, { from: 660, length: 0.13, wave: 'square', level: 0.6 });
        this.delayed(0.16, () => this.tone(out, { from: 440, length: 0.18, wave: 'square', level: 0.6 }));
        break;
      case 'CHANNEL':
        this.tone(out, { from: 1046, length: 0.09, wave: 'sine', level: 0.5 });
        this.delayed(0.1, () => this.tone(out, { from: 1568, length: 0.12, wave: 'sine', level: 0.4 }));
        break;
      // The moment the squad turns on its own side. Low, and it does not
      // resolve either.
      case 'WRECK':
        this.burst(out, { length: 0.7, type: 'lowpass', freq: 800, decay: 0.6 });
        this.tone(out, { from: 90, to: 34, length: 0.6, wave: 'sine', level: 0.9 });
        break;
      case 'DEFECT':
        this.tone(out, { from: 200, to: 66, length: 0.9, wave: 'sawtooth', level: 0.6 });
        break;
      // Bright and gone. A band-limited crack for the metal, and a very
      // short low thump under it so it lands rather than just clicking.
      case 'IMPACT':
        this.burst(out, { length: 0.22, type: 'bandpass', freq: 1900, decay: 0.16 });
        this.tone(out, { from: 150, to: 52, length: 0.2, wave: 'square', level: 0.7 });
        break;
      default:
        break;
    }
  }

  /**
   * A second hit, a beat later.
   *
   * `setTimeout` rather than a scheduled node: these are all 100–160ms
   * apart, well inside the tolerance for a two-note figure, and scheduling
   * them properly would mean threading `currentTime` offsets through every
   * helper for a difference nobody can hear.
   */
  delayed(seconds, fn) {
    setTimeout(fn, seconds * 1000);
  }
}
