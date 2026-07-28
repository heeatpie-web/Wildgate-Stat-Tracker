import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import React from 'react';

vi.mock('./HistoryTable', () => ({
    default: ({ isActive }: { isActive: boolean }) => (
        <div data-testid="history-table">history-table isActive={String(isActive)}</div>
    ),
}));

vi.mock('./MatchRecordingPage', () => ({
    MatchRecordingPage: () => <div data-testid="match-log">match-log</div>,
}));

import { HistoryView } from './HistoryView';

describe('HistoryView tabs', () => {
    it('opens on the history table', async () => {
        render(<HistoryView isActive />);
        await waitFor(() => expect(screen.getByTestId('history-table')).toBeInTheDocument());
        expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
        expect(screen.getByRole('tab', { name: 'Match Log' })).toHaveAttribute('aria-selected', 'false');
    });

    it('switches to the match log tab', async () => {
        render(<HistoryView isActive />);
        fireEvent.click(screen.getByRole('tab', { name: 'Match Log' }));
        await waitFor(() => expect(screen.getByTestId('match-log')).toBeInTheDocument());
        expect(screen.getByRole('tab', { name: 'Match Log' })).toHaveAttribute('aria-selected', 'true');
    });

    it('keeps the table mounted when the match log is shown so state survives', async () => {
        render(<HistoryView isActive />);
        await waitFor(() => expect(screen.getByTestId('history-table')).toBeInTheDocument());
        fireEvent.click(screen.getByRole('tab', { name: 'Match Log' }));
        await waitFor(() => expect(screen.getByTestId('match-log')).toBeInTheDocument());
        expect(screen.getByTestId('history-table')).toBeInTheDocument();
    });

    it('stops treating the table as active while the match log tab is open', async () => {
        render(<HistoryView isActive />);
        await waitFor(() => expect(screen.getByTestId('history-table')).toHaveTextContent('isActive=true'));
        fireEvent.click(screen.getByRole('tab', { name: 'Match Log' }));
        await waitFor(() => expect(screen.getByTestId('history-table')).toHaveTextContent('isActive=false'));
    });
});
