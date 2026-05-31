import type { MapId } from "./maps";

export interface AudioUpdateState {
  speedKmh: number;
  rpm: number;
  weather: string;
  mapId: MapId;
  nightFactor: number;
  headlightsOn: boolean;
  playerX: number;
  playerZ: number;
  traffic: { x: number; z: number; speed: number }[];
  dt: number;
  thunderFlash: number;
}

export interface GameAudio {
  unlock: () => Promise<void>;
  update: (state: AudioUpdateState) => void;
  setMuted: (muted: boolean) => void;
  isMuted: () => boolean;
  playCrash: (impact: number) => void;
  dispose: () => void;
}

const makeNoiseBuffer = (ctx: AudioContext, seconds: number): AudioBuffer => {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      data[i] = (b0 + b1 + b2 + white * 0.5362) * 0.11;
    }
  }
  return buf;
};

export const createGameAudio = (): GameAudio => {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let unlocked = false;
  let muted = false;

  let zenGain: GainNode | null = null;
  let zenOscs: OscillatorNode[] = [];
  let engineGain: GainNode | null = null;
  let engineOsc: OscillatorNode | null = null;
  let engineNoiseGain: GainNode | null = null;
  let windGain: GainNode | null = null;
  let tireGain: GainNode | null = null;
  let rainGain: GainNode | null = null;
  let rainSrc: AudioBufferSourceNode | null = null;
  let birdTimer = 0;
  let hornTimer = 2.5;
  let passTimer = 0;
  let cricketTimer = 0;
  let lastThunder = 0;

  const ensureCtx = (): AudioContext => {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
    }
    return ctx;
  };

  const startZenPad = (ac: AudioContext, dest: GainNode) => {
    zenGain = ac.createGain();
    zenGain.gain.value = 0;
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.4;
    zenGain.connect(filter);
    filter.connect(dest);

    const freqs = [110, 164.81, 196, 220, 329.63];
    zenOscs = freqs.map((f, i) => {
      const osc = ac.createOscillator();
      osc.type = i % 2 === 0 ? "sine" : "triangle";
      osc.frequency.value = f;
      const g = ac.createGain();
      g.gain.value = 0.04 + (i === 0 ? 0.03 : 0);
      osc.connect(g);
      g.connect(zenGain!);
      osc.start();
      return osc;
    });

    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoG = ac.createGain();
    lfoG.gain.value = 0.025;
    lfo.connect(lfoG);
    lfoG.connect(zenGain.gain);
    lfo.start();
  };

  const startEngine = (ac: AudioContext, dest: GainNode) => {
    engineGain = ac.createGain();
    engineGain.gain.value = 0;
    const filt = ac.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.value = 420;
    engineGain.connect(filt);
    filt.connect(dest);

    engineOsc = ac.createOscillator();
    engineOsc.type = "sawtooth";
    engineOsc.frequency.value = 68;
    engineOsc.connect(engineGain);
    engineOsc.start();

    const noise = ac.createBufferSource();
    noise.buffer = makeNoiseBuffer(ac, 2);
    noise.loop = true;
    engineNoiseGain = ac.createGain();
    engineNoiseGain.gain.value = 0;
    const nf = ac.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 180;
    nf.Q.value = 0.8;
    noise.connect(nf);
    nf.connect(engineNoiseGain);
    engineNoiseGain.connect(dest);
    noise.start();
  };

  const startWindTires = (ac: AudioContext, dest: GainNode) => {
    const buf = makeNoiseBuffer(ac, 3);
    const wind = ac.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    windGain = ac.createGain();
    windGain.gain.value = 0;
    const wf = ac.createBiquadFilter();
    wf.type = "bandpass";
    wf.frequency.value = 400;
    wf.Q.value = 0.3;
    wind.connect(wf);
    wf.connect(windGain);
    windGain.connect(dest);
    wind.start();

    const tire = ac.createBufferSource();
    tire.buffer = buf;
    tire.loop = true;
    tireGain = ac.createGain();
    tireGain.gain.value = 0;
    const tf = ac.createBiquadFilter();
    tf.type = "lowpass";
    tf.frequency.value = 280;
    tire.connect(tf);
    tf.connect(tireGain);
    tireGain.connect(dest);
    tire.start();
  };

  const startRain = (ac: AudioContext, dest: GainNode) => {
    const buf = makeNoiseBuffer(ac, 4);
    rainSrc = ac.createBufferSource();
    rainSrc.buffer = buf;
    rainSrc.loop = true;
    rainGain = ac.createGain();
    rainGain.gain.value = 0;
    const rf = ac.createBiquadFilter();
    rf.type = "bandpass";
    rf.frequency.value = 2400;
    rf.Q.value = 0.15;
    rainSrc.connect(rf);
    rf.connect(rainGain);
    rainGain.connect(dest);
    rainSrc.start();
  };

  const initNodes = () => {
    const ac = ensureCtx();
    if (!master || zenGain) return;
    startZenPad(ac, master);
    startEngine(ac, master);
    startWindTires(ac, master);
    startRain(ac, master);
  };

  const playBirdChirp = (ac: AudioContext, dest: GainNode, night: boolean) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    const base = night ? 1800 : 2400 + Math.random() * 1200;
    osc.frequency.setValueAtTime(base, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(base * 1.4, ac.currentTime + 0.06);
    osc.frequency.exponentialRampToValueAtTime(base * 0.9, ac.currentTime + 0.14);
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(0.06, ac.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.22);
    osc.connect(g);
    g.connect(dest);
    osc.start();
    osc.stop(ac.currentTime + 0.25);
  };

  const playHorn = (ac: AudioContext, dest: GainNode, distant: boolean) => {
    const t = ac.currentTime;
    const g = ac.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(distant ? 0.08 : 0.14, t + 0.04);
    g.gain.setValueAtTime(distant ? 0.08 : 0.14, t + 0.35);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
    g.connect(dest);

    const f1 = 340 + Math.random() * 40;
    const f2 = f1 * 1.25;
    [f1, f2].forEach((f, i) => {
      const osc = ac.createOscillator();
      osc.type = "square";
      osc.frequency.value = f;
      const og = ac.createGain();
      og.gain.value = i === 0 ? 0.5 : 0.35;
      osc.connect(og);
      og.connect(g);
      osc.start(t + i * 0.08);
      osc.stop(t + 0.75);
    });
  };

  const playPassBy = (ac: AudioContext, dest: GainNode) => {
    const buf = makeNoiseBuffer(ac, 0.6);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    const f = ac.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.setValueAtTime(600, ac.currentTime);
    f.frequency.exponentialRampToValueAtTime(1800, ac.currentTime + 0.35);
    f.frequency.exponentialRampToValueAtTime(300, ac.currentTime + 0.7);
    g.gain.setValueAtTime(0, ac.currentTime);
    g.gain.linearRampToValueAtTime(0.12, ac.currentTime + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.75);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start();
    src.stop(ac.currentTime + 0.8);
  };

  const playThunder = (ac: AudioContext, dest: GainNode) => {
    const buf = makeNoiseBuffer(ac, 2.5);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const g = ac.createGain();
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = 120;
    g.gain.setValueAtTime(0.35, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 2.2);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start();
    src.stop(ac.currentTime + 2.5);
  };

  const playRainDrop = (ac: AudioContext, dest: GainNode) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(800 + Math.random() * 600, ac.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, ac.currentTime + 0.04);
    g.gain.setValueAtTime(0.04, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.05);
    osc.connect(g);
    g.connect(dest);
    osc.start();
    osc.stop(ac.currentTime + 0.06);
  };

  const playCricket = (ac: AudioContext, dest: GainNode) => {
    const t = ac.currentTime;
    for (let i = 0; i < 4; i++) {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = "sine";
      osc.frequency.value = 4200 + Math.random() * 400;
      const start = t + i * 0.07;
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(0.025, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.06);
      osc.connect(g);
      g.connect(dest);
      osc.start(start);
      osc.stop(start + 0.08);
    }
  };

  return {
    unlock: async () => {
      const ac = ensureCtx();
      initNodes();
      if (ac.state === "suspended") await ac.resume();
      unlocked = true;
      if (zenGain) {
        zenGain.gain.setTargetAtTime(0.22, ac.currentTime, 1.2);
      }
    },

    setMuted: (m: boolean) => {
      muted = m;
      if (master && ctx) {
        master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.15);
      }
    },

    isMuted: () => muted,

    update: (state: AudioUpdateState) => {
      if (!unlocked || !ctx || !master) return;
      initNodes();
      const ac = ctx;
      const t = ac.currentTime;
      const speedNorm = Math.min(1, state.speedKmh / 140);
      const isRain = state.weather === "rain" || state.weather === "thunder";
      const isForest = state.mapId === "forest";
      const isCoast = state.mapId === "beach";
      const isDay = state.nightFactor < 0.45;

      if (zenGain) {
        const zenTarget = muted ? 0 : 0.14 + (1 - speedNorm) * 0.12;
        zenGain.gain.setTargetAtTime(zenTarget, t, 0.8);
      }

      if (engineGain && engineOsc) {
        const engVol = muted ? 0 : 0.04 + speedNorm * 0.14;
        engineGain.gain.setTargetAtTime(engVol, t, 0.12);
        engineOsc.frequency.setTargetAtTime(55 + speedNorm * 140 + state.rpm * 0.8, t, 0.1);
        engineNoiseGain?.gain.setTargetAtTime(muted ? 0 : speedNorm * 0.06, t, 0.12);
      }

      if (windGain) {
        windGain.gain.setTargetAtTime(muted ? 0 : speedNorm * 0.1, t, 0.15);
      }
      if (tireGain) {
        tireGain.gain.setTargetAtTime(muted ? 0 : speedNorm * 0.07, t, 0.15);
      }

      if (rainGain) {
        const rainVol = muted ? 0 : isRain ? 0.22 : 0;
        rainGain.gain.setTargetAtTime(rainVol, t, 0.4);
      }

      if (isRain && !muted && Math.random() < state.dt * 8) {
        playRainDrop(ac, master);
      }

      if (state.thunderFlash > 0.8 && lastThunder < 0.2 && !muted) {
        playThunder(ac, master);
      }
      lastThunder = state.thunderFlash;

      birdTimer -= state.dt;
      if (birdTimer <= 0 && isDay && !isRain && !muted) {
        const interval = isForest ? 1.2 + Math.random() * 2.5 : 3 + Math.random() * 5;
        birdTimer = interval;
        if (Math.random() < (isForest ? 0.85 : isCoast ? 0.5 : 0.25)) {
          playBirdChirp(ac, master, false);
        }
      }

      cricketTimer -= state.dt;
      if (cricketTimer <= 0 && state.nightFactor > 0.55 && isForest && !muted) {
        cricketTimer = 0.4 + Math.random() * 1.2;
        if (Math.random() < 0.35) playCricket(ac, master);
      }

      hornTimer -= state.dt;
      if (hornTimer <= 0 && !muted) {
        hornTimer = 4 + Math.random() * 12;
        let nearest = 999;
        for (const tc of state.traffic) {
          const d = Math.hypot(tc.x - state.playerX, tc.z - state.playerZ);
          if (d < nearest) nearest = d;
        }
        if (nearest < 90 && Math.random() < 0.55) {
          playHorn(ac, master, nearest > 45);
        }
      }

      passTimer -= state.dt;
      for (const tc of state.traffic) {
        const d = Math.hypot(tc.x - state.playerX, tc.z - state.playerZ);
        if (d < 18 && d > 6 && passTimer <= 0 && speedNorm > 0.05 && !muted) {
          passTimer = 1.8;
          playPassBy(ac, master);
          break;
        }
      }
    },

    dispose: () => {
      zenOscs.forEach(o => { try { o.stop(); } catch { /* */ } });
      rainSrc?.stop();
      if (master && ctx) {
        master.disconnect();
        ctx.close();
      }
      master = null;
      zenGain = null;
      zenOscs = [];
    },
    playCrash: (impact: number) => {
      if (ctx && master && !muted) {
        playCrashFn(ctx, master, impact);
      }
    },
  };
};
