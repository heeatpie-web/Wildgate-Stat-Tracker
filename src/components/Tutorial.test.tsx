import React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import Tutorial from './Tutorial';

const setActiveView = vi.fn();
const setShowSettings = vi.fn();
const setSidebarCollapsed = vi.fn();

vi.mock('../providers/UIStateProvider', () => ({
  useUIState: () => ({
    activeView: 'recording',
    setActiveView,
    showSettings: false,
    setShowSettings,
    sidebarCollapsed: false,
    setSidebarCollapsed,
  }),
}));

describe('Tutorial', () => {
  beforeAll(() => {
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = vi.fn();
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
    const tourTarget = document.createElement('div');
    tourTarget.setAttribute('data-tour', 'profile-selector');
    document.body.appendChild(tourTarget);
  });

  it('renders with dialog semantics', () => {
    render(<Tutorial onComplete={vi.fn()} onSkip={vi.fn()} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('closes tutorial via Escape', () => {
    const onSkip = vi.fn();
    render(<Tutorial onComplete={vi.fn()} onSkip={onSkip} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
