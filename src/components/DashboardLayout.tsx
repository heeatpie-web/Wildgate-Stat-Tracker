import React, { useState, useEffect, useRef } from 'react';
import * as ReactGridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// Fallback for missing WidthProvider
const SimpleWidthProvider = (ComposedComponent: any) => {
  return (props: any) => {
    const outerRef = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(window.innerWidth - 40);

    useEffect(() => {
        const updateWidth = () => {
            if (outerRef.current) {
                setWidth(outerRef.current.offsetWidth);
            } else {
                setWidth(window.innerWidth - 40); // fallback
            }
        };
        
        window.addEventListener('resize', updateWidth);
        setTimeout(updateWidth, 100); 
        
        return () => window.removeEventListener('resize', updateWidth);
    }, []);

    return (
        <div ref={outerRef} style={{width: '100%'}}>
            <ComposedComponent {...props} width={width} />
        </div>
    );
  };
};

// @ts-ignore
const RGL = ReactGridLayout.default || ReactGridLayout;
// @ts-ignore
const Responsive = RGL.Responsive || ReactGridLayout.Responsive;

const ResponsiveGridLayout = SimpleWidthProvider(Responsive);

interface DashboardLayoutProps {
    layouts: any;
    onLayoutChange: (layout: any, layouts: any) => void;
    isRearranging: boolean;
    children: React.ReactNode;
    className?: string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ layouts, onLayoutChange, isRearranging, children, className }) => {
    return (
        <ResponsiveGridLayout 
            className={className}
            layouts={{
                lg: layouts.lg.map((l: any) => ({ ...l, static: !isRearranging })),
                md: (layouts.md || layouts.lg).map((l: any) => ({ ...l, static: !isRearranging })),
                sm: (layouts.sm || layouts.lg).map((l: any) => ({ ...l, static: !isRearranging })),
                xs: (layouts.xs || layouts.lg).map((l: any) => ({ ...l, static: !isRearranging })),
                xxs: (layouts.xxs || layouts.lg).map((l: any) => ({ ...l, static: !isRearranging }))
            }}
            breakpoints={{lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0}}
            cols={{lg: 12, md: 10, sm: 6, xs: 4, xxs: 2}}
            rowHeight={30}
            margin={[16, 16]}
            onLayoutChange={onLayoutChange}
            isDraggable={isRearranging}
            isResizable={isRearranging}
            draggableHandle=".grid-drag-handle"
        >
            {children}
        </ResponsiveGridLayout>
    );
};