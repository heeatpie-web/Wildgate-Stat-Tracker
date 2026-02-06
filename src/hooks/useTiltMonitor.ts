/**
 * @module useTiltMonitor
 * Detects frustration patterns (loss streaks, rapid deaths) and fires
 * a callback with a human-readable message for the Tilt Meter widget.
 */
import { useEffect, useRef } from 'react';
import { Match } from '../types';

export const useTiltMonitor = (matches: Match[], onTrigger: (msg: string) => void) => {
  const lastMatchCount = useRef(matches.length);

  useEffect(() => {
    // Only run when a NEW match is added (length increases)
    if (matches.length > lastMatchCount.current) {
        // Get recent matches (sorted by timestamp descending)
        const sorted = [...matches].sort((a,b) => b.timestamp - a.timestamp);
        const last3 = sorted.slice(0, 3);

        if (last3.length === 3) {
            const lossStreak = last3.every(m => m.result === 'Loss');
            
            // Calculate time density: if last 3 matches happened within 20 minutes (playing fast & losing)
            const timeSpan = (last3[0].timestamp - last3[2].timestamp) / 1000 / 60; // minutes
            
            if (lossStreak && timeSpan < 20) {
                const messages = [
                    "Rough skies, pilot. Maybe take a 5-minute hydration break?",
                    "System Alert: Tilt levels rising. Suggesting a quick walk.",
                    "Three losses in rapid succession. Strategic pause recommended.",
                    "Performance anomaly detected. Reset your mental gyro."
                ];
                onTrigger(messages[Math.floor(Math.random() * messages.length)]);
            }
        }
    }
    lastMatchCount.current = matches.length;
  }, [matches, onTrigger]);
};
