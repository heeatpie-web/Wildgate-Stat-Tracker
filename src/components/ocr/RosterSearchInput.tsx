import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { filterRosterByQuery } from '../../utils/ocr/rosterFilter';

interface DropdownAnchor {
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    placeAbove: boolean;
}

interface RosterSearchInputProps {
    value: string;
    onChange: (value: string) => void;
    rosterNames: string[];
    limit?: number;
    placeholder?: string;
    className?: string;
    'aria-label'?: string;
    /** Fired on Enter, after the value has already been committed via onChange. */
    onEnter?: () => void;
    onDragOver?: React.DragEventHandler<HTMLInputElement>;
    onDrop?: React.DragEventHandler<HTMLInputElement>;
}

/**
 * Filtered/ranked roster typeahead, used in place of a native <datalist> so large
 * rosters (1000+ names) don't dump an unfiltered browser-native list on the user.
 * Free-text entry always works — an empty/unmatched result set never blocks typing
 * or committing a brand-new name.
 */
export const RosterSearchInput: React.FC<RosterSearchInputProps> = ({
    value,
    onChange,
    rosterNames,
    limit = 10,
    placeholder,
    className = '',
    onEnter,
    onDragOver,
    onDrop,
    ...rest
}) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [anchor, setAnchor] = useState<DropdownAnchor | null>(null);

    const updateAnchor = useCallback(() => {
        const input = inputRef.current;
        if (!input) {
            setAnchor(null);
            return;
        }
        const rect = input.getBoundingClientRect();
        const viewportPadding = 8;
        const maxDropdownWidth = Math.min(360, window.innerWidth - (viewportPadding * 2));
        const width = Math.max(220, Math.min(Math.max(rect.width, 240), maxDropdownWidth));
        const left = Math.max(
            viewportPadding,
            Math.min(rect.left, window.innerWidth - width - viewportPadding)
        );
        const approxDropdownHeight = 220;
        const minDropdownHeight = 80;
        const maxDropdownHeight = 260;
        const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding);
        const spaceAbove = Math.max(0, rect.top - viewportPadding);
        let placeAbove = spaceBelow < approxDropdownHeight && spaceAbove > spaceBelow;
        const availableSpace = placeAbove ? spaceAbove : spaceBelow;
        const maxHeight = Math.max(
            Math.min(minDropdownHeight, availableSpace),
            Math.min(maxDropdownHeight, availableSpace)
        );
        if (maxHeight <= 0) {
            setAnchor(null);
            return;
        }
        const anchorTop = placeAbove ? (rect.top - 8) : (rect.bottom + 8);
        setAnchor({ top: anchorTop, left, width, maxHeight, placeAbove });
    }, []);

    useEffect(() => {
        if (!isOpen) {
            setAnchor(null);
            return;
        }
        updateAnchor();
        window.addEventListener('resize', updateAnchor);
        window.addEventListener('scroll', updateAnchor, true);
        return () => {
            window.removeEventListener('resize', updateAnchor);
            window.removeEventListener('scroll', updateAnchor, true);
        };
    }, [isOpen, updateAnchor, value]);

    const matches = isOpen ? filterRosterByQuery(rosterNames, value, limit) : [];

    return (
        <>
            <input
                ref={inputRef}
                type="text"
                value={value}
                placeholder={placeholder}
                className={className}
                onChange={(event) => {
                    onChange(event.target.value);
                    setIsOpen(true);
                }}
                onFocus={() => {
                    setIsOpen(true);
                    window.requestAnimationFrame(updateAnchor);
                }}
                onBlur={() => {
                    // Delay so a dropdown-item onClick still fires before we close.
                    window.setTimeout(() => setIsOpen(false), 120);
                }}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        setIsOpen(false);
                        onEnter?.();
                    } else if (event.key === 'Escape') {
                        setIsOpen(false);
                    }
                }}
                onDragOver={onDragOver}
                onDrop={onDrop}
                {...rest}
            />
            {isOpen && anchor && matches.length > 0 && createPortal(
                <div
                    className="ocr-roster-dropdown md3-card rounded-lg shadow-xl overflow-y-auto custom-scrollbar overscroll-contain border border-md-sys-outline/20 bg-md-sys-surface-container-highest p-0"
                    onWheel={(event) => event.stopPropagation()}
                    style={{
                        position: 'fixed',
                        top: anchor.top,
                        left: anchor.left,
                        width: anchor.width,
                        maxHeight: anchor.maxHeight,
                        zIndex: 1200,
                        transform: anchor.placeAbove ? 'translateY(-100%)' : undefined,
                    }}
                >
                    {matches.map((name) => (
                        <button
                            key={name}
                            type="button"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                                onChange(name);
                                setIsOpen(false);
                            }}
                            className="ocr-roster-dropdown-item w-full text-left px-3 py-1.5 text-body text-md-sys-on-surface hover:bg-md-sys-on-surface/10 truncate"
                        >
                            {name}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
};
