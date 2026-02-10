import React from 'react';
import { SquadronPanel } from './recording/SquadronPanel';
import { RosterPanel } from './recording/RosterPanel';
import { MissionPanel } from './recording/MissionPanel';
import { ActionPanel } from './recording/ActionPanel';
// TimelinePanel archived

interface RecordingViewProps {
    onSmartCaptureData?: (data: any) => void;
}

export const RecordingView: React.FC<RecordingViewProps> = ({ onSmartCaptureData }) => {
    return (
        <div data-tour="view-recording" className="h-full min-h-0 flex gap-4 p-4 overflow-hidden">
            {/* Left Column: Ship & Loadout + Actions */}
            <div className="flex-[1.1] min-w-[220px] max-w-[360px] min-h-0 flex flex-col gap-4 overflow-y-visible overflow-x-hidden pr-0">
                <SquadronPanel />
                <div data-tour="action-panel">
                    <ActionPanel onSmartCaptureData={onSmartCaptureData} />
                </div>
            </div>

            {/* Center: Roster Manager */}
            <div className="flex-[1.4] min-w-[280px] min-h-0 overflow-hidden">
                <RosterPanel />
            </div>

            {/* Right: Mission Intel - Takes proportional space */}
            <div className="flex-[1.8] min-w-[300px] min-h-0 overflow-hidden">
                <MissionPanel />
            </div>
        </div>
    );
};

