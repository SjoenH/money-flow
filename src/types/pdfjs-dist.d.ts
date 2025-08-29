declare module 'pdfjs-dist' {
    export const GlobalWorkerOptions: { workerSrc?: string } | undefined;
    export function getDocument(src: { data: ArrayBuffer }): { promise: Promise<PdfDocument> };

    export interface PdfViewport { width: number; height: number }
    export interface PdfPage {
        getViewport(opts: { scale: number }): PdfViewport;
        render(params: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): { promise: Promise<unknown> };
    }
    export interface PdfDocument {
        numPages: number;
        getPage(n: number): Promise<PdfPage>;
    }
}