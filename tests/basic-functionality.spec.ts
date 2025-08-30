import { test, expect } from '@playwright/test';

test.describe('Money Flow Visualizer - Basic Functionality', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  });

  test('should load the application successfully', async ({ page }) => {
    await page.goto('/');
    
    // Check if main title is present
    await expect(page.locator('text=Money Flow Builder')).toBeVisible();
    
    // Check if main controls are present
    await expect(page.locator('input[placeholder="Source label"]')).toBeVisible();
    await expect(page.locator('input[placeholder="Drain label"]')).toBeVisible();
    await expect(page.locator('button:has-text("+ Add Source")')).toBeVisible();
    await expect(page.locator('button:has-text("- Add Drain")')).toBeVisible();
  });

  test('should create and display source nodes', async ({ page }) => {
    await page.goto('/');
    
    // Add a source
    await page.fill('input[placeholder="Source label"]', 'Test Salary');
    await page.fill('input[placeholder="Amount (kr)"]', '50000');
    await page.click('button:has-text("+ Add Source")');
    
    // Check if source appears in overview
    await expect(page.locator('text=Total Sources: kr 50.000,00')).toBeVisible();
    
    // Check if it appears in the graph (ReactFlow node)
    await expect(page.locator('[data-id="node_0"]')).toBeVisible();
    await expect(page.locator('text=Test Salary')).toBeVisible();
  });

  test('should create and display drain nodes', async ({ page }) => {
    await page.goto('/');
    
    // First add a source so we have income
    await page.fill('input[placeholder="Source label"]', 'Salary');
    await page.fill('input[placeholder="Amount (kr)"]', '40000');
    await page.click('button:has-text("+ Add Source")');
    
    // Add a drain
    await page.fill('input[placeholder="Drain label"]', 'Rent');
    await page.fill('input[placeholder="Amount (kr)"]:nth-of-type(2)', '12000');
    await page.click('button:has-text("- Add Drain")');
    
    // Check if drain appears in overview
    await expect(page.locator('text=Total Drains: kr 12.000,00')).toBeVisible();
    await expect(page.locator('text=Remaining: kr 28.000,00')).toBeVisible();
  });

  test('should create percentage-based drains', async ({ page }) => {
    await page.goto('/');
    
    // Add a source
    await page.fill('input[placeholder="Source label"]', 'Salary');
    await page.fill('input[placeholder="Amount (kr)"]', '50000');
    await page.click('button:has-text("+ Add Source")');
    
    // Add a percentage drain
    await page.fill('input[placeholder="Drain label"]', 'Savings');
    await page.selectOption('select', { value: 'percent' });
    await page.fill('input[placeholder="Percent"]', '20');
    await page.click('button:has-text("- Add Drain")');
    
    // Check if percentage calculation works (20% of 50000 = 10000)
    await expect(page.locator('text=Total Drains: kr 10.000,00')).toBeVisible();
    await expect(page.locator('text=Remaining: kr 40.000,00')).toBeVisible();
  });

  test('should switch between graph, table, and expenses views', async ({ page }) => {
    await page.goto('/');
    
    // Test Graph view (default)
    await expect(page.locator('button:has-text("Graph")')).toHaveAttribute('disabled', '');
    
    // Switch to Planned Table view
    await page.click('button:has-text("Planned Table")');
    await expect(page.locator('button:has-text("Planned Table")')).toHaveAttribute('disabled', '');
    await expect(page.locator('text=Sources')).toBeVisible();
    await expect(page.locator('text=Drains')).toBeVisible();
    
    // Switch to Expenses view
    await page.click('button:has-text("Expenses")');
    await expect(page.locator('button:has-text("Expenses")')).toHaveAttribute('disabled', '');
    await expect(page.locator('text=Description')).toBeVisible();
    await expect(page.locator('input[placeholder="Grocery store"]')).toBeVisible();
  });

  test('should clear all nodes when requested', async ({ page }) => {
    await page.goto('/');
    
    // Add some nodes first
    await page.fill('input[placeholder="Source label"]', 'Salary');
    await page.fill('input[placeholder="Amount (kr)"]', '50000');
    await page.click('button:has-text("+ Add Source")');
    
    await page.fill('input[placeholder="Drain label"]', 'Rent');
    await page.fill('input[placeholder="Amount (kr)"]:nth-of-type(2)', '12000');
    await page.click('button:has-text("- Add Drain")');
    
    // Verify nodes exist
    await expect(page.locator('text=Total Sources: kr 50.000,00')).toBeVisible();
    await expect(page.locator('text=Total Drains: kr 12.000,00')).toBeVisible();
    
    // Clear all nodes (handle confirmation dialog)
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('Are you sure you want to clear all sources and drains?');
      await dialog.accept();
    });
    
    await page.click('button:has-text("Clear All")');
    
    // Verify nodes are cleared
    await expect(page.locator('text=Total Sources: kr 0,00')).toBeVisible();
    await expect(page.locator('text=Total Drains: kr 0,00')).toBeVisible();
  });

  test('should persist data in localStorage', async ({ page }) => {
    await page.goto('/');
    
    // Add a source
    await page.fill('input[placeholder="Source label"]', 'Test Income');
    await page.fill('input[placeholder="Amount (kr)"]', '30000');
    await page.click('button:has-text("+ Add Source")');
    
    // Refresh page and verify data persists
    await page.reload();
    
    await expect(page.locator('text=Total Sources: kr 30.000,00')).toBeVisible();
    await expect(page.locator('text=Test Income')).toBeVisible();
  });
});
