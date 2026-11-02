/*
 * Declares the pinned `qrcode-generator` package, which does not ship its own
 * type definitions. Only the subset the attendance QR panel uses is declared;
 * the rest is deliberately omitted so misuse surfaces as a type error.
 */
declare module "qrcode-generator" {
  export interface QRCode {
    addData(data: string): void;
    make(): void;
    createSvgTag(options: { cellSize?: number; margin?: number; scalable?: boolean }): string;
    createSvgTag(cellSize?: number, margin?: number): string;
  }

  function qrcode(typeNumber: number, errorCorrectionLevel: "L" | "M" | "Q" | "H"): QRCode;

  export default qrcode;
}
