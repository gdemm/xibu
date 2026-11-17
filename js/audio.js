// audio.js — WebAudio procedural SFX (no external assets)
// shot(), ricochet(), reload(), heartbeat(on), wind ambient, setMuted(b)

export class AudioSys {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.master = null;
        this.windNodes = null;
        this.hbInterval = null;
        this._unlocked = false;
    }

    // must be called after a user gesture
    unlock() {
        if (this._unlocked) return;
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = this.muted ? 0 : 0.9;
            this.master.connect(this.ctx.destination);
            this._startWind();
            this._unlocked = true;
        } catch (e) {
            this.ctx = null;
        }
    }

    setMuted(b) {
        this.muted = b;
        if (this.master && this.ctx) {
            const t = this.ctx.currentTime;
            this.master.gain.setTargetAtTime(b ? 0 : 0.9, t, 0.02);
        }
    }

    _buf(oscType, freq, dur, vol, slideTo) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        osc.type = oscType;
        osc.frequency.setValueAtTime(freq, t);
        if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        osc.connect(g);
        g.connect(this.master);
        osc.start(t);
        osc.stop(t + dur + 0.02);
    }

    _noise(dur, vol, fLow, fHigh) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const n = Math.floor(this.ctx.sampleRate * dur);
        const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = fHigh;
        f.Q.value = 1.2;
        const g = this.ctx.createGain();
        g.gain.value = vol;
        src.connect(f); f.connect(g); g.connect(this.master);
        src.start(t);
    }

    shot(v = 1) {
        this._noise(0.18, 0.9 * v, 400, 4200);
        this._buf('sawtooth', 160, 0.16, 0.35 * v, 50);
    }

    ricochet() {
        this._buf('sine', 2200, 0.18, 0.3, 700);
        this._noise(0.1, 0.2, 3000, 6000);
    }

    reload() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        const clicks = [0, 0.25, 0.5, 0.75, 1.0, 1.25];
        clicks.forEach((dt) => {
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            osc.type = 'square';
            const tt = t + dt;
            osc.frequency.value = 900 + Math.random() * 400;
            g.gain.setValueAtTime(0.12, tt);
            g.gain.exponentialRampToValueAtTime(0.001, tt + 0.05);
            osc.connect(g); g.connect(this.master);
            osc.start(tt); osc.stop(tt + 0.06);
        });
    }

    heartbeat(on) {
        if (this.hbInterval && !on) {
            clearInterval(this.hbInterval);
            this.hbInterval = null;
            return;
        }
        if (on && !this.hbInterval) {
            const beat = () => {
                this._buf('sine', 60, 0.12, 0.5, 40);
                setTimeout(() => this._buf('sine', 55, 0.1, 0.35, 38), 150);
            };
            beat();
            this.hbInterval = setInterval(beat, 800);
        }
    }

    // 口哨：两声上扬的正弦
    whistle() {
        if (!this.ctx) return;
        const t0 = this.ctx.currentTime;
        [[0, 1250, 1900], [0.32, 1500, 2300]].forEach(([dt, f0, f1]) => {
            const o = this.ctx.createOscillator(), g = this.ctx.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(f0, t0 + dt); o.frequency.exponentialRampToValueAtTime(f1, t0 + dt + 0.22);
            g.gain.setValueAtTime(0.0001, t0 + dt); g.gain.exponentialRampToValueAtTime(0.18, t0 + dt + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.26);
            o.connect(g); g.connect(this.master); o.start(t0 + dt); o.stop(t0 + dt + 0.3);
        });
    }

    pickup() {
        this._buf('sine', 520, 0.12, 0.3, 880);
    }

    _startWind() {
        if (!this.ctx) return;
        const n = this.ctx.createBufferSource();
        const len = this.ctx.sampleRate * 2;
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
        n.buffer = buf; n.loop = true;
        const f = this.ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 350;
        const g = this.ctx.createGain();
        g.gain.value = 0.06;
        n.connect(f); f.connect(g); g.connect(this.master);
        n.start(0);
        this.windNodes = { n, g };
        // slow LFO-ish wander
        try {
            const lfo = this.ctx.createOscillator();
            const lfoG = this.ctx.createGain();
            lfo.frequency.value = 0.1;
            lfoG.gain.value = 60;
            lfo.connect(lfoG); lfoG.connect(f.frequency);
            lfo.start(0);
        } catch (e) { /* ignore */ }
    }
}

export default AudioSys;
