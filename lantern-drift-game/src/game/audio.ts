export type Sound = "jump" | "firefly" | "candle" | "checkpoint" | "hurt" | "death" | "exit" | "gust" | "click";

/** All audio is synthesized at runtime: no downloads, files or third-party assets. */
export class AudioEngine {
  private context: AudioContext | undefined;
  private master: GainNode | undefined;
  private ambient: GainNode | undefined;
  muted = false;

  constructor(muted: boolean) { this.muted = muted; }

  async unlock() {
    if (!this.context) {
      const Context = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Context) return;
      this.context = new Context();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : 0.22;
      this.master.connect(this.context.destination);
      this.startWind();
    }
    if (this.context.state === "suspended") await this.context.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.context && this.master) this.master.gain.setTargetAtTime(muted ? 0 : 0.22, this.context.currentTime, 0.03);
  }

  play(sound: Sound) {
    if (this.muted || !this.context || !this.master) return;
    const notes: Record<Sound, [number, number, number, OscillatorType]> = {
      jump: [260, 420, 0.12, "sine"], firefly: [680, 1180, 0.22, "sine"],
      candle: [330, 660, 0.35, "triangle"], checkpoint: [392, 784, 0.5, "sine"],
      hurt: [150, 70, 0.2, "sawtooth"], death: [210, 45, 0.65, "triangle"],
      exit: [440, 880, 0.8, "sine"], gust: [90, 180, 0.25, "sawtooth"], click: [420, 360, 0.05, "sine"],
    };
    const [from, to, duration, type] = notes[sound];
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(sound === "hurt" ? 0.35 : 0.22, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  }

  private startWind() {
    if (!this.context || !this.master) return;
    // A short generated noise buffer loops as a quiet, filtered night breeze.
    const buffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      last = (last + (Math.random() * 2 - 1) * 0.02) / 1.02;
      data[i] = last * 2;
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    this.ambient = this.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 520;
    this.ambient.gain.value = 0.13;
    source.connect(filter).connect(this.ambient).connect(this.master);
    source.start();
  }
}
