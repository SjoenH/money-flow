import { Page } from '@playwright/test';

/**
 * Test utilities for Money Flow Visualizer
 */

/**
 * Clear all localStorage data and reload page
 */
export async function clearAppData(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();
}

/**
 * Create a basic budget setup with sources and drains
 */
export async function createBasicBudgetSetup(page: Page) {
  // Add a source
  await page.fill('input[placeholder="Source label"]', 'Test Salary');
  await page.fill('input[placeholder="Amount (kr)"]', '45000');
  await page.click('button:has-text("+ Add Source")');
  
  // Add drains
  await page.fill('input[placeholder="Drain label"]', 'Rent');
  await page.fill('input[placeholder="Amount (kr)"]:nth-of-type(2)', '15000');
  await page.click('button:has-text("- Add Drain")');
  
  await page.fill('input[placeholder="Drain label"]', 'Groceries');
  await page.fill('input[placeholder="Amount (kr)"]:nth-of-type(2)', '4000');
  await page.click('button:has-text("- Add Drain")');
}

/**
 * Add a test expense in the expenses view
 */
export async function addTestExpense(page: Page, description: string, amount: string, date?: string) {
  // Ensure we're in expenses view
  await page.click('button:has-text("Expenses")');
  
  // Fill expense details
  await page.fill('input[placeholder="Grocery store"]', description);
  await page.fill('input[placeholder*="Amount"]', amount);
  
  if (date) {
    await page.fill('input[type="date"]', date);
  }
  
  await page.click('button:has-text("+ Add Expense")');
}

/**
 * Create sample JSON import data
 */
export function createSampleImportData() {
  return {
    version: '1.0.0',
    exportDate: new Date().toISOString(),
    data: {
      nodes: [
        {
          id: 'node_0',
          type: 'source',
          position: { x: 50, y: 50 },
          data: { label: 'Test Income', amount: '35000' }
        },
        {
          id: 'node_1',
          type: 'drain',
          position: { x: 50, y: 400 },
          data: { label: 'Test Expense', amount: '10000', drainType: 'amount' }
        }
      ],
      edges: [
        {
          id: 'edge-node_0-total-node',
          source: 'node_0',
          target: 'total-node',
          type: 'default'
        },
        {
          id: 'edge-total-node-node_1',
          source: 'total-node',
          target: 'node_1',
          type: 'default'
        }
      ],
      expenses: [
        {
          id: 'exp_test_1',
          date: new Date().toISOString().slice(0, 10),
          description: 'Test Expense Item',
          amount: 299.50,
          drainNodeId: 'node_1'
        }
      ]
    }
  };
}

/**
 * Create sample CSV content for expense import
 */
export function createSampleCSV() {
  return `Date,Description,Amount (kr),Category,Merchant,VAT Amount,Currency,Notes,Has Line Items
2024-01-15,"Test Grocery Shopping",456.75,Groceries,"Test Store",91.35,NOK,"Test purchase",No
2024-01-16,"Test Coffee Purchase",45.00,,"Coffee Shop",,NOK,"Morning coffee",No`;
}

/**
 * Wait for file download and verify filename pattern
 */
export async function waitForDownload(page: Page, expectedPattern: RegExp) {
  const downloadPromise = page.waitForEvent('download');
  const download = await downloadPromise;
  
  const filename = download.suggestedFilename();
  if (!expectedPattern.test(filename)) {
    throw new Error(`Downloaded filename "${filename}" does not match pattern ${expectedPattern}`);
  }
  
  return download;
}

/**
 * Handle file upload with content
 */
export async function uploadFile(page: Page, selector: string, filename: string, content: string, mimeType: string) {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.click(selector);
  const fileChooser = await fileChooserPromise;
  
  await fileChooser.setFiles({
    name: filename,
    mimeType: mimeType,
    buffer: Buffer.from(content)
  });
}

/**
 * Accept confirmation dialog with expected message
 */
export function setupDialogHandler(page: Page, expectedMessage: string) {
  page.on('dialog', async dialog => {
    if (dialog.message().includes(expectedMessage)) {
      await dialog.accept();
    } else {
      throw new Error(`Unexpected dialog message: ${dialog.message()}`);
    }
  });
}

/**
 * Get localStorage data
 */
export async function getLocalStorageData(page: Page, key: string) {
  return await page.evaluate((storageKey) => {
    return localStorage.getItem(storageKey);
  }, key);
}

/**
 * Set localStorage data
 */
export async function setLocalStorageData(page: Page, key: string, value: string) {
  await page.evaluate(({ storageKey, storageValue }) => {
    localStorage.setItem(storageKey, storageValue);
  }, { storageKey: key, storageValue: value });
}
