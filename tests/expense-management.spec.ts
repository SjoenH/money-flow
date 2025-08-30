import { test, expect } from '@playwright/test';

test.describe('Money Flow Visualizer - Expense Management', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    
    // Set up some basic budget structure for expense categorization
    await page.fill('input[placeholder="Source label"]', 'Monthly Salary');
    await page.fill('input[placeholder="Amount (kr)"]', '45000');
    await page.click('button:has-text("+ Add Source")');
    
    await page.fill('input[placeholder="Drain label"]', 'Groceries');
    await page.fill('input[placeholder="Amount (kr)"]:nth-of-type(2)', '4000');
    await page.click('button:has-text("- Add Drain")');
    
    await page.fill('input[placeholder="Drain label"]', 'Transport');
    await page.fill('input[placeholder="Amount (kr)"]:nth-of-type(2)', '2000');
    await page.click('button:has-text("- Add Drain")');
  });

  test('should add manual expenses', async ({ page }) => {
    // Switch to expenses view
    await page.click('button:has-text("Expenses")');
    
    // Add an expense
    await page.fill('input[placeholder="Grocery store"]', 'Weekly Shopping');
    await page.fill('input[placeholder*="Amount"]', '856.50');
    await page.click('button:has-text("+ Add Expense")');
    
    // Verify expense appears in table
    await expect(page.locator('text=Weekly Shopping')).toBeVisible();
    await expect(page.locator('text=kr 856,50')).toBeVisible();
    
    // Check total is updated
    await expect(page.locator('text=Total: kr 856,50')).toBeVisible();
  });

  test('should categorize expenses automatically', async ({ page }) => {
    await page.click('button:has-text("Expenses")');
    
    // Add expense with keyword that should match "Groceries" category
    await page.fill('input[placeholder="Grocery store"]', 'REMA 1000 grocery shopping');
    await page.fill('input[placeholder*="Amount"]', '500');
    await page.click('button:has-text("+ Add Expense")');
    
    // Wait for categorization to complete
    await page.waitForTimeout(1000);
    
    // Verify it's categorized correctly
    const categorySelect = page.locator('select').last();
    await expect(categorySelect).toHaveValue('node_2'); // Should match Groceries drain node
  });

  test('should handle expense date selection', async ({ page }) => {
    await page.click('button:has-text("Expenses")');
    
    // Change date
    await page.fill('input[type="date"]', '2024-02-15');
    
    // Add expense
    await page.fill('input[placeholder="Grocery store"]', 'Date Test Expense');
    await page.fill('input[placeholder*="Amount"]', '200');
    await page.click('button:has-text("+ Add Expense")');
    
    // Verify date is set correctly
    await expect(page.locator('text=2024-02-15')).toBeVisible();
  });

  test('should allow manual category assignment', async ({ page }) => {
    await page.click('button:has-text("Expenses")');
    
    // Add an expense
    await page.fill('input[placeholder="Grocery store"]', 'Fuel Purchase');
    await page.fill('input[placeholder*="Amount"]', '750');
    await page.click('button:has-text("+ Add Expense")');
    
    // Manually assign to Transport category
    const categorySelect = page.locator('select').last();
    await categorySelect.selectOption('node_3'); // Transport drain node
    
    // Verify selection
    await expect(categorySelect).toHaveValue('node_3');
  });

  test('should delete expenses', async ({ page }) => {
    await page.click('button:has-text("Expenses")');
    
    // Add an expense
    await page.fill('input[placeholder="Grocery store"]', 'To Be Deleted');
    await page.fill('input[placeholder*="Amount"]', '100');
    await page.click('button:has-text("+ Add Expense")');
    
    // Verify it's added
    await expect(page.locator('text=To Be Deleted')).toBeVisible();
    
    // Delete it
    await page.click('button:has-text("Delete")');
    
    // Verify it's removed
    await expect(page.locator('text=To Be Deleted')).not.toBeVisible();
  });

  test('should switch between monthly and weekly views', async ({ page }) => {
    await page.click('button:has-text("Expenses")');
    
    // Add an expense
    await page.fill('input[placeholder="Grocery store"]', 'Period Test');
    await page.fill('input[placeholder*="Amount"]', '300');
    await page.click('button:has-text("+ Add Expense")');
    
    // Default should be monthly
    await expect(page.locator('select[value="month"]')).toBeVisible();
    
    // Switch to weekly
    await page.selectOption('select', { value: 'week' });
    
    // Verify weekly view is active
    await expect(page.locator('select[value="week"]')).toBeVisible();
    
    // Expense should still be visible (assuming it's in current week)
    await expect(page.locator('text=Period Test')).toBeVisible();
  });

  test('should show planned vs actual variance', async ({ page }) => {
    await page.click('button:has-text("Expenses")');
    
    // Add expenses in the Groceries category
    await page.fill('input[placeholder="Grocery store"]', 'Grocery Store 1');
    await page.fill('input[placeholder*="Amount"]', '2000');
    await page.click('button:has-text("+ Add Expense")');
    
    // Manually assign to Groceries category if not auto-assigned
    const categorySelect = page.locator('select').last();
    await categorySelect.selectOption('node_2'); // Groceries
    
    await page.fill('input[placeholder="Grocery store"]', 'Grocery Store 2');
    await page.fill('input[placeholder*="Amount"]', '1500');
    await page.click('button:has-text("+ Add Expense")');
    
    // Assign to Groceries as well
    const categorySelect2 = page.locator('select').last();
    await categorySelect2.selectOption('node_2'); // Groceries
    
    // Check variance report
    await expect(page.locator('text=Planned vs Actual')).toBeVisible();
    
    // Should show planned (4000) vs actual (3500) = variance +500
    await expect(page.locator('text=kr 4.000,00')).toBeVisible(); // Planned
    await expect(page.locator('text=kr 3.500,00')).toBeVisible(); // Actual
  });

  test('should persist expenses in localStorage', async ({ page }) => {
    await page.click('button:has-text("Expenses")');
    
    // Add an expense
    await page.fill('input[placeholder="Grocery store"]', 'Persistence Test');
    await page.fill('input[placeholder*="Amount"]', '999');
    await page.click('button:has-text("+ Add Expense")');
    
    // Refresh page
    await page.reload();
    
    // Go back to expenses view
    await page.click('button:has-text("Expenses")');
    
    // Verify expense persisted
    await expect(page.locator('text=Persistence Test')).toBeVisible();
    await expect(page.locator('text=kr 999,00')).toBeVisible();
  });

  test('should handle file upload for receipt processing', async ({ page }) => {
    await page.click('button:has-text("Expenses")');
    
    // Create a sample text file to simulate receipt upload
    const receiptText = "REMA 1000\nBread 25.00\nMilk 18.50\nTotal: 43.50";
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles({
      name: 'receipt.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from(receiptText)
    });
    
    // Since fields are empty, this should trigger auto-import
    await page.waitForTimeout(2000); // Wait for processing
    
    // Check if expense was auto-created (description might be file name or extracted merchant)
    await expect(page.locator('text=REMA 1000').or(page.locator('text=receipt'))).toBeVisible();
  });

  test('should configure OCR language settings', async ({ page }) => {
    await page.click('button:has-text("Expenses")');
    
    // Check default OCR language
    await expect(page.locator('select[value="nor+eng"]')).toBeVisible();
    
    // Change to Norwegian only
    await page.selectOption('select', { value: 'nor' });
    await expect(page.locator('select[value="nor"]')).toBeVisible();
    
    // Change to English only
    await page.selectOption('select', { value: 'eng' });
    await expect(page.locator('select[value="eng"]')).toBeVisible();
  });

  test('should toggle structured parsing', async ({ page }) => {
    await page.click('button:has-text("Expenses")');
    
    // Find structured parsing checkbox
    const structuredParsingCheckbox = page.locator('input[type="checkbox"]');
    
    // Should be enabled by default
    await expect(structuredParsingCheckbox).toBeChecked();
    
    // Disable it
    await structuredParsingCheckbox.uncheck();
    await expect(structuredParsingCheckbox).not.toBeChecked();
    
    // Re-enable it
    await structuredParsingCheckbox.check();
    await expect(structuredParsingCheckbox).toBeChecked();
  });
});
