import { useCallback, useEffect, useRef } from 'react';

export type AriaLivePoliteness = 'polite' | 'assertive';

const createLiveRegion = (politeness: AriaLivePoliteness): HTMLDivElement => {
  const element = document.createElement('div');
  element.className = 'a11y-sr-only';
  element.setAttribute('aria-live', politeness);
  element.setAttribute('aria-atomic', 'true');
  element.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
  element.setAttribute('data-a11y-live', politeness);
  return element;
};

export const useAriaLiveRegion = (enabled = true) => {
  const politeRegionRef = useRef<HTMLDivElement | null>(null);
  const assertiveRegionRef = useRef<HTMLDivElement | null>(null);
  const announceTimerRef = useRef<number | null>(null);
  const clearTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof document === 'undefined') return undefined;

    const politeRegion = createLiveRegion('polite');
    const assertiveRegion = createLiveRegion('assertive');
    politeRegionRef.current = politeRegion;
    assertiveRegionRef.current = assertiveRegion;

    document.body.appendChild(politeRegion);
    document.body.appendChild(assertiveRegion);

    return () => {
      if (announceTimerRef.current != null) {
        window.clearTimeout(announceTimerRef.current);
      }
      if (clearTimerRef.current != null) {
        window.clearTimeout(clearTimerRef.current);
      }
      politeRegion.remove();
      assertiveRegion.remove();
      politeRegionRef.current = null;
      assertiveRegionRef.current = null;
    };
  }, [enabled]);

  const announce = useCallback((message: string, politeness: AriaLivePoliteness = 'polite') => {
    if (!enabled) return;
    const target = politeness === 'assertive' ? assertiveRegionRef.current : politeRegionRef.current;
    const normalizedMessage = String(message || '').trim();
    if (!target || !normalizedMessage) return;

    target.textContent = '';
    if (announceTimerRef.current != null) {
      window.clearTimeout(announceTimerRef.current);
    }
    if (clearTimerRef.current != null) {
      window.clearTimeout(clearTimerRef.current);
    }

    announceTimerRef.current = window.setTimeout(() => {
      target.textContent = normalizedMessage;
      clearTimerRef.current = window.setTimeout(() => {
        target.textContent = '';
      }, 1500);
    }, 20);
  }, [enabled]);

  return { announce };
};

