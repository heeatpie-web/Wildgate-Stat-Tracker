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

    const renderModal = () => render(
        <OcrRegionEditorModal
            isOpen
            initialRegions={createDefaultOcrRegions()}
            onApply={vi.fn()}
            onClose={vi.fn()}
        />
    );

    it('opens the file picker from the load button when electron bridge is unavailable', () => {
        renderModal();
        const inputClickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');

        fireEvent.click(screen.getByRole('button', { name: /load screenshot/i }));

        expect(inputClickSpy).toHaveBeenCalled();
    });

    it('uses electron picker and previews returned image data via blob URL', async () => {
        // Stub atob so the base64 decode path doesn't need a real image payload
        const atobSpy = vi.spyOn(globalThis, 'atob').mockReturnValue('fake-binary');

        const invoke = vi.fn().mockResolvedValue({
            success: true,
            data: {
                canceled: false,
                filename: 'capture.png',
                dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
            },
        });
        window.electronAPI = {
            invoke,
            send: vi.fn(),
            on: vi.fn(() => () => {}),
            removeAllListeners: vi.fn(),
        };

        renderModal();
        const inputClickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');

        fireEvent.click(screen.getByRole('button', { name: /load screenshot/i }));

        await waitFor(() => expect(invoke).toHaveBeenCalledWith('pick-roi-image'));
        expect(inputClickSpy).not.toHaveBeenCalled();

        // The data URL is decoded via atob, converted to a Blob, then beginImageLoad creates a blob: URL
        await waitFor(() => expect(atobSpy).toHaveBeenCalled());
        const preview = screen.getByAltText('ROI editing target');
        expect(preview).toHaveAttribute('src', 'blob:roi-preview');

        atobSpy.mockRestore();
    });

    it('shows restart guidance when picker channel is blocked by stale preload', async () => {
        const invoke = vi.fn().mockRejectedValue(new Error('IPC invoke blocked: pick-roi-image'));
        window.electronAPI = {
            invoke,
            send: vi.fn(),
            on: vi.fn(() => () => {}),
            removeAllListeners: vi.fn(),
        };

        renderModal();
        const inputClickSpy = vi.spyOn(HTMLInputElement.prototype, 'click');
        fireEvent.click(screen.getByRole('button', { name: /load screenshot/i }));

        await waitFor(() => expect(invoke).toHaveBeenCalledWith('pick-roi-image'));
        expect(inputClickSpy).toHaveBeenCalled();
        expect(screen.getByRole('alert')).toHaveTextContent('Screenshot picker is unavailable. Restart the app, then try again.');
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
