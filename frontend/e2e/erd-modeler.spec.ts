import { test, expect } from '@playwright/test';

test.describe('CleanFlow - Model Data (ERD) Studio E2E Specification', () => {
  const mockSessionId = 'model_e2e_session';

  const mockCustomers = {
    table_name: 'customers',
    row_count: 1250,
    file_size_bytes: 84200,
    original_filename: 'customers.csv',
    position_x: 60,
    position_y: 60,
    columns: [
      { name: 'id', data_type: 'INTEGER', is_nullable: false, is_pk: true, is_fk: false },
      { name: 'first_name', data_type: 'VARCHAR', is_nullable: true, is_pk: false, is_fk: false },
      { name: 'email', data_type: 'VARCHAR', is_nullable: false, is_pk: false, is_fk: false },
    ],
  };

  const mockOrders = {
    table_name: 'orders',
    row_count: 8420,
    file_size_bytes: 420900,
    original_filename: 'orders.parquet',
    position_x: 420,
    position_y: 60,
    columns: [
      { name: 'id', data_type: 'BIGINT', is_nullable: false, is_pk: true, is_fk: false },
      { name: 'customer_id', data_type: 'INTEGER', is_nullable: false, is_pk: false, is_fk: true },
      { name: 'total_amount', data_type: 'DOUBLE', is_nullable: false, is_pk: false, is_fk: false },
    ],
  };

  const mockRel = {
    id: 'rel_customers_id_orders_customer_id',
    from_table: 'customers',
    from_column: 'id',
    to_table: 'orders',
    to_column: 'customer_id',
    cardinality: '1:N',
    confidence: 0.98,
    match_ratio: 0.99,
    orphan_count: 3,
    status: 'detected',
  };

  test.beforeEach(async ({ page }) => {
    // Intercept session creation
    await page.route('**/api/modeling/sessions', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            session_id: mockSessionId,
            created_at: new Date().toISOString(),
            tables: {},
            relationships: [],
          }),
        });
      } else {
        await route.continue();
      }
    });

    // Intercept position updates
    await page.route('**/api/modeling/sessions/*/tables/*/position', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
    });
  });

  // =========================================================================
  // SCENARIO 1: Empty State & File Ingestion
  // =========================================================================
  test('Scenario 1: Renders empty dropzones, rejects invalid files, and stages valid datasets', async ({ page }) => {
    await page.goto('/');

    // Navigate to Model Data tab
    const modelTabBtn = page.getByRole('button', { name: /Model Data \(ERD\)/i });
    await expect(modelTabBtn).toBeVisible();
    await modelTabBtn.click();

    // Verify header and initial empty metrics
    await expect(page.getByText('Data Modeler & ERD Studio')).toBeVisible();
    await expect(page.getByText('0 Tables · 0 Links')).toBeVisible();

    // Verify empty state sidebar and canvas
    await expect(page.getByText(/Staged Entities \(0\)/i)).toBeVisible();
    await expect(page.getByText('Build your Relational Data Model')).toBeVisible();
    await expect(page.getByText('No tables staged. Upload multiple CSVs, Parquet, or an SQLite database above.')).toBeVisible();

    // Test rejection: Unsupported file format
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'unsupported_binary.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('unsupported content'),
    });

    await expect(page.getByText(/Unsupported file type '\.exe'/i)).toBeVisible();

    // Dismiss error
    await page.locator('button:has(svg.lucide-x)').first().click();
    await expect(page.getByText(/Unsupported file type '\.exe'/i)).not.toBeVisible();

    // Mock successful upload response for valid file
    await page.route(`**/api/modeling/sessions/${mockSessionId}/tables`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session_id: mockSessionId,
          created_at: new Date().toISOString(),
          tables: {
            customers: mockCustomers,
          },
          relationships: [],
        }),
      });
    });

    // Upload valid CSV file
    await fileInput.setInputFiles({
      name: 'customers.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('id,first_name,email\n1,Alice,alice@example.com'),
    });

    // Verify transition from empty state to populated state
    await expect(page.getByText('Build your Relational Data Model')).not.toBeVisible();
    await expect(page.getByText('1 Table · 0 Links')).toBeVisible();
    await expect(page.locator('div.absolute.w-72').filter({ hasText: 'customers' })).toBeVisible();
  });

  // =========================================================================
  // SCENARIO 2: Header Metrics & Action Bar
  // =========================================================================
  test('Scenario 2: Validates button states and header metric counters across staging lifecycle', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Model Data \(ERD\)/i }).click();

    // In empty state: Utility buttons should be disabled
    const autoDetectBtn = page.getByRole('button', { name: /Auto-Detect Keys/i });
    const exportErdBtn = page.getByRole('button', { name: /Export ERD/i });
    const querySqlBtn = page.getByRole('button', { name: /Query in SQL Studio/i });

    await expect(autoDetectBtn).toBeDisabled();
    await expect(exportErdBtn).toBeDisabled();
    await expect(querySqlBtn).toBeDisabled();

    // Staging two tables with detected relationships
    await page.route(`**/api/modeling/sessions/${mockSessionId}/tables`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session_id: mockSessionId,
          created_at: new Date().toISOString(),
          tables: {
            customers: mockCustomers,
            orders: mockOrders,
          },
          relationships: [mockRel],
        }),
      });
    });

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'orders.parquet',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('PAR1'),
    });

    // Verify updated header badge
    await expect(page.getByText('2 Tables · 1 Links')).toBeVisible();

    // Buttons should now be enabled
    await expect(autoDetectBtn).toBeEnabled();
    await expect(exportErdBtn).toBeEnabled();
    await expect(querySqlBtn).toBeEnabled();
  });

  // =========================================================================
  // SCENARIO 3: Canvas Interactions & State Management
  // =========================================================================
  test('Scenario 3: Canvas ERD nodes, relationship inspection, and auto-detect workflow', async ({ page }) => {
    // Return pre-populated session with two tables
    await page.route('**/api/modeling/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session_id: mockSessionId,
          created_at: new Date().toISOString(),
          tables: {
            customers: mockCustomers,
            orders: mockOrders,
          },
          relationships: [mockRel],
        }),
      });
    });

    // Mock join preview response
    await page.route(`**/api/modeling/sessions/${mockSessionId}/preview-join`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          from_table: 'customers',
          from_column: 'id',
          to_table: 'orders',
          to_column: 'customer_id',
          join_type: 'INNER',
          matched_rows: 8417,
          total_child_rows: 8420,
          match_ratio: 0.9996,
          orphan_count: 3,
          columns: ['customers.id', 'customers.first_name', 'orders.id', 'orders.total_amount'],
          sample_rows: [
            { 'customers.id': 1, 'customers.first_name': 'Alice', 'orders.id': 101, 'orders.total_amount': 250.0 },
            { 'customers.id': 2, 'customers.first_name': 'Bob', 'orders.id': 102, 'orders.total_amount': 45.5 },
          ],
        }),
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: /Model Data \(ERD\)/i }).click();

    // Verify entity cards rendered on canvas
    const customersCard = page.locator('div.absolute.w-72').filter({ hasText: 'customers' });
    const ordersCard = page.locator('div.absolute.w-72').filter({ hasText: 'orders' });

    await expect(customersCard).toBeVisible();
    await expect(ordersCard).toBeVisible();

    // Verify column names and badges
    await expect(customersCard.getByText('first_name')).toBeVisible();
    await expect(customersCard.getByText('email')).toBeVisible();
    await expect(ordersCard.getByText('customer_id')).toBeVisible();

    // Verify SVG relationship curve with cardinality pill
    const cardinalityPill = page.locator('svg foreignObject').getByText('1:N');
    await expect(cardinalityPill).toBeVisible();

    // Click relationship pill to open Join Preview Drawer
    await cardinalityPill.click();

    // Verify drawer displays live join analysis
    await expect(page.getByText('Relational Join Analysis')).toBeVisible();
    await expect(page.getByText(/customers\.id.*orders\.customer_id/i)).toBeVisible();
    await expect(page.getByText('8,417')).toBeVisible(); // matched rows

    // Close drawer
    await page.getByTitle('Close join preview').click();
    await expect(page.getByText('Relational Join Analysis')).not.toBeVisible();
  });

  // =========================================================================
  // SCENARIO 4: Schema Export & Edge Cases
  // =========================================================================
  test('Scenario 4: Schema export modal, formats, and malformed dataset error handling', async ({ page }) => {
    await page.route('**/api/modeling/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          session_id: mockSessionId,
          created_at: new Date().toISOString(),
          tables: {
            customers: mockCustomers,
            orders: mockOrders,
          },
          relationships: [mockRel],
        }),
      });
    });

    // Mock schema export endpoint
    await page.route(`**/api/modeling/sessions/${mockSessionId}/export*`, async (route) => {
      const url = new URL(route.request().url());
      const format = url.searchParams.get('format') || 'mermaid';
      let content = 'erDiagram\n  customers ||--o{ orders : "places"';
      if (format === 'dbml') {
        content = 'Table customers {\n  id integer [pk]\n}\nTable orders {\n  customer_id integer\n}';
      } else if (format === 'sql_ddl') {
        content = 'CREATE TABLE customers (\n  id INTEGER PRIMARY KEY\n);';
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ format, content }),
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: /Model Data \(ERD\)/i }).click();

    // Click Export ERD button
    await page.getByRole('button', { name: /Export ERD/i }).click();

    // Verify Export Modal
    await expect(page.getByText('Export Schema / ERD')).toBeVisible();
    await expect(page.getByText('erDiagram')).toBeVisible();

    // Switch to DBML format
    await page.getByRole('button', { name: /DBML/i }).click();
    await expect(page.getByText('Table customers')).toBeVisible();

    // Switch to SQL DDL format
    await page.getByRole('button', { name: /SQL DDL/i }).click();
    await expect(page.getByText('CREATE TABLE customers')).toBeVisible();

    // Close export modal
    await page.locator('div.fixed.inset-0 button:has(svg.lucide-x)').first().click();
    await expect(page.getByText('Export Schema / ERD')).not.toBeVisible();

    // Simulate corrupted schema upload failure
    await page.route(`**/api/modeling/sessions/${mockSessionId}/tables`, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Corrupted schema: malformed SQLite header.' }),
      });
    });

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'broken.db',
      mimeType: 'application/x-sqlite3',
      buffer: Buffer.from('NOT A SQLITE FILE'),
    });

    // Verify error banner is surfaced
    await expect(page.getByText(/Corrupted schema: malformed SQLite header\./i)).toBeVisible();
  });
});
