// Enhanced currency parsing function that handles Norwegian currency delimiters
export function parseNorwegianCurrency(moneyStr: string): number | undefined {
    if (!moneyStr) return undefined;

    // Clean up the string - remove leading/trailing whitespace
    const cleaned = moneyStr.trim();

    // Check for both comma and dot in the string
    const hasComma = cleaned.includes(',');
    const hasDot = cleaned.includes('.');

    // Find the last comma and dot positions
    const lastCommaPos = cleaned.lastIndexOf(',');
    const lastDotPos = cleaned.lastIndexOf('.');

    let normalized: string;

    if (hasComma && hasDot) {
        // Both present - determine format by position
        if (lastCommaPos > lastDotPos) {
            // Format: 1.234,56 (Norwegian: dot=thousands, comma=decimal)
            normalized = cleaned.replace(/\./g, '').replace(',', '.');
        } else {
            // Format: 1,234.56 (International: comma=thousands, dot=decimal)
            normalized = cleaned.replace(/,/g, '');
        }
    } else if (hasComma && !hasDot) {
        // Only comma present
        // Check if it's likely a decimal separator (2 digits after comma)
        const afterComma = cleaned.substring(lastCommaPos + 1);
        if (afterComma.length === 2 && /^\d{2}$/.test(afterComma)) {
            // Format: 123,45 (Norwegian decimal)
            normalized = cleaned.replace(',', '.');
        } else {
            // Format: 1,234 (thousands separator) - treat as integer
            normalized = cleaned.replace(/,/g, '');
        }
    } else if (hasDot && !hasComma) {
        // Only dot present
        // Check if it's likely a decimal separator (2 digits after dot)
        const afterDot = cleaned.substring(lastDotPos + 1);
        if (afterDot.length === 2 && /^\d{2}$/.test(afterDot)) {
            // Format: 123.45 (decimal separator)
            normalized = cleaned;
        } else {
            // Format: 1.234 (thousands separator) - treat as integer
            normalized = cleaned.replace(/\./g, '');
        }
    } else {
        // No comma or dot - just numbers
        normalized = cleaned;
    }

    // Remove any remaining non-digit characters except the decimal point
    normalized = normalized.replace(/[^\d.]/g, '');

    const result = parseFloat(normalized);
    return isNaN(result) ? undefined : result;
}

// Extract structured fields from Norwegian/English receipt text
export function extractStructuredFields(text: string): {
    merchant?: string;
    vatAmount?: number;
    total?: number;
    currency?: string
} {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    let merchant = lines[0]?.slice(0, 60);

    // Try to find a line with 'Org.nr' for merchant
    const orgIdx = lines.findIndex(l => /org\.?\s*nr/i.test(l));
    if (orgIdx > 0) {
        merchant = lines[orgIdx - 1].slice(0, 60);
    }

    // Currency detection (NOK by default)
    const currency = /\b(EUR|USD|GBP|SEK|DKK)\b/i.test(text)
        ? (text.match(/\b(EUR|USD|GBP|SEK|DKK)\b/i)?.[1].toUpperCase())
        : 'NOK';

    // Enhanced VAT (MVA) extraction: look for lines containing MVA or VAT with a number
    let vatAmount: number | undefined;
    const vatMatches = [
        text.match(/(?:MVA|VAT)\s*(?:25%?)?\s*([0-9]{1,4}(?:[.,][0-9]{3})*[.,][0-9]{2})/i),
        text.match(/MVA\s+([0-9]{1,4}(?:[.,][0-9]{3})*[.,][0-9]{2})/i),
        text.match(/([0-9]{1,4}(?:[.,][0-9]{3})*[.,][0-9]{2})\s*(?:MVA|VAT)/i)
    ];

    for (const vatMatch of vatMatches) {
        if (vatMatch) {
            vatAmount = parseNorwegianCurrency(vatMatch[1]);
            if (vatAmount) break;
        }
    }

    // Enhanced total extraction with better Norwegian currency support
    const moneyRegex = /(?:(?:Total|Sum|Å betale|Beløp|Totalt|Subtotal|til gode)\D{0,15})?([0-9]{1,4}(?:[ .,][0-9]{3})*[.,][0-9]{2}|[0-9]+[.,][0-9]{2}|[0-9]+)/gi;
    let max = 0;
    let match: RegExpExecArray | null;
    while ((match = moneyRegex.exec(text))) {
        const raw = match[1];
        const normalized = parseNorwegianCurrency(raw);
        if (normalized && normalized > max && normalized < 1_000_000) {
            max = normalized;
        }
    }
    const total = max || undefined;
    return { merchant, vatAmount, total, currency };
}
