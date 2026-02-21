import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { OcrRegionEditorModal } from './OcrRegionEditorModal';
import { createDefaultOcrRegions } from '../store/slices/createSettingsSlice';

describe('OcrRegionEditorModal', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const OriginalFileReader = globalThis.FileReader;
    const originalElectronAPI = window.electronAPI;

    beforeEach(() => {
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            writable: true,
            value: vi.fn(() => 'blob:roi-preview'),
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            writable: true,
            value: vi.fn(),
        });
    });

    afterEach(() => {
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            writable: true,
            value: originalCreateObjectURL,
        });
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            writable: true,
            value: originalRevokeObjectURL,
        });
        globalThis.FileReader = OriginalFileReader;
        window.electronAPI = originalElectronAPI;
        vi.restoreAllMocks();
    });

    const renderModal = (overrides: Partial<{
        isOpen: boolean;
        onApply: (...args: unknown[]) => void;
        onClose: () => void;
    }> = {}) => render(
        <OcrRegionEditorModal
            isOpen={overrides.isOpen ?? true}
            initialRegions={createDefaultOcrRegions()}
            onApply={overrides.onApply ?? vi.fn()}
            onClose={overrides.onClose ?? vi.fn()}
        />
    );

    it('does not close when clicking the backdrop', () => {
        const onClose = vi.fn();
        renderModal({ onClose });
        const dialog = screen.getByRole('dialog');
        const backdrop = dialog.parentElement;
        expect(backdrop).toBeTruthy();

        fireEvent.click(backdrop as HTMLElement);

        expect(onClose).not.toHaveBeenCalled();
    });

    it('opens the file picker from the load button', () => {
        renderModal();
        const inputClickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');

        fireEvent.click(screen.getByRole('button', { name: /load screenshot/i }));

        expect(inputClickSpy).toHaveBeenCalled();
    });

    it('closes with Escape', () => {
        const onClose = vi.fn();
        renderModal({ onClose });

        fireEvent.keyDown(window, { key: 'Escape' });

        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('renders an image preview after selecting a file', () => {
        renderModal();
        const input = document.body.querySelector('input[type="file"][aria-label="Load screenshot file"]');
        expect(input).toBeTruthy();

        const screenshot = new File(['image-bytes'], 'capture.png', { type: 'image/png' });
        fireEvent.change(input as HTMLInputElement, { target: { files: [screenshot] } });

        const preview = screen.getByAltText('ROI editing target');
        expect(preview).toHaveAttribute('src', 'blob:roi-preview');
        expect(URL.createObjectURL).toHaveBeenCalledWith(screenshot);
    });

    it('supports loading and selecting multiple screenshots', async () => {
        const createObjectUrlMock = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;
        createObjectUrlMock
            .mockReturnValueOnce('blob:first')
            .mockReturnValueOnce('blob:second');

        renderModal();
        const input = document.body.querySelector('input[type="file"][aria-label="Load screenshot file"]');
        expect(input).toBeTruthy();

        const first = new File(['a'], 'top.png', { type: 'image/png' });
        const second = new File(['b'], 'bottom.png', { type: 'image/png' });
        fireEvent.change(input as HTMLInputElement, { target: { files: [first, second] } });

        expect(screen.getByText(/Loaded \(2\)/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /2\. bottom\.png/i })).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /2\. bottom\.png/i }));

        await waitFor(() => {
            expect(createObjectUrlMock).toHaveBeenCalledWith(second);
        });
    });

    it('shows a visible error when preview decode and fallback read fail', () => {
        class BrokenFileReaderMock {
            public onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
            public onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;

            readAsDataURL(_file: Blob) {
                this.onerror?.(new Event('error') as ProgressEvent<FileReader>);
            }
        }

        globalThis.FileReader = BrokenFileReaderMock as unknown as typeof FileReader;

        renderModal();
        const input = document.body.querySelector('input[type="file"][aria-label="Load screenshot file"]');
        expect(input).toBeTruthy();

        const screenshot = new File(['image-bytes'], 'capture.png', { type: 'image/png' });
        fireEvent.change(input as HTMLInputElement, { target: { files: [screenshot] } });

        const preview = screen.getByAltText('ROI editing target');
        fireEvent.error(preview);

        expect(screen.getByRole('alert')).toHaveTextContent('Unable to load the selected image.');
    });
});
