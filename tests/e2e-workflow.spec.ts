import { test, expect } from '@playwright/test';
import { createBasicBudgetSetup, addTestExpense, clearAppData } from './test-utils';

test.describe('Money Flow Visualizer - End-to-End Workflow', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await clearAppData(page);
    });

    test('should complete full budget planning and expense tracking workflow', async ({ page }) => {
        // Step 1: Create budget structure
        await createBasicBudgetSetup(page);

        // Verify budget totals
        await expect(page.locator('text=Total Sources: kr 45.000,00')).toBeVisible();
        await expect(page.locator('text=Total Drains: kr 19.000,00')).toBeVisible();
        await expect(page.locator('text=Remaining: kr 26.000,00')).toBeVisible();

        // Step 2: Switch to table view and verify calculations
        await page.click('button:has-text("Planned Table")');

        // Verify sources table
        await expect(page.locator('text=Test Salary')).toBeVisible();
        await expect(page.locator('text=kr 540.000,00')).toBeVisible(); // Yearly: 45000 * 12

        // Verify drains table
        await expect(page.locator('text=Rent')).toBeVisible();
        await expect(page.locator('text=Groceries')).toBeVisible();

        // Step 3: Add expenses and track against budget
        await page.click('button:has-text("Expenses")');

        // Add groceries expense
        await addTestExpense(page, 'Weekly Groceries', '850');

        // Manually categorize to Groceries (assuming it's node_3)
        const categorySelect = page.locator('select').last();
        await categorySelect.selectOption({ label: 'Groceries' });

        // Add rent expense
        await addTestExpense(page, 'Monthly Rent', '15000');

        // Categorize to Rent
        const categorySelect2 = page.locator('select').last();
        await categorySelect2.selectOption({ label: 'Rent' });

        // Step 4: Verify variance report
        await expect(page.locator('text=Planned vs Actual')).toBeVisible();

        // Should show actual expenses vs planned
        await expect(page.locator('text=kr 850,00')).toBeVisible(); // Groceries actual
        await expect(page.locator('text=kr 15.000,00')).toBeVisible(); // Rent actual

        // Step 5: Export complete data
        const downloadPromise = page.waitForEvent('download');
        await page.click('button:has-text("📦 Export All (JSON)")');
        const download = await downloadPromise;

        expect(download.suggestedFilename()).toMatch(/^money-flow-backup-\d{4}-\d{2}-\d{2}\.json$/);

        // Step 6: Clear all data
        page.on('dialog', async dialog => {
            await dialog.accept();
        });

        await page.click('button:has-text("Clear All")');

        // Verify data is cleared
        await expect(page.locator('text=Total Sources: kr 0,00')).toBeVisible();
        await expect(page.locator('text=Total Drains: kr 0,00')).toBeVisible();

        // Step 7: Verify expenses persist (they shouldn't be cleared by "Clear All")
        await page.click('button:has-text("Expenses")');
        await expect(page.locator('text=Weekly Groceries')).toBeVisible();
        await expect(page.locator('text=Monthly Rent')).toBeVisible();
    });

    test('should handle complex percentage-based budget with multiple sources', async ({ page }) => {
        // Create multiple income sources
        await page.fill('input[placeholder="Source label"]', 'Primary Job');
        await page.fill('input[placeholder="Amount (kr)"]', '40000');
        await page.click('button:has-text("+ Add Source")');

        await page.fill('input[placeholder="Source label"]', 'Freelance');
        await page.fill('input[placeholder="Amount (kr)"]', '10000');
        await page.click('button:has-text("+ Add Source")');

        await page.fill('input[placeholder="Source label"]', 'Investments');
        await page.fill('input[placeholder="Amount (kr)"]', '5000');
        await page.click('button:has-text("+ Add Source")');

        // Total should be 55000
        await expect(page.locator('text=Total Sources: kr 55.000,00')).toBeVisible();

        // Add percentage-based expenses
        await page.fill('input[placeholder="Drain label"]', 'Emergency Fund');
        await page.selectOption('select', { value: 'percent' });
        await page.fill('input[placeholder="Percent"]', '20');
        await page.click('button:has-text("- Add Drain")');

        await page.fill('input[placeholder="Drain label"]', 'Investment Savings');
        await page.selectOption('select', { value: 'percent' });
        await page.fill('input[placeholder="Percent"]', '15');
        await page.click('button:has-text("- Add Drain")');

        // Add fixed expenses
        await page.fill('input[placeholder="Drain label"]', 'Housing');
        await page.selectOption('select', { value: 'amount' });
        await page.fill('input[placeholder="Amount (kr)"]:nth-of-type(2)', '18000');
        await page.click('button:has-text("- Add Drain")');

        // Calculate expected totals
        // 20% of 55000 = 11000
        // 15% of 55000 = 8250
        // Fixed: 18000
        // Total drains: 11000 + 8250 + 18000 = 37250
        // Remaining: 55000 - 37250 = 17750

        await expect(page.locator('text=Total Drains: kr 37.250,00')).toBeVisible();
        await expect(page.locator('text=Remaining: kr 17.750,00')).toBeVisible();

        // Verify in table view
        await page.click('button:has-text("Planned Table")');

        // Should show computed values for percentage drains
        await expect(page.locator('text=kr 11.000,00')).toBeVisible(); // 20% computed
        await expect(page.locator('text=kr 8.250,00')).toBeVisible(); // 15% computed
    });

    test('should persist complete workflow across browser sessions', async ({ page }) => {
        // Create a complete budget setup
        await createBasicBudgetSetup(page);

        // Add some expenses
        await addTestExpense(page, 'Session Test Expense', '500');

        // Verify initial state
        await expect(page.locator('text=Total Sources: kr 45.000,00')).toBeVisible();
        await expect(page.locator('text=Session Test Expense')).toBeVisible();

        // Simulate browser restart by clearing page context and reloading
        await page.context().clearCookies();
        await page.reload();

        // Verify data persisted
        await expect(page.locator('text=Total Sources: kr 45.000,00')).toBeVisible();
        await expect(page.locator('text=Test Salary')).toBeVisible();

        // Check expenses view
        await page.click('button:has-text("Expenses")');
        await expect(page.locator('text=Session Test Expense')).toBeVisible();

        // Check table view
        await page.click('button:has-text("Planned Table")');
        await expect(page.locator('text=Rent')).toBeVisible();
        await expect(page.locator('text=Groceries')).toBeVisible();
    });

    test('should handle edge cases and error conditions gracefully', async ({ page }) => {
        // Test with zero amounts
        await page.fill('input[placeholder="Source label"]', 'Zero Source');
        await page.fill('input[placeholder="Amount (kr)"]', '0');
        await page.click('button:has-text("+ Add Source")');

        await expect(page.locator('text=Total Sources: kr 0,00')).toBeVisible();

        // Test with negative amounts (should be handled gracefully)
        await page.fill('input[placeholder="Drain label"]', 'Test Drain');
        await page.fill('input[placeholder="Amount (kr)"]:nth-of-type(2)', '-100');
        await page.click('button:has-text("- Add Drain")');

        // App should handle this without breaking
        await expect(page.locator('text=Test Drain')).toBeVisible();

        // Test with very large numbers
        await page.fill('input[placeholder="Source label"]', 'Large Source');
        await page.fill('input[placeholder="Amount (kr)"]', '999999999');
        await page.click('button:has-text("+ Add Source")');

        // Should display properly formatted
        await expect(page.locator('text=kr 999.999.999,00')).toBeVisible();

        // Test percentage drain with invalid percentage
        await page.fill('input[placeholder="Drain label"]', 'Invalid Percent');
        await page.selectOption('select', { value: 'percent' });
        await page.fill('input[placeholder="Percent"]', '150'); // Over 100%
        await page.click('button:has-text("- Add Drain")');

        // Should still work (might show warning or handle gracefully)
        await expect(page.locator('text=Invalid Percent')).toBeVisible();
    });

    test('should maintain responsive layout on different screen sizes', async ({ page }) => {
        await createBasicBudgetSetup(page);

        // Test mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });

        // Main controls should still be visible and usable
        await expect(page.locator('text=Money Flow Builder')).toBeVisible();
        await expect(page.locator('button:has-text("Graph")')).toBeVisible();

        // Test tablet viewport
        await page.setViewportSize({ width: 768, height: 1024 });

        // Table view should be readable
        await page.click('button:has-text("Planned Table")');
        await expect(page.locator('text=Sources')).toBeVisible();
        await expect(page.locator('text=Drains')).toBeVisible();

        // Test desktop viewport
        await page.setViewportSize({ width: 1920, height: 1080 });

        // Everything should be well-spaced
        await page.click('button:has-text("Graph")');
        await expect(page.locator('[data-id="total-node"]')).toBeVisible();
        await expect(page.locator('[data-id="remaining-node"]')).toBeVisible();
    });
});
