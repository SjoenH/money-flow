# Testing Documentation

## 🧪 Test Suite

The Money Flow Visualizer includes comprehensive end-to-end tests using Playwright, covering all major functionality including the import/export features, budget planning, expense tracking, and graph interactions.

## 🚀 Running Tests

### Prerequisites

- Node.js ≥ 20.19 (for Vite 7)
- Playwright browsers installed

### Quick Start

```bash
# Run all tests
pnpm test

# Run tests in headed mode (see browser)
pnpm test:headed

# Run tests with UI mode (interactive)
pnpm test:ui

# Debug tests step by step
pnpm test:debug

# Show test report
pnpm test:report
```

### Test Configuration

Tests are configured in `playwright.config.ts` with:

- Automatic dev server startup
- Cross-browser testing (Chromium, Firefox, WebKit)
- Trace collection on failures
- HTML reporting

## 📋 Test Coverage

### Core Functionality Tests (`basic-functionality.spec.ts`)

- ✅ Application loading and initialization
- ✅ Source and drain node creation
- ✅ Percentage-based drain calculations  
- ✅ View switching (Graph/Table/Expenses)
- ✅ Data persistence in localStorage
- ✅ Clear all functionality

### Import/Export Tests (`import-export.spec.ts`)

- ✅ JSON export (complete app backup)
- ✅ CSV export (expenses only)
- ✅ Budget-only JSON export
- ✅ JSON import with validation
- ✅ CSV import with category matching
- ✅ Error handling for invalid files
- ✅ Automatic backup creation before imports

### Expense Management Tests (`expense-management.spec.ts`)

- ✅ Manual expense entry
- ✅ Automatic categorization
- ✅ Category assignment and modification
- ✅ Expense deletion
- ✅ Monthly/weekly view switching
- ✅ Planned vs actual variance reporting
- ✅ File upload for receipt processing
- ✅ OCR language configuration
- ✅ Structured parsing toggle

### Graph Interactions Tests (`graph-interactions.spec.ts`)

- ✅ ReactFlow graph rendering
- ✅ Node creation and connections
- ✅ Inline editing (labels and amounts)
- ✅ Node deletion with confirmations
- ✅ Real-time calculation updates
- ✅ Drag and drop functionality
- ✅ Position persistence
- ✅ System node protection

### End-to-End Workflow Tests (`e2e-workflow.spec.ts`)

- ✅ Complete budget planning workflow
- ✅ Complex multi-source budgets
- ✅ Cross-session data persistence
- ✅ Edge case handling
- ✅ Responsive design validation

## 🛠 Test Utilities

The `test-utils.ts` file provides helper functions:

```typescript
// Clear app data
await clearAppData(page);

// Create basic budget setup
await createBasicBudgetSetup(page);

// Add test expenses
await addTestExpense(page, 'Test Expense', '299.50');

// Handle file uploads
await uploadFile(page, selector, 'test.json', content, 'application/json');

// Wait for downloads
await waitForDownload(page, /^money-flow-backup-\d{4}-\d{2}-\d{2}\.json$/);
```

## 📊 Test Data

Sample test data files are provided:

- `sample-expenses.csv` - Example expense data for import testing
- `sample-backup.json` - Complete app backup for import testing

## 🐛 Debugging Tests

### Debug Specific Test

```bash
npx playwright test expense-management.spec.ts --debug
```

### Run Single Test File

```bash
npx playwright test basic-functionality.spec.ts
```

### Run Specific Test

```bash
npx playwright test -g "should export complete app data"
```

### View Test Reports

```bash
pnpm test:report
```

## 🔧 CI/CD Integration

Tests are configured for CI environments:

- Retry failed tests 2x on CI
- Single worker in CI for stability
- HTML reports generated
- Traces collected on failures

### GitHub Actions Example

```yaml
- name: Install dependencies
  run: pnpm install

- name: Install Playwright Browsers
  run: npx playwright install --with-deps

- name: Run Playwright tests
  run: pnpm test

- name: Upload test results
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: playwright-report
    path: playwright-report/
```

## 🎯 Test Best Practices

### Data Isolation

Each test starts with a clean state using `clearAppData()` to prevent test interference.

### Realistic User Interactions

Tests simulate real user workflows including:

- Form submissions
- File uploads/downloads
- Confirmation dialogs
- Multi-step processes

### Error Scenarios

Tests cover error conditions:

- Invalid file formats
- Network failures
- Edge cases (zero/negative values)
- Malformed data

### Cross-Browser Testing

All tests run across major browsers to ensure compatibility.

## 📈 Continuous Improvement

### Adding New Tests

1. Create test file: `tests/feature-name.spec.ts`
2. Import utilities: `import { ... } from './test-utils'`
3. Follow existing patterns for consistency
4. Add to CI pipeline

### Test Maintenance

- Update tests when features change
- Add new test cases for bug fixes
- Keep test data current
- Monitor test execution times

The test suite provides comprehensive coverage ensuring the Money Flow Visualizer works reliably across different environments and use cases.
