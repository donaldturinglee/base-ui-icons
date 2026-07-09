import React, { ReactNode } from "react";

export type SVGData = {
    [height: string]: {
        /**
         * Width of the SVG at this height
         */
        width: number;
        /**
         * SVG path content
         */
        path: ReactNode;
    };
};

export interface IconProps extends React.SVGAttributes<SVGSVGElement> {
    /**
     * Accessible label for the icon
     */
    "aria-label"?: string;
    /**
     * ID of element that labels the icon
     */
    "aria-labelledby"?: string;
    /**
     * Additional CSS class names
     */
    className?: string;
    /**
     * Fill color for the icon
     */
    fill?: string;
    /**
     * Icon size (number in pixels)
     */
    size?: number;
    /**
     * Icon title for accessibility
     */
    title?: string;
}
