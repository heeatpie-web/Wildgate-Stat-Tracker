export type SoundCueType = 'success' | 'error' | 'warning' | 'info' | 'navigate';

let audioCtx: AudioContext | null = null;
let lastPlayAt = 0;

const getAudioContext = (): AudioContext | null => {
    if (typeof window === 'undefined') return null;
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as
        | (new () => AudioContext)
        | undefined;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    return audioCtx;
};

const playTone = (
    ctx: AudioContext,
    frequency: number,
    durationMs: number,
    offsetMs: number,
    gainValue = 0.025,
    type: OscillatorType = 'sine',
) => {
    const now = ctx.currentTime + (offsetMs / 1000);
    const duration = Math.max(0.03, durationMs / 1000);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.01);
};

export const playSoundCue = (cue: SoundCueType) => {
    const nowMs = Date.now();
    if (nowMs - lastPlayAt < 90) return;
    lastPlayAt = nowMs;

    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
        void ctx.resume();
    }

    switch (cue) {
        case 'success':
            playTone(ctx, 740, 90, 0, 0.03, 'triangle');
            playTone(ctx, 980, 120, 70, 0.03, 'triangle');
            return;
        case 'error':
            playTone(ctx, 300, 140, 0, 0.03, 'sawtooth');
            playTone(ctx, 210, 180, 120, 0.025, 'sawtooth');
            return;
        case 'warning':
            playTone(ctx, 520, 110, 0, 0.028, 'square');
            playTone(ctx, 420, 110, 120, 0.024, 'square');
            return;
        case 'navigate':
            playTone(ctx, 440, 60, 0, 0.02, 'sine');
            return;
        case 'info':
        default:
            playTone(ctx, 620, 90, 0, 0.022, 'sine');
            return;
    }
};

