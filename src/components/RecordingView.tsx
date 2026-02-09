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
        <div data-tour="view-recording" className="h-full flex gap-4 p-4">
            {/* Left Column: Ship & Loadout + Actions */}
            <div className="flex-[1.2] min-w-[220px] flex flex-col gap-4 overflow-hidden">
                <SquadronPanel />
                <div data-tour="action-panel">
                    <ActionPanel onSmartCaptureData={onSmartCaptureData} />
                </div>
            </div>

            {/* Center: Roster Manager */}
            <div className="flex-[1.5] min-w-[280px] overflow-hidden">
                <RosterPanel />
            </div>

            {/* Middle-Right: Tactical Timeline - Archived
            <div className="flex-[1.5] min-w-[260px] overflow-hidden">
                <TimelinePanel />
            </div> 
            */}

            {/* Right: Mission Intel - Takes proportional space */}
            <div className="flex-[2] min-w-[320px] overflow-hidden">
                <MissionPanel />
            </div>
        </div>
    );
};
