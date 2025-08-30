import { test, expect } from '@playwright/test';

test.describe('Money Flow Visualizer - Graph Interactions', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
  });

  test('should display ReactFlow graph with system nodes', async ({ page }) => {
    await page.goto('/');
    
    // Check that system nodes are present
    await expect(page.locator('[data-id="total-node"]')).toBeVisible();
    await expect(page.locator('[data-id="remaining-node"]')).toBeVisible();
    await expect(page.locator('text=Total Sources')).toBeVisible();
    await expect(page.locator('text=Remaining')).toBeVisible();
  });

  test('should create and connect nodes in graph', async ({ page }) => {
    await page.goto('/');
    
    // Add a source node
    await page.fill('input[placeholder="Source label"]', 'Salary');
    await page.fill('input[placeholder="Amount (kr)"]', '50000');
    await page.click('button:has-text("+ Add Source")');
    
    // Verify source node appears
    await expect(page.locator('[data-id="node_0"]')).toBeVisible();
    await expect(page.locator('text=Salary')).toBeVisible();
    
    // Add a drain node  
    await page.fill('input[placeholder="Drain label"]', 'Rent');
    await page.fill('input[placeholder="Amount (kr)"]:nth-of-type(2)', '15000');
    await page.click('button:has-text("- Add Drain")');
    
    // Verify drain node appears
    await expect(page.locator('[data-id="node_1"]')).toBeVisible();
    await expect(page.locator('text=Rent')).toBeVisible();
    
    // Check that edges are created automatically (at least 3: source->total, total->drain, total->remaining)
    const edgeCount = await page.locator('.react-flow__edge').count();
    expect(edgeCount).toBeGreaterThanOrEqual(3);
  });

  test('should allow inline editing of node labels', async ({ page }) => {
    await page.goto('/');
    
    // Add a source node
    await page.fill('input[placeholder="Source label"]', 'Original Label');
    await page.fill('input[placeholder="Amount (kr)"]', '30000');
    await page.click('button:has-text("+ Add Source")');
    
    // Double-click on the label to edit (this triggers the inline edit)
    await page.dblclick('[data-id="node_0"] text=Original Label');
    
    // Should now have an input field
    await expect(page.locator('[data-id="node_0"] input')).toBeVisible();
    
    // Edit the label
    await page.fill('[data-id="node_0"] input', 'Edited Label');
    await page.press('[data-id="node_0"] input', 'Enter');
    
    // Verify label was updated
    await expect(page.locator('text=Edited Label')).toBeVisible();
    await expect(page.locator('text=Original Label')).not.toBeVisible();
  });

  test('should allow inline editing of node amounts', async ({ page }) => {
    await page.goto('/');
    
    // Add a source node
    await page.fill('input[placeholder="Source label"]', 'Test Source');
    await page.fill('input[placeholder="Amount (kr)"]', '25000');
    await page.click('button:has-text("+ Add Source")');
    
    // Wait for node to appear and totals to update
    await expect(page.locator('text=Total Sources: kr 25.000,00')).toBeVisible();
    
    // Double-click on the amount to edit
    await page.dblclick('[data-id="node_0"] text=25.000,00');
    
    // Should now have an input field for amount
    await expect(page.locator('[data-id="node_0"] input[type="number"]')).toBeVisible();
    
    // Edit the amount
    await page.fill('[data-id="node_0"] input[type="number"]', '35000');
    await page.press('[data-id="node_0"] input[type="number"]', 'Enter');
    
    // Verify amount was updated and totals recalculated
    await expect(page.locator('text=35.000,00')).toBeVisible();
    await expect(page.locator('text=Total Sources: kr 35.000,00')).toBeVisible();
  });

  test('should delete nodes from graph', async ({ page }) => {
    await page.goto('/');
    
    // Add a source node
    await page.fill('input[placeholder="Source label"]', 'To Delete');
    await page.fill('input[placeholder="Amount (kr)"]', '10000');
    await page.click('button:has-text("+ Add Source")');
    
    // Verify node exists
    await expect(page.locator('[data-id="node_0"]')).toBeVisible();
    await expect(page.locator('text=Total Sources: kr 10.000,00')).toBeVisible();
    
    // Handle confirmation dialog for delete
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('Are you sure you want to delete "To Delete"?');
      await dialog.accept();
    });
    
    // Click delete button on node
    await page.click('[data-id="node_0"] button[title="Delete node"]');
    
    // Verify node is deleted and totals updated
    await expect(page.locator('[data-id="node_0"]')).not.toBeVisible();
    await expect(page.locator('text=Total Sources: kr 0,00')).toBeVisible();
  });

  test('should not allow deletion of system nodes', async ({ page }) => {
    await page.goto('/');
    
    // System nodes should not have delete buttons or they should be disabled
    // Total node should not be deletable
    await expect(page.locator('[data-id="total-node"] button[title="Delete node"]')).not.toBeVisible();
    
    // Remaining node should not be deletable  
    await expect(page.locator('[data-id="remaining-node"] button[title="Delete node"]')).not.toBeVisible();
  });

  test('should update total calculations in real-time', async ({ page }) => {
    await page.goto('/');
    
    // Initially should show 0
    await expect(page.locator('text=Total Sources: kr 0,00')).toBeVisible();
    await expect(page.locator('text=Total Drains: kr 0,00')).toBeVisible();
    await expect(page.locator('text=Remaining: kr 0,00')).toBeVisible();
    
    // Add source
    await page.fill('input[placeholder="Source label"]', 'Income');
    await page.fill('input[placeholder="Amount (kr)"]', '40000');
    await page.click('button:has-text("+ Add Source")');
    
    // Check totals update
    await expect(page.locator('text=Total Sources: kr 40.000,00')).toBeVisible();
    await expect(page.locator('text=Remaining: kr 40.000,00')).toBeVisible();
    
    // Add drain
    await page.fill('input[placeholder="Drain label"]', 'Expense');
    await page.fill('input[placeholder="Amount (kr)"]:nth-of-type(2)', '12000');
    await page.click('button:has-text("- Add Drain")');
    
    // Check totals update again
    await expect(page.locator('text=Total Drains: kr 12.000,00')).toBeVisible();
    await expect(page.locator('text=Remaining: kr 28.000,00')).toBeVisible();
  });

  test('should handle percentage-based drains with dynamic calculation', async ({ page }) => {
    await page.goto('/');
    
    // Add source
    await page.fill('input[placeholder="Source label"]', 'Salary');
    await page.fill('input[placeholder="Amount (kr)"]', '50000');
    await page.click('button:has-text("+ Add Source")');
    
    // Add percentage drain
    await page.fill('input[placeholder="Drain label"]', 'Savings');
    await page.selectOption('select', { value: 'percent' });
    await page.fill('input[placeholder="Percent"]', '15');
    await page.click('button:has-text("- Add Drain")');
    
    // Verify percentage calculation (15% of 50000 = 7500)
    await expect(page.locator('text=Total Drains: kr 7.500,00')).toBeVisible();
    await expect(page.locator('text=Remaining: kr 42.500,00')).toBeVisible();
    
    // Verify the node shows percentage
    await expect(page.locator('[data-id="node_1"] text=15%')).toBeVisible();
  });

  test('should allow drag and drop of nodes', async ({ page }) => {
    await page.goto('/');
    
    // Add a node
    await page.fill('input[placeholder="Source label"]', 'Draggable');
    await page.fill('input[placeholder="Amount (kr)"]', '20000');
    await page.click('button:has-text("+ Add Source")');
    
    // Get initial position
    const node = page.locator('[data-id="node_0"]');
    const initialBox = await node.boundingBox();
    
    // Drag the node to a new position
    await node.dragTo(node, {
      targetPosition: { x: 100, y: 100 }
    });
    
    // Get new position (should be different)
    const newBox = await node.boundingBox();
    
    // Position should have changed (allowing for some tolerance)
    expect(Math.abs((newBox?.x || 0) - (initialBox?.x || 0))).toBeGreaterThan(10);
  });

  test('should show ReactFlow controls', async ({ page }) => {
    await page.goto('/');
    
    // ReactFlow should show controls panel
    await expect(page.locator('.react-flow__controls')).toBeVisible();
    
    // Should have zoom in, zoom out, fit view, etc. (at least 3 buttons)
    const controlButtonCount = await page.locator('.react-flow__controls button').count();
    expect(controlButtonCount).toBeGreaterThanOrEqual(3);
  });

  test('should display background pattern', async ({ page }) => {
    await page.goto('/');
    
    // ReactFlow background should be visible
    await expect(page.locator('.react-flow__background')).toBeVisible();
  });

  test('should maintain node positions after page reload', async ({ page }) => {
    await page.goto('/');
    
    // Add and position a node
    await page.fill('input[placeholder="Source label"]', 'Position Test');
    await page.fill('input[placeholder="Amount (kr)"]', '15000');
    await page.click('button:has-text("+ Add Source")');
    
    // Wait for node to be created
    await expect(page.locator('[data-id="node_0"]')).toBeVisible();
    
    // Get position
    const node = page.locator('[data-id="node_0"]');
    const initialBox = await node.boundingBox();
    
    // Reload page
    await page.reload();
    
    // Node should still be there with same position (approximately)
    await expect(page.locator('[data-id="node_0"]')).toBeVisible();
    const newBox = await node.boundingBox();
    
    // Position should be preserved (with some tolerance for rendering differences)
    expect(Math.abs((newBox?.x || 0) - (initialBox?.x || 0))).toBeLessThan(50);
    expect(Math.abs((newBox?.y || 0) - (initialBox?.y || 0))).toBeLessThan(50);
  });
});
