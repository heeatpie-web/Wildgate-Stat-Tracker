/**
 * @module useSoundEffects
 * Provides synthesized audio feedback callbacks (Web Audio API).
 * Returns workflow sound callbacks. Respects the soundEnabled preference.
 */
import { useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';

let sharedAudioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return null;
    if (sharedAudioContext?.state === 'closed') sharedAudioContext = null;
    if (!sharedAudioContext) sharedAudioContext = new AudioContextCtor();
    return sharedAudioContext;
};

export const useSoundEffects = () => {
    const soundEnabled = useAppStore((state) => state.soundEnabled);

    const prepareAudio = useCallback(() => {
        if (!soundEnabled) return;

        const ctx = getAudioContext();
        if (!ctx || ctx.state !== 'suspended') return;

        void ctx.resume().catch(() => undefined);
    }, [soundEnabled]);

    const playTone = useCallback((freq: number, type: 'sine' | 'square' | 'sawtooth' | 'triangle', duration: number, delay = 0) => {
        if (!soundEnabled) return;

        const ctx = getAudioContext();
        if (!ctx || ctx.state === 'closed') return;

        const doPlay = () => {
            try {
                if (ctx.state === 'closed') return;
                const startAt = ctx.currentTime + Math.max(0, delay);
                const stopAt = startAt + duration;

                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = type;
                osc.frequency.setValueAtTime(freq, startAt);

                gain.gain.setValueAtTime(0.0001, startAt);
                gain.gain.exponentialRampToValueAtTime(0.11, startAt + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.00001, stopAt);

                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.onended = () => {
                    osc.disconnect();
                    gain.disconnect();
                };

                osc.start(startAt);
                osc.stop(stopAt);
            } catch {
                sharedAudioContext = null;
            }
        };

        if (ctx.state === 'suspended') {
            ctx.resume().then(doPlay).catch(() => {
                sharedAudioContext = null;
            });
        } else {
            doPlay();
        }
    }, [soundEnabled]);

    const playCapture = useCallback(() => {
        playTone(1046.5, 'triangle', 0.045);
        playTone(783.99, 'triangle', 0.08, 0.035);
    }, [playTone]);

    const playStart = useCallback(() => {
        playTone(440, 'sine', 0.3); // A4
        playTone(554, 'sine', 0.3, 0.1); // C#5
        playTone(659, 'sine', 0.6, 0.2); // E5
    }, [playTone]);

    const playVictory = useCallback(() => {
        playTone(523.25, 'triangle', 0.2); // C5
        playTone(659.25, 'triangle', 0.2, 0.1); // E5
        playTone(783.99, 'triangle', 0.2, 0.2); // G5
        playTone(1046.50, 'triangle', 0.8, 0.3); // C6
    }, [playTone]);

    const playDefeat = useCallback(() => {
        playTone(392.00, 'sawtooth', 0.4); // G4
        playTone(369.99, 'sawtooth', 0.4, 0.2); // F#4
        playTone(329.63, 'sawtooth', 0.8, 0.4); // E4
    }, [playTone]);

    const playClick = useCallback(() => {
        playTone(800, 'sine', 0.05);
    }, [playTone]);

    const playSuccess = useCallback(() => {
        playTone(600, 'sine', 0.15);
        playTone(800, 'sine', 0.25, 0.1);
    }, [playTone]);

    const playError = useCallback(() => {
        playTone(300, 'square', 0.15);
        playTone(200, 'square', 0.3, 0.15);
    }, [playTone]);

    const playAutomationStart = useCallback(() => {
        playTone(540, 'triangle', 0.09);
        playTone(660, 'triangle', 0.11, 0.08);
    }, [playTone]);

    const playAutomationComplete = useCallback(() => {
        playTone(620, 'triangle', 0.12);
        playTone(820, 'triangle', 0.16, 0.08);
        playTone(1046.5, 'triangle', 0.22, 0.18);
    }, [playTone]);

    const playAutoResultApplied = useCallback(() => {
        playTone(523.25, 'triangle', 0.08);
        playTone(659.25, 'triangle', 0.12, 0.05);
        playTone(783.99, 'sine', 0.16, 0.13);
    }, [playTone]);

    const playAutomationFailed = useCallback(() => {
        playTone(360, 'square', 0.12);
        playTone(250, 'square', 0.18, 0.08);
        playTone(180, 'square', 0.24, 0.18);
    }, [playTone]);

    const playEnd = useCallback(() => {
        playTone(659, 'triangle', 0.2);
        playTone(523, 'triangle', 0.2, 0.15);
        playTone(440, 'triangle', 0.5, 0.3);
    }, [playTone]);

    // Subtle ping played the moment a result screen is detected, before automation begins.
    const playResultDetected = useCallback(() => {
        playTone(660, 'sine', 0.04);
    }, [playTone]);

    return {
        prepareAudio,
        playCapture,
        playStart,
        playVictory,
        playDefeat,
        playClick,
        playSuccess,
        playError,
        playAutomationStart,
        playAutomationComplete,
        playAutoResultApplied,
        playAutomationFailed,
        playEnd,
        playResultDetected,
    };
};
