/**
 * @module useSoundEffects
 * Provides synthesized audio feedback callbacks (Web Audio API).
 * Returns playStart, playWin, playLoss. Respects the soundEnabled preference.
 */
import { useCallback } from 'react';
import { useAppStore } from '../store/useAppStore';

export const useSoundEffects = () => {
    const { soundEnabled } = useAppStore();

    const playTone = useCallback((freq: number, type: 'sine' | 'square' | 'sawtooth' | 'triangle', duration: number, delay = 0) => {
        if (!soundEnabled) return;
        
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
        
        gain.gain.setValueAtTime(0.1, ctx.currentTime + delay);
        gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + delay + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime + delay);
        osc.stop(ctx.currentTime + delay + duration);
    }, []);

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

    const playEnd = useCallback(() => {
        playTone(659, 'triangle', 0.2);
        playTone(523, 'triangle', 0.2, 0.15);
        playTone(440, 'triangle', 0.5, 0.3);
    }, [playTone]);

    return { playStart, playVictory, playDefeat, playClick, playSuccess, playError, playEnd };
};
