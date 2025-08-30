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

    // Enhanced merchant detection - look for common store patterns first
    let merchant = lines[0]?.slice(0, 60);
    let foundStorePattern = false;

    // Look for known Norwegian store names or patterns in noisy text
    const storePatterns = [
        /BILTEMA\s*NORGE/i,
        /BILTEMA/i,
        /ANTONSPORT/i,
        /COOP\s*PRIX/i,
        /REMA\s*1000/i,
        /ICA\s*SUPERMARKET/i,
        /KIWI/i,
        /BUNNPRIS/i,
        /MENY/i,
        /EUROPRIS/i,
        /PLANTASJEN/i,
        /SPORTSHOLDING/i // This might catch the parent company
    ];

    for (const pattern of storePatterns) {
        const match = text.match(pattern);
        if (match) {
            let foundMerchant = match[0].replace(/\s+/g, ' ').trim();
            // Special handling: if we find SPORTSHOLDING, look nearby for ANTONSPORT
            if (/SPORTSHOLDING/i.test(foundMerchant)) {
                const antonsportMatch = text.match(/ANTONSPORT/i);
                if (antonsportMatch) {
                    foundMerchant = antonsportMatch[0];
                }
            }
            merchant = foundMerchant;
            foundStorePattern = true;
            break;
        }
    }

    // Try to find a line with 'Org.nr' or 'Bus.Reg.No' for merchant (only if no store pattern found)
    if (!foundStorePattern) {
        const orgIdx = lines.findIndex(l => /(?:org\.?\s*nr|bus\.?\s*reg\.?\s*no)/i.test(l));
        if (orgIdx >= 0) {
            // Look for merchant name in the lines above the org.nr line
            for (let i = Math.max(0, orgIdx - 3); i < orgIdx; i++) {
                const line = lines[i];
                // Skip lines that look like addresses (contain numbers and specific patterns)
                if (line && !/^\d+\s|\d{4}\s/.test(line) && !/(telefon|phone)/i.test(line) && line.length > 2) {
                    // Look for lines that seem like business names (contain letters, may have AS/AB etc.)
                    if (/[a-zA-ZæøåÆØÅ]{3,}/.test(line)) {
                        merchant = line.slice(0, 60).trim();
                        break;
                    }
                }
            }
        }
    }

    // Currency detection (NOK by default, look for explicit currency mentions)
    let currency = 'NOK';
    const currencyMatch = text.match(/\b(EUR|USD|GBP|SEK|DKK|NOK)\b/i);
    if (currencyMatch) {
        currency = currencyMatch[1].toUpperCase();
    }

    // Enhanced VAT (MVA) extraction: look for lines containing MVA or VAT with a number
    let vatAmount: number | undefined;
    const vatMatches = [
        // Match VAT breakdown line like "1599.20 25% 399.80 1999.00"
        text.match(/([0-9]{1,4}(?:[.,]\s*[0-9]{3})*[.,][0-9]{2})\s*25%\s*([0-9]{1,4}(?:[.,]\s*[0-9]{3})*[.,][0-9]{2})/i),
        // Match "Herav mva 82.10" format (common in Norwegian receipts)
        text.match(/herav\s+mva\s+([0-9]{1,4}(?:[.,][0-9]{3})*[.,][0-9]{2})/i),
        text.match(/(?:MVA|VAT)\s*(?:25%?)?\s*([0-9]{1,4}(?:[.,][0-9]{3})*[.,][0-9]{2})/i),
        text.match(/MVA\s+([0-9]{1,4}(?:[.,][0-9]{3})*[.,][0-9]{2})/i),
        text.match(/([0-9]{1,4}(?:[.,][0-9]{3})*[.,][0-9]{2})\s*(?:MVA|VAT)/i)
    ];

    for (const vatMatch of vatMatches) {
        if (vatMatch) {
            // For the VAT breakdown format, take the second number (the VAT amount)
            const vatString = vatMatch[2] || vatMatch[1];
            vatAmount = parseNorwegianCurrency(vatString);
            if (vatAmount) break;
        }
    }

    // Enhanced total extraction - look for specific total indicators first
    let total: number | undefined;

    // First try to find explicit total/sum lines
    const totalPatterns = [
        /(?:totalt|total|sum|å\s*betale|beløp|purchase\s*nok)\s*[:=]?\s*([0-9]{1,4}(?:[\s.,][0-9]{3})*[.,][0-9]{2}|[0-9]+[.,][0-9]{2})/gi,
        /bank:\s*([0-9]{1,4}(?:[\s.,][0-9]{3})*[.,][0-9]{2})/gi,
        /([0-9]{1,4}(?:[\s.,][0-9]{3})*[.,][0-9]{2})\s*(?:totalt|total|sum)/gi
    ];

    for (const pattern of totalPatterns) {
        let match: RegExpExecArray | null;
        pattern.lastIndex = 0; // Reset regex
        while ((match = pattern.exec(text))) {
            const amount = parseNorwegianCurrency(match[1]);
            if (amount && amount > (total || 0) && amount < 1_000_000) {
                total = amount;
            }
        }
    }

    // If no explicit total found, find the largest reasonable amount
    if (!total) {
        const moneyRegex = /([0-9]{1,4}(?:[\s.,][0-9]{3})*[.,][0-9]{2}|[0-9]+[.,][0-9]{2})/g;
        let max = 0;
        let match: RegExpExecArray | null;
        while ((match = moneyRegex.exec(text))) {
            const amount = parseNorwegianCurrency(match[1]);
            if (amount && amount > max && amount < 1_000_000) {
                max = amount;
            }
        }
        total = max > 0 ? max : undefined;
    }

    return { merchant, vatAmount, total, currency };
}
