declare module "react-simple-maps" {
  export type Coordinates = [number, number];
  type CSSProperties = import("react").CSSProperties;
  type MouseEventHandler<T extends Element> = import("react").MouseEventHandler<T>;
  type ReactNode = import("react").ReactNode;
  type ComponentType<P = {}> = import("react").ComponentType<P>;

  /**
   * A geography after react-simple-maps has normalized the source feature.
   * The app's world, state, and province sources all provide string IDs and
   * string properties, and react-simple-maps adds rsmKey for rendering.
   */
  export interface RsmGeography {
    type: "Feature";
    id: string | number;
    rsmKey: string;
    svgPath: string;
    properties: Record<string, string | undefined>;
    geometry: {
      type: string;
      coordinates: unknown;
    };
  }

  export interface GeographyStyle {
    default?: CSSProperties;
    hover?: CSSProperties;
    pressed?: CSSProperties;
  }

  export interface ComposableMapProps {
    children?: ReactNode;
    projection?: string;
    projectionConfig?: {
      scale?: number;
      center?: Coordinates;
      rotate?: [number, number, number?];
      parallels?: [number, number];
    };
    style?: CSSProperties;
    className?: string;
  }

  export interface ZoomableGroupMove {
    zoom: number;
    coordinates: Coordinates;
  }

  export interface ZoomableGroupProps {
    children?: ReactNode;
    center?: Coordinates;
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    translateExtent?: [Coordinates, Coordinates];
    onMoveStart?: (position: ZoomableGroupMove) => void;
    onMove?: (position: ZoomableGroupMove) => void;
    onMoveEnd?: (position: ZoomableGroupMove) => void;
    className?: string;
  }

  export interface GeographiesRenderProps {
    geographies: RsmGeography[];
  }

  export interface GeographiesProps {
    geography: string;
    children?: (props: GeographiesRenderProps) => ReactNode;
  }

  export interface GeographyProps {
    geography: RsmGeography;
    onClick?: MouseEventHandler<SVGPathElement>;
    onMouseEnter?: MouseEventHandler<SVGPathElement>;
    onMouseMove?: MouseEventHandler<SVGPathElement>;
    onMouseLeave?: MouseEventHandler<SVGPathElement>;
    onMouseDown?: MouseEventHandler<SVGPathElement>;
    onMouseUp?: MouseEventHandler<SVGPathElement>;
    onFocus?: import("react").FocusEventHandler<SVGPathElement>;
    onBlur?: import("react").FocusEventHandler<SVGPathElement>;
    style?: GeographyStyle;
    className?: string;
  }

  export interface MarkerProps {
    coordinates: Coordinates;
    children?: ReactNode;
    style?: CSSProperties;
    className?: string;
  }

  export const ComposableMap: ComponentType<ComposableMapProps>;
  export const Geographies: ComponentType<GeographiesProps>;
  export const Geography: ComponentType<GeographyProps>;
  export const Marker: ComponentType<MarkerProps>;
  export const ZoomableGroup: ComponentType<ZoomableGroupProps>;
}
