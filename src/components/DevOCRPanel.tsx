import React from 'react';
import { FlaskConical, ScanEye, Settings } from 'lucide-react';
import { useUIState } from '../providers/UIStateProvider';

const DevOCRPanel: React.FC = () => {
    const { setActiveView, setShowSettings } = useUIState();

    return (
        <div className="h-full min-h-0 flex items-center justify-center p-4">
            <div className="w-full max-w-2xl rounded-card md3-surface-high border border-md-sys-outline/10 p-6 space-y-4">
                <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-md-sys-primary/14 text-md-sys-primary inline-flex items-center justify-center">
                        <FlaskConical size={22} />
                    </div>
                    <div>
                        <div className="text-label-sm font-bold uppercase tracking-wide text-md-sys-primary">Dev OCR</div>
                        <h2 className="text-title font-black text-md-sys-on-surface">Internal corpus tooling has been removed from this branch</h2>
                    </div>
                </div>

                <p className="text-body text-md-sys-on-surface/62">
                    Beta prep now routes OCR review through Smart Captures and OCR/Capture settings instead of the old internal corpus workflow.
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                    <button
                        type="button"
                        onClick={() => setActiveView('smart-captures')}
                        className="rounded-control border border-md-sys-outline/12 bg-md-sys-surface-container-high px-4 py-4 text-left hover:bg-md-sys-surface-container-highest"
                    >
                        <div className="flex items-center gap-2 text-md-sys-primary">
                            <ScanEye size={16} />
                            <span className="text-label-sm font-bold uppercase tracking-wide">Smart Captures</span>
                        </div>
                        <div className="mt-2 text-body font-semibold text-md-sys-on-surface">Review screenshots, rerun OCR, and resolve queued captures.</div>
                    </button>

                    <button
                        type="button"
                        onClick={() => setShowSettings(true)}
                        className="rounded-control border border-md-sys-outline/12 bg-md-sys-surface-container-high px-4 py-4 text-left hover:bg-md-sys-surface-container-highest"
                    >
                        <div className="flex items-center gap-2 text-md-sys-primary">
                            <Settings size={16} />
                            <span className="text-label-sm font-bold uppercase tracking-wide">OCR Settings</span>
                        </div>
                        <div className="mt-2 text-body font-semibold text-md-sys-on-surface">Adjust capture flow, OCR learning behavior, and box alignment from Settings.</div>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DevOCRPanel;
