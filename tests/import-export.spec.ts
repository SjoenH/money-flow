import { test, expect } from '@playwright/test';

test.describe('Money Flow Visualizer - Import/Export Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  });

  test('should export complete app data as JSON', async ({ page }) => {
    await page.goto('/');
    
    // Create some test data
    await page.fill('input[placeholder="Source label"]', 'Test Salary');
    await page.fill('input[placeholder="Amount (kr)"]', '45000');
    await page.click('button:has-text("+ Add Source")');
    
    await page.fill('input[placeholder="Drain label"]', 'Rent');
    await page.fill('input[placeholder="Amount (kr)"]:nth-of-type(2)', '15000');
    await page.click('button:has-text("- Add Drain")');
    
    // Set up download listener
    const downloadPromise = page.waitForEvent('download');
    
    // Click export button
    await page.click('button:has-text("Export All")');
    
    // Wait for download
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^money-flow-backup-\d{4}-\d{2}-\d{2}\.json$/);
    
    // Save and verify download content
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
  });

  test('should export budget-only data from table view', async ({ page }) => {
    await page.goto('/');
    
    // Create test data
    await page.fill('input[placeholder="Source label"]', 'Salary');
    await page.fill('input[placeholder="Amount (kr)"]', '50000');
    await page.click('button:has-text("+ Add Source")');
    
    await page.fill('input[placeholder="Drain label"]', 'Housing');
    await page.fill('input[placeholder="Amount (kr)"]:nth-of-type(2)', '20000');
    await page.click('button:has-text("- Add Drain")');
    
    // Switch to table view
    await page.click('button:has-text("Planned Table")');
    
    // Set up download listener
    const downloadPromise = page.waitForEvent('download');
    
    // Click budget export button
    await page.click('button:has-text("💰 Export Budget Only")');
    
    // Wait for download
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^money-flow-budget-\d{4}-\d{2}-\d{2}\.json$/);
  });

  test('should export expenses as CSV', async ({ page }) => {
    await page.goto('/');
    
    // Switch to expenses view
    await page.click('button:has-text("Expenses")');
    
    // Add a test expense
    await page.fill('input[placeholder="Grocery store"]', 'Test Expense');
    await page.fill('input[placeholder*="Amount"]', '150');
    await page.click('button:has-text("+ Add Expense")');
    
    // Set up download listener
    const downloadPromise = page.waitForEvent('download');
    
    // Click CSV export button
    await page.click('button:has-text("📊 Export Expenses (CSV)")');
    
    // Wait for download
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^money-flow-expenses-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  test('should import complete app data from JSON', async ({ page }) => {
    await page.goto('/');
    
    // Create sample JSON data
    const sampleData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      data: {
        nodes: [
          {
            id: 'node_0',
            type: 'source',
            position: { x: 50, y: 50 },
            data: { label: 'Imported Salary', amount: '60000' }
          },
          {
            id: 'node_1', 
            type: 'drain',
            position: { x: 50, y: 400 },
            data: { label: 'Imported Rent', amount: '18000', drainType: 'amount' }
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
            id: 'exp_test',
            date: '2024-01-15',
            description: 'Imported Expense',
            amount: 299.50,
            drainNodeId: 'node_1'
          }
        ]
      }
    };
    
    // Create a temporary file for import
    const jsonContent = JSON.stringify(sampleData, null, 2);
    
    // Handle the file input using setInputFiles
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('label[for="import-json-main"]');
    const fileChooser = await fileChooserPromise;
    
    // Create a temporary file
    await fileChooser.setFiles({
      name: 'test-import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(jsonContent)
    });
    
    // Handle confirmation dialog
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('Import data from');
      await dialog.accept();
    });
    
    // Wait for import to complete and verify
    await expect(page.locator('text=Total Sources: kr 60.000,00')).toBeVisible();
    await expect(page.locator('text=Total Drains: kr 18.000,00')).toBeVisible();
    await expect(page.locator('text=Remaining: kr 42.000,00')).toBeVisible();
    
    // Check that imported data is visible
    await expect(page.locator('text=Imported Salary')).toBeVisible();
    await expect(page.locator('text=Imported Rent')).toBeVisible();
  });

  test('should import expenses from CSV', async ({ page }) => {
    await page.goto('/');
    
    // First create a drain node for category matching
    await page.fill('input[placeholder="Drain label"]', 'Groceries');
    await page.fill('input[placeholder="Amount (kr)"]:nth-of-type(2)', '3000');
    await page.click('button:has-text("- Add Drain")');
    
    // Switch to expenses view
    await page.click('button:has-text("Expenses")');
    
    // Create CSV content
    const csvContent = `Date,Description,Amount (kr),Category,Merchant,VAT Amount,Currency,Notes,Has Line Items
2024-01-15,"Test Grocery Shopping",456.75,Groceries,"REMA 1000",91.35,NOK,"Weekly shopping",No
2024-01-16,"Coffee",89.00,,"Espresso House",,NOK,,No`;
    
    // Handle file input
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('label[for="import-csv"]');
    const fileChooser = await fileChooserPromise;
    
    await fileChooser.setFiles({
      name: 'test-expenses.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent)
    });
    
    // Handle confirmation dialog
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('Import 2 expenses from CSV?');
      await dialog.accept();
    });
    
    // Wait and verify expenses are imported
    await expect(page.locator('text=Test Grocery Shopping')).toBeVisible();
    await expect(page.locator('text=Coffee')).toBeVisible();
    await expect(page.locator('text=kr 456,75')).toBeVisible();
  });

  test('should handle invalid JSON import gracefully', async ({ page }) => {
    await page.goto('/');
    
    // Create invalid JSON
    const invalidJson = '{ invalid json content }';
    
    // Handle file input
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('label[for="import-json-main"]');
    const fileChooser = await fileChooserPromise;
    
    await fileChooser.setFiles({
      name: 'invalid.json',
      mimeType: 'application/json',
      buffer: Buffer.from(invalidJson)
    });
    
    // Handle error alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('Import failed:');
      await dialog.accept();
    });
    
    // Verify original state is preserved
    await expect(page.locator('text=Total Sources: kr 0,00')).toBeVisible();
    await expect(page.locator('text=Total Drains: kr 0,00')).toBeVisible();
  });

  test('should validate CSV format and show appropriate errors', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("Expenses")');
    
    // Create invalid CSV (empty)
    const emptyCsv = '';
    
    // Handle file input
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('label[for="import-csv"]');
    const fileChooser = await fileChooserPromise;
    
    await fileChooser.setFiles({
      name: 'empty.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(emptyCsv)
    });
    
    // Handle error alert
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('CSV file appears to be empty or invalid');
      await dialog.accept();
    });
  });

  test('should create backup before import operations', async ({ page }) => {
    await page.goto('/');
    
    // Create some initial data
    await page.fill('input[placeholder="Source label"]', 'Original Data');
    await page.fill('input[placeholder="Amount (kr)"]', '1000');
    await page.click('button:has-text("+ Add Source")');
    
    // Prepare import data
    const importData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      data: { nodes: [], edges: [], expenses: [] }
    };
    
    // Import new data
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('label[for="import-json-main"]');
    const fileChooser = await fileChooserPromise;
    
    await fileChooser.setFiles({
      name: 'import.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(importData))
    });
    
    // Accept import
    page.on('dialog', async dialog => {
      await dialog.accept();
    });
    
    // Verify backup was created in localStorage
    const backupExists = await page.evaluate(() => {
      const backup = localStorage.getItem('moneyflow-backup');
      return backup !== null;
    });
    
    expect(backupExists).toBe(true);
  });
});
