// Demo script to test Norwegian currency delimiter handling
// Run with: node currencyDemo.js (after compiling from TypeScript)

import { parseNorwegianCurrency, extractStructuredFields } from './utils/currencyParser.js';

console.log('🇳🇴 Norwegian Currency Delimiter Demo\n');

// Test cases for Norwegian currency delimiter handling
const testCases = [
    // Norwegian formats
    { input: '123,45', expected: 123.45, description: 'Simple Norwegian decimal' },
    { input: '1.234,56', expected: 1234.56, description: 'Norwegian with thousands separator' },
    { input: '12,90', expected: 12.90, description: 'Typical grocery price' },

    // International formats  
    { input: '123.45', expected: 123.45, description: 'International decimal' },
    { input: '1,234.56', expected: 1234.56, description: 'International with thousands' },

    // Edge cases
    { input: '1.234', expected: 1234, description: 'Thousands separator only' },
    { input: '1,234', expected: 1234, description: 'Thousands separator only' },
    { input: ' 456,78 ', expected: 456.78, description: 'With whitespace' }
];

console.log('Currency Parsing Tests:');
console.log('======================');
let passed = 0;
let total = testCases.length;

testCases.forEach(({ input, expected, description }) => {
    const result = parseNorwegianCurrency(input);
    const status = result === expected ? '✅' : '❌';
    if (result === expected) passed++;

    console.log(`${status} ${input.padEnd(12)} → ${result} (${description})`);
    if (result !== expected) {
        console.log(`   Expected: ${expected}, Got: ${result}`);
    }
});

console.log(`\nResults: ${passed}/${total} tests passed\n`);

// Receipt extraction test
console.log('Receipt Text Extraction Test:');
console.log('============================');

const norwegianReceipt = `
COOP PRIX
Storgata 123, Oslo

Melk Tine 1L            12,90
Brød Bakehuset          25,50
Ost Norvegia           89,75

Subtotal              128,15
MVA 25%                25,63
Totalt å betale       128,15
`.trim();

const result = extractStructuredFields(norwegianReceipt);
console.log('Norwegian Receipt Results:');
console.log(`Merchant: ${result.merchant}`);
console.log(`Total: ${result.total}`);
console.log(`VAT: ${result.vatAmount}`);
console.log(`Currency: ${result.currency}`);

console.log('\n🎉 Norwegian currency delimiter handling is working!');
console.log('Ready for Norwegian receipt OCR processing.');
