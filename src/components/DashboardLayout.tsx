import React, { useState, useEffect, useRef } from 'react';
import { Responsive, type Layout, type ResponsiveLayouts, type ResponsiveProps } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

type ResponsiveLayoutComponent = React.ComponentType<ResponsiveProps>;
type ResponsiveLayoutPublicProps = Omit<ResponsiveProps, 'width'>;

// Fallback for environments where WidthProvider behaves inconsistently.
const SimpleWidthProvider = (ComposedComponent: ResponsiveLayoutComponent) => {
  return (props: ResponsiveLayoutPublicProps) => {
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
        <div ref={outerRef} style={{ width: '100%' }}>
            <ComposedComponent {...(props as ResponsiveProps)} width={width} />
        </div>
    );
  };
};

const ResponsiveGridLayout = SimpleWidthProvider(Responsive as ResponsiveLayoutComponent);

const applyStaticFlag = (
  layout: Layout,
  isRearranging: boolean
): Layout => layout.map((item) => ({ ...item, static: !isRearranging }));

interface DashboardLayoutProps {
    layouts: ResponsiveLayouts;
    onLayoutChange: (layout: Layout, layouts: ResponsiveLayouts) => void;
    isRearranging: boolean;
    children: React.ReactNode;
    className?: string;
}

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({ layouts, onLayoutChange, isRearranging, children, className }) => {
    const lg: Layout = layouts.lg || [];
    return (
        <ResponsiveGridLayout 
            className={className}
            layouts={{
                lg: applyStaticFlag(lg, isRearranging),
                md: applyStaticFlag(layouts.md || lg, isRearranging),
                sm: applyStaticFlag(layouts.sm || lg, isRearranging),
                xs: applyStaticFlag(layouts.xs || lg, isRearranging),
                xxs: applyStaticFlag(layouts.xxs || lg, isRearranging)
            }}
            breakpoints={{lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0}}
            cols={{lg: 12, md: 10, sm: 6, xs: 4, xxs: 2}}
            rowHeight={30}
            margin={[16, 16]}
            onLayoutChange={onLayoutChange}
            dragConfig={{ enabled: isRearranging, handle: '.grid-drag-handle' }}
            resizeConfig={{ enabled: isRearranging }}
        >
            {children}
        </ResponsiveGridLayout>
    );
};
