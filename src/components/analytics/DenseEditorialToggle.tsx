import React from 'react';
import { LayoutGrid, Newspaper } from 'lucide-react';
import { VisualMode } from '../../types';

interface DenseEditorialToggleProps {
    visualMode: VisualMode;
    onChange: (mode: VisualMode) => void;
}

export const DenseEditorialToggle: React.FC<DenseEditorialToggleProps> = ({ visualMode, onChange }) => {
    return (
        <div className="flex bg-md-sys-surface1 p-1 rounded-xl">
            <button onClick={() => onChange('dense')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${visualMode === 'dense' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'opacity-60 hover:opacity-100'}`}>
                <LayoutGrid size={12} /> Dense
            </button>
            <button onClick={() => onChange('editorial')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${visualMode === 'editorial' ? 'bg-md-sys-primary text-md-sys-onPrimary shadow-md' : 'opacity-60 hover:opacity-100'}`}>
                <Newspaper size={12} /> Editorial
            </button>
        </div>
    );
};

/**
 * Inline narrative toggle — sits within each analytics view's content area.
 * Shows a small pill toggle to show/hide the narrative summary text.
 */
export const InlineNarrativeToggle: React.FC<{ visualMode: VisualMode; onChange: (mode: VisualMode) => void }> = ({ visualMode, onChange }) => {
    const isEditorial = visualMode === 'editorial';
    return (
        <button
            onClick={() => onChange(isEditorial ? 'dense' : 'editorial')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all ${
                isEditorial
                    ? 'bg-md-sys-primary/15 text-md-sys-primary ring-1 ring-md-sys-primary/30'
                    : 'bg-md-sys-surface3 opacity-50 hover:opacity-80'
            }`}
        >
            <Newspaper size={11} />
            {isEditorial ? 'Narrative On' : 'Narrative'}
        </button>
    );
};
