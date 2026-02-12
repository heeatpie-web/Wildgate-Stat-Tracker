import React from 'react';
import { LayoutGrid, Newspaper } from 'lucide-react';
import { VisualMode } from '../../types';

interface DenseEditorialToggleProps {
    visualMode: VisualMode;
    onChange: (mode: VisualMode) => void;
}

export const DenseEditorialToggle: React.FC<DenseEditorialToggleProps> = ({ visualMode, onChange }) => {
    return (
        <div className="flex md3-surface-high p-1 rounded-xl">
            <button onClick={() => onChange('dense')}
                className={`md3-chip flex items-center gap-1.5 px-3 py-1.5 text-label-sm font-black uppercase transition-all ${visualMode === 'dense' ? 'md3-chip--selected' : 'opacity-60 hover:opacity-100'}`}>
                <LayoutGrid size={12} /> Dense
            </button>
            <button onClick={() => onChange('editorial')}
                className={`md3-chip flex items-center gap-1.5 px-3 py-1.5 text-label-sm font-black uppercase transition-all ${visualMode === 'editorial' ? 'md3-chip--selected' : 'opacity-60 hover:opacity-100'}`}>
                <Newspaper size={12} /> Editorial
            </button>
        </div>
    );
};

/**
 * Inline narrative toggle - sits within each analytics view's content area.
 * Shows a small pill toggle to show/hide the narrative summary text.
 */
export const InlineNarrativeToggle: React.FC<{ visualMode: VisualMode; onChange: (mode: VisualMode) => void }> = ({ visualMode, onChange }) => {
    const isEditorial = visualMode === 'editorial';
    return (
        <button
            onClick={() => onChange(isEditorial ? 'dense' : 'editorial')}
            className={`md3-chip flex items-center gap-1.5 px-3 py-1.5 text-label-sm font-black uppercase transition-all ${isEditorial ? 'md3-chip--selected' : 'md3-surface-high opacity-50 hover:opacity-80'}`}
        >
            <Newspaper size={11} />
            {isEditorial ? 'Narrative On' : 'Narrative'}
        </button>
    );
};




