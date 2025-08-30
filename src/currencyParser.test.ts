import { describe, test, expect } from 'vitest'
import { parseNorwegianCurrency, extractStructuredFields } from './utils/currencyParser'

describe('Norwegian Currency Parser', () => {
    describe('Norwegian format with comma as decimal separator', () => {
        test('should parse simple Norwegian decimal format', () => {
            expect(parseNorwegianCurrency('123,45')).toBe(123.45)
            expect(parseNorwegianCurrency('1,99')).toBe(1.99)
            expect(parseNorwegianCurrency('999,00')).toBe(999.00)
        })

        test('should parse Norwegian format with thousands separator', () => {
            expect(parseNorwegianCurrency('1.234,56')).toBe(1234.56)
            expect(parseNorwegianCurrency('12.345,67')).toBe(12345.67)
            expect(parseNorwegianCurrency('123.456,78')).toBe(123456.78)
        })

        test('should parse Norwegian format with spaces as thousands separator', () => {
            expect(parseNorwegianCurrency('1 234,56')).toBe(1234.56)
            expect(parseNorwegianCurrency('12 345,67')).toBe(12345.67)
        })
    })

    describe('International format with dot as decimal separator', () => {
        test('should parse simple international decimal format', () => {
            expect(parseNorwegianCurrency('123.45')).toBe(123.45)
            expect(parseNorwegianCurrency('1.99')).toBe(1.99)
            expect(parseNorwegianCurrency('999.00')).toBe(999.00)
        })

        test('should parse international format with comma thousands separator', () => {
            expect(parseNorwegianCurrency('1,234.56')).toBe(1234.56)
            expect(parseNorwegianCurrency('12,345.67')).toBe(12345.67)
            expect(parseNorwegianCurrency('123,456.78')).toBe(123456.78)
        })
    })

    describe('Edge cases and ambiguous formats', () => {
        test('should handle integers without decimal separators', () => {
            expect(parseNorwegianCurrency('123')).toBe(123)
            expect(parseNorwegianCurrency('1234')).toBe(1234)
        })

        test('should handle thousands separators only', () => {
            expect(parseNorwegianCurrency('1.234')).toBe(1234) // Treated as thousands separator
            expect(parseNorwegianCurrency('1,234')).toBe(1234) // Treated as thousands separator
        })

        test('should handle whitespace', () => {
            expect(parseNorwegianCurrency(' 123,45 ')).toBe(123.45)
            expect(parseNorwegianCurrency('\t1.234,56\n')).toBe(1234.56)
        })

        test('should return undefined for invalid inputs', () => {
            expect(parseNorwegianCurrency('')).toBe(undefined)
            expect(parseNorwegianCurrency('abc')).toBe(undefined)
        })
    })

    describe('Real-world Norwegian receipt examples', () => {
        test('should parse typical Norwegian grocery store prices', () => {
            expect(parseNorwegianCurrency('12,90')).toBe(12.90)  // Milk price
            expect(parseNorwegianCurrency('45,50')).toBe(45.50)  // Bread price
            expect(parseNorwegianCurrency('234,75')).toBe(234.75) // Larger item
        })

        test('should parse Norwegian receipt totals with thousands', () => {
            expect(parseNorwegianCurrency('1.245,80')).toBe(1245.80)  // Large shopping total
            expect(parseNorwegianCurrency('2.150,00')).toBe(2150.00)  // Even larger total
        })

        test('should handle Norwegian VAT amounts', () => {
            expect(parseNorwegianCurrency('187,96')).toBe(187.96)  // 25% VAT on 751,84
            expect(parseNorwegianCurrency('45,00')).toBe(45.00)    // VAT on 180,00
        })
    })

    describe('Receipt line item parsing compatibility', () => {
        test('should handle prices with quantity patterns', () => {
            expect(parseNorwegianCurrency('25,90')).toBe(25.90)  // 2x12,95 scenario
            expect(parseNorwegianCurrency('15,00')).toBe(15.00)  // 3*5,00 scenario
        })
    })
})

describe('Receipt Text Extraction', () => {
    test('should extract Norwegian receipt with comma decimals', () => {
        const receiptText = `
COOP PRIX
Storgata 123
Oslo

Melk                    12,90
Brød                    25,50
Ost                     89,75

Sum                    128,15
MVA 25%                 25,63
Totalt å betale        128,15
    `.trim()

        const result = extractStructuredFields(receiptText)
        expect(result.total).toBe(128.15)
        expect(result.vatAmount).toBe(25.63)
        expect(result.currency).toBe('NOK')
        expect(result.merchant).toBe('COOP PRIX')
    })

    test('should extract Norwegian receipt with thousands separator', () => {
        const receiptText = `
REMA 1000
Hovedgata 456

Diverse varer         1.245,80
MVA                     249,16
Sum å betale          1.245,80
    `.trim()

        const result = extractStructuredFields(receiptText)
        expect(result.total).toBe(1245.80)
        expect(result.vatAmount).toBe(249.16)
        expect(result.merchant).toBe('REMA 1000')
    })

    test('should extract receipt with period decimal separator', () => {
        const receiptText = `
Local Store
Main Street 789

Item 1                  123.45
Item 2                  67.89
Total                   191.34
VAT                     38.27
    `.trim()

        const result = extractStructuredFields(receiptText)
        expect(result.total).toBe(191.34)
        expect(result.vatAmount).toBe(38.27)
        expect(result.merchant).toBe('Local Store')
    })

    test('should handle mixed format receipts', () => {
        const receiptText = `
ICA Supermarket
Storveien 12A

Bananer 1kg             23,90
Kaffe premium         1.125,00
Juice 2L                45.99

Totalt                1.194,89
MVA 25%                 238,98
    `.trim()

        const result = extractStructuredFields(receiptText)
        expect(result.total).toBe(1194.89)
        expect(result.vatAmount).toBe(238.98)
        expect(result.merchant).toBe('ICA Supermarket')
    })

    test('should detect foreign currency', () => {
        const receiptText = `
Duty Free Shop
Terminal 2

Item 1                  50.00 EUR
Item 2                  75.50 EUR
Total                  125.50 EUR
    `.trim()

        const result = extractStructuredFields(receiptText)
        expect(result.currency).toBe('EUR')
        expect(result.total).toBe(125.50)
    })

    test('should handle receipts with org.nr for merchant detection', () => {
        const receiptText = `
Bakeri AS
Gateveien 45
0123 Oslo
Org.nr: 123456789

Rundstykker             25,00
Kaffe                   30,00

Sum                     55,00
    `.trim()

        const result = extractStructuredFields(receiptText)
        expect(result.merchant).toBe('Bakeri AS')
        expect(result.total).toBe(55.00)
    })
})
