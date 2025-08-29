// Simple client-side OCR wrapper using dynamic import of tesseract.js
// Supports multi-language (e.g., 'nor+eng') and progress reporting.

export interface OCRResult { text: string; confidence?: number }

export interface RunOCROptions {
    lang?: string;          // tesseract language code(s), e.g. 'eng', 'nor', 'nor+eng'
    langPath?: string;      // remote path for traineddata files
}

type TesseractNS = {
    recognize: (image: unknown, lang: string, options?: {
        logger?: (m: { status?: string; progress?: number }) => void;
        langPath?: string;
    }) => Promise<{ data: { text: string; confidence?: number } }>;
};

// --- PDF Support via pdfjs-dist (static imports so worker is resolved by Vite) ---
let pdfSupportReady = false;
interface PdfJsLike {
    GlobalWorkerOptions?: { workerSrc?: string };
    getDocument: (src: { data: ArrayBuffer }) => { promise: Promise<{ numPages: number; getPage: (n: number) => Promise<{ getViewport: (opts: { scale: number }) => { width: number; height: number }; render: (params: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<unknown> } }> }> };
}
let pdfjsLibRef: PdfJsLike | null = null;
async function ensurePdfSupport() {
    if (pdfSupportReady) return;
    try {
        const pdfjsLib = await import('pdfjs-dist') as unknown as PdfJsLike;
        // worker ESM url (Vite's ?url loader ensures an absolute URL)
        // We try multiple common paths depending on pdfjs-dist version.
        let workerUrl: string | undefined;
        try {
            workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default || undefined;
        } catch {
            try {
                workerUrl = (await import('pdfjs-dist/build/pdf.worker.mjs?url')).default || undefined;
            } catch {
                // fallback to fake worker (slower) if not found
            }
        }
        if (workerUrl && pdfjsLib.GlobalWorkerOptions) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
        }
        pdfjsLibRef = pdfjsLib;
        pdfSupportReady = true;
    } catch {
        pdfSupportReady = false;
        throw new Error('PDF support not available (failed to load pdfjs-dist).');
    }
}

async function pdfFileToCanvases(file: File): Promise<HTMLCanvasElement[]> {
    await ensurePdfSupport();
    if (!pdfjsLibRef) throw new Error('pdfjs failed to initialize');
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLibRef.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const canvases: HTMLCanvasElement[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: ctx, viewport }).promise;
        canvases.push(canvas);
    }
    return canvases;
}

export async function runOCR(file: File, onProgress?: (p: number) => void, opts?: RunOCROptions): Promise<OCRResult> {
    const { lang = 'eng', langPath = 'https://tessdata.projectnaptha.com/4.0.0' } = opts || {};
    const Tesseract: TesseractNS = await import('tesseract.js') as unknown as TesseractNS;

    const isPDF = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
    try {
        if (isPDF) {
            // Convert PDF pages to canvases then run OCR sequentially.
            const canvases = await pdfFileToCanvases(file);
            if (!canvases.length) throw new Error('PDF has no renderable pages');
            let combinedText = '';
            for (let i = 0; i < canvases.length; i += 1) {
                const canvas = canvases[i];
                const { data } = await Tesseract.recognize(canvas, lang, {
                    langPath,
                    logger: (m: { status?: string; progress?: number }) => {
                        if (m.status === 'recognizing text' && typeof m.progress === 'number') {
                            // Aggregate progress across pages
                            const base = i / canvases.length;
                            const perPagePortion = m.progress / canvases.length;
                            onProgress?.(Math.min(base + perPagePortion, 0.999));
                        }
                    }
                });
                combinedText += (i ? '\n\n' : '') + data.text;
            }
            onProgress?.(1);
            return { text: combinedText, confidence: undefined };
        }
        // Non-PDF: pass file or blob directly
        const { data } = await Tesseract.recognize(file, lang, {
            langPath,
            logger: (m: { status?: string; progress?: number }) => {
                if (m.status === 'recognizing text' && typeof m.progress === 'number') {
                    onProgress?.(m.progress);
                }
            }
        });
        return { text: data.text, confidence: data.confidence };
    } catch (err) {
        // Provide clearer error for PDF unsupported scenarios
        if (isPDF) {
            console.warn('[OCR] PDF processing failed; suggest exporting pages as images first.', err);
        } else {
            console.warn('[OCR] Image processing failed.', err);
        }
        throw err instanceof Error ? err : new Error(String(err));
    }
}
