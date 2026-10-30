// Papyrus: hand-written types for the parts of foliate-js's overlayer.js the reader uses.
export type DrawFunction = (rects: DOMRectList | DOMRect[], options?: Record<string, unknown>) => SVGElement
export declare class Overlayer {
  static highlight: DrawFunction
  static underline: DrawFunction
}
