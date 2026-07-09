import type { ForwardRefExoticComponent, RefAttributes } from "react";
import type { IconProps } from "./Icon.types";

export type { IconProps } from "./Icon.types";
export type Icon = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>;

export { AccessibilityRegularIcon } from "./Icon";
