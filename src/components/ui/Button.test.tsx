import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Button } from './Button';

describe('Button', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders all variants', () => {
    const { container } = render(
      <div>
        <Button variant="primary">Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="tertiary">Tertiary</Button>
        <Button variant="danger">Danger</Button>
        <Button variant="icon" aria-label="Icon action">
          I
        </Button>
      </div>,
    );

    expect(screen.getByRole('button', { name: 'Primary' })).toHaveClass('wg-btn--primary');
    expect(screen.getByRole('button', { name: 'Secondary' })).toHaveClass('wg-btn--secondary');
    expect(screen.getByRole('button', { name: 'Tertiary' })).toHaveClass('wg-btn--tertiary');
    expect(screen.getByRole('button', { name: 'Danger' })).toHaveClass('wg-btn--danger');
    expect(screen.getByRole('button', { name: 'Icon action' })).toHaveClass('wg-btn--icon');
    expect(container.querySelectorAll('.wg-btn').length).toBe(5);
  });

  it('supports disabled state and blocks interaction', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Disabled</Button>);

    const button = screen.getByRole('button', { name: 'Disabled' });
    expect(button).toBeDisabled();

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    expect(button.querySelector('.wg-btn__ripple')).not.toBeInTheDocument();
  });

  it('supports loading state and blocks interaction', () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Save</Button>);

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(document.querySelector('.wg-btn__spinner')).toBeInTheDocument();

    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('creates a ripple from the click point and removes it after 300ms', () => {
    vi.useFakeTimers();

    render(<Button>Ripple</Button>);
    const button = screen.getByRole('button', { name: 'Ripple' });

    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 100,
      width: 120,
      height: 48,
      top: 100,
      left: 200,
      right: 320,
      bottom: 148,
      toJSON: () => ({}),
    });

    fireEvent.click(button, { clientX: 230, clientY: 122, detail: 1 });

    const ripple = button.querySelector('.wg-btn__ripple') as HTMLElement | null;
    expect(ripple).toBeInTheDocument();
    expect(ripple?.style.getPropertyValue('--wg-ripple-x')).toBe('30px');
    expect(ripple?.style.getPropertyValue('--wg-ripple-y')).toBe('22px');
    expect(ripple?.style.getPropertyValue('--wg-ripple-size')).toBe('240px');

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(button.querySelector('.wg-btn__ripple')).not.toBeInTheDocument();
  });

  it('is keyboard-focusable', () => {
    render(<Button>Focusable</Button>);
    const button = screen.getByRole('button', { name: 'Focusable' });

    button.focus();
    expect(button).toHaveFocus();
  });

  it('suppresses ripple when reduced motion is preferred', () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });

    render(<Button>No Ripple</Button>);
    const button = screen.getByRole('button', { name: 'No Ripple' });
    fireEvent.click(button, { clientX: 10, clientY: 10, detail: 1 });
    expect(button.querySelector('.wg-btn__ripple')).not.toBeInTheDocument();

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: originalMatchMedia,
    });
  });
});
