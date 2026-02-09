import React from 'react';
import { AnalyticsShell } from './analytics/AnalyticsShell';

const AnalyticsPanel: React.FC = () => {
    return (
        <div data-tour="view-analytics" className="h-full">
            <AnalyticsShell />
        </div>
    );
};

export default AnalyticsPanel;
