import React from 'react';
import { AnalyticsShell } from './analytics/AnalyticsShell';

interface AnalyticsPanelProps {
    isActive?: boolean;
}

const AnalyticsPanel: React.FC<AnalyticsPanelProps> = ({ isActive = true }) => {
    return (
        <div data-tour="view-analytics" className="h-full">
            <AnalyticsShell isActive={isActive} />
        </div>
    );
};

export default AnalyticsPanel;

