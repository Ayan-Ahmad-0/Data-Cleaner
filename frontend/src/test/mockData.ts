import type { ModelingSessionState, TableMetadata, Relationship } from '../lib/api';

/**
 * Empty Session State
 */
export const mockEmptySessionState: ModelingSessionState = {
  session_id: 'model_empty_123',
  created_at: '2026-10-27T10:00:00.000Z',
  tables: {},
  relationships: [],
};

/**
 * Customers Table (CSV source)
 */
export const mockCustomersTable: TableMetadata = {
  table_name: 'customers',
  row_count: 1250,
  file_size_bytes: 84200,
  original_filename: 'customers.csv',
  position_x: 40,
  position_y: 40,
  columns: [
    { name: 'id', data_type: 'INTEGER', is_nullable: false, is_pk: true, is_fk: false, sample_values: [1, 2, 3] },
    { name: 'first_name', data_type: 'VARCHAR', is_nullable: true, is_pk: false, is_fk: false, sample_values: ['Jane', 'John', 'Alice'] },
    { name: 'last_name', data_type: 'VARCHAR', is_nullable: true, is_pk: false, is_fk: false, sample_values: ['Doe', 'Smith', 'Wong'] },
    { name: 'email', data_type: 'VARCHAR', is_nullable: false, is_pk: false, is_fk: false, sample_values: ['jane@corp.io', 'john@corp.io'] },
    { name: 'created_at', data_type: 'TIMESTAMP', is_nullable: false, is_pk: false, is_fk: false, sample_values: ['2026-01-15 09:30:00'] },
  ],
};

/**
 * Orders Table (Parquet source)
 */
export const mockOrdersTable: TableMetadata = {
  table_name: 'orders',
  row_count: 8420,
  file_size_bytes: 420900,
  original_filename: 'orders.parquet',
  position_x: 380,
  position_y: 40,
  columns: [
    { name: 'id', data_type: 'BIGINT', is_nullable: false, is_pk: true, is_fk: false, sample_values: [1001, 1002, 1003] },
    { name: 'customer_id', data_type: 'INTEGER', is_nullable: false, is_pk: false, is_fk: true, sample_values: [1, 2, 3] },
    { name: 'order_date', data_type: 'DATE', is_nullable: false, is_pk: false, is_fk: false, sample_values: ['2026-02-01', '2026-02-02'] },
    { name: 'total_amount', data_type: 'DOUBLE', is_nullable: false, is_pk: false, is_fk: false, sample_values: [149.99, 89.50, 420.00] },
    { name: 'status', data_type: 'VARCHAR', is_nullable: false, is_pk: false, is_fk: false, sample_values: ['COMPLETED', 'SHIPPED', 'PENDING'] },
  ],
};

/**
 * Order Items Table (Excel .xlsx source)
 */
export const mockOrderItemsTable: TableMetadata = {
  table_name: 'order_items',
  row_count: 24500,
  file_size_bytes: 1205000,
  original_filename: 'order_items.xlsx',
  position_x: 720,
  position_y: 40,
  columns: [
    { name: 'id', data_type: 'INTEGER', is_nullable: false, is_pk: true, is_fk: false, sample_values: [501, 502, 503] },
    { name: 'order_id', data_type: 'BIGINT', is_nullable: false, is_pk: false, is_fk: true, sample_values: [1001, 1002] },
    { name: 'product_id', data_type: 'INTEGER', is_nullable: false, is_pk: false, is_fk: true, sample_values: [20, 21, 22] },
    { name: 'quantity', data_type: 'INTEGER', is_nullable: false, is_pk: false, is_fk: false, sample_values: [2, 1, 5] },
    { name: 'unit_price', data_type: 'DOUBLE', is_nullable: false, is_pk: false, is_fk: false, sample_values: [49.99, 19.50] },
  ],
};

/**
 * Products Table (JSON source)
 */
export const mockProductsTable: TableMetadata = {
  table_name: 'products',
  row_count: 650,
  file_size_bytes: 35000,
  original_filename: 'products.json',
  position_x: 40,
  position_y: 400,
  columns: [
    { name: 'id', data_type: 'INTEGER', is_nullable: false, is_pk: true, is_fk: false, sample_values: [20, 21, 22] },
    { name: 'name', data_type: 'VARCHAR', is_nullable: false, is_pk: false, is_fk: false, sample_values: ['Wireless Headset', 'Ergo Keyboard'] },
    { name: 'category_id', data_type: 'INTEGER', is_nullable: true, is_pk: false, is_fk: true, sample_values: [5, 6] },
    { name: 'price', data_type: 'DOUBLE', is_nullable: false, is_pk: false, is_fk: false, sample_values: [79.99, 129.00] },
    { name: 'in_stock', data_type: 'BOOLEAN', is_nullable: false, is_pk: false, is_fk: false, sample_values: [true, false] },
  ],
};

/**
 * Categories Table (SQLite .sqlite database extraction)
 */
export const mockCategoriesTable: TableMetadata = {
  table_name: 'categories',
  row_count: 18,
  file_size_bytes: 12288,
  original_filename: 'catalog.sqlite',
  position_x: 380,
  position_y: 400,
  columns: [
    { name: 'id', data_type: 'INTEGER', is_nullable: false, is_pk: true, is_fk: false, sample_values: [5, 6, 7] },
    { name: 'category_name', data_type: 'VARCHAR', is_nullable: false, is_pk: false, is_fk: false, sample_values: ['Electronics', 'Accessories'] },
    { name: 'slug', data_type: 'VARCHAR', is_nullable: true, is_pk: false, is_fk: false, sample_values: ['electronics', 'accessories'] },
  ],
};

/**
 * Auto-Detected Relationships
 */
export const mockCustomerOrderRel: Relationship = {
  id: 'rel_customers_id_orders_customer_id',
  from_table: 'customers',
  from_column: 'id',
  to_table: 'orders',
  to_column: 'customer_id',
  cardinality: '1:N',
  confidence: 0.98,
  match_ratio: 0.995,
  orphan_count: 4,
  status: 'detected',
};

export const mockOrderItemsOrderRel: Relationship = {
  id: 'rel_orders_id_order_items_order_id',
  from_table: 'orders',
  from_column: 'id',
  to_table: 'order_items',
  to_column: 'order_id',
  cardinality: '1:N',
  confidence: 0.96,
  match_ratio: 1.0,
  orphan_count: 0,
  status: 'detected',
};

export const mockProductsOrderItemsRel: Relationship = {
  id: 'rel_products_id_order_items_product_id',
  from_table: 'products',
  from_column: 'id',
  to_table: 'order_items',
  to_column: 'product_id',
  cardinality: '1:N',
  confidence: 0.95,
  match_ratio: 0.98,
  orphan_count: 12,
  status: 'detected',
};

/**
 * Staged session states for testing
 */
export const mockTwoTablesSessionState: ModelingSessionState = {
  session_id: 'model_two_tables',
  created_at: '2026-10-27T10:00:00.000Z',
  tables: {
    customers: mockCustomersTable,
    orders: mockOrdersTable,
  },
  relationships: [mockCustomerOrderRel],
};

export const mockFiveTablesSessionState: ModelingSessionState = {
  session_id: 'model_five_tables',
  created_at: '2026-10-27T10:00:00.000Z',
  tables: {
    customers: mockCustomersTable,
    orders: mockOrdersTable,
    order_items: mockOrderItemsTable,
    products: mockProductsTable,
    categories: mockCategoriesTable,
  },
  relationships: [mockCustomerOrderRel, mockOrderItemsOrderRel, mockProductsOrderItemsRel],
};

/**
 * Generates a session state with 50+ staged tables for stress & performance tests.
 */
export function generate50TablesSessionState(count = 52): ModelingSessionState {
  const tables: Record<string, TableMetadata> = {};
  const relationships: Relationship[] = [];

  for (let i = 0; i < count; i++) {
    const tableName = `staged_entity_${i + 1}`;
    const colOffset = (i % 4) * 320 + 40;
    const rowOffset = Math.floor(i / 4) * 340 + 40;

    tables[tableName] = {
      table_name: tableName,
      row_count: 1000 + i * 25,
      file_size_bytes: 45000 + i * 1500,
      original_filename: `${tableName}.parquet`,
      position_x: colOffset,
      position_y: rowOffset,
      columns: [
        { name: 'id', data_type: 'INTEGER', is_nullable: false, is_pk: true, is_fk: false },
        { name: 'parent_id', data_type: 'INTEGER', is_nullable: true, is_pk: false, is_fk: true },
        { name: 'metric_value', data_type: 'DOUBLE', is_nullable: false, is_pk: false, is_fk: false },
        { name: 'description', data_type: 'VARCHAR', is_nullable: true, is_pk: false, is_fk: false },
        { name: 'updated_at', data_type: 'TIMESTAMP', is_nullable: false, is_pk: false, is_fk: false },
      ],
    };

    if (i > 0 && i % 2 === 0) {
      const prevTable = `staged_entity_${i}`;
      relationships.push({
        id: `rel_${prevTable}_id_${tableName}_parent_id`,
        from_table: prevTable,
        from_column: 'id',
        to_table: tableName,
        to_column: 'parent_id',
        cardinality: '1:N',
        confidence: 0.9,
        match_ratio: 0.95,
        orphan_count: 2,
        status: 'detected',
      });
    }
  }

  return {
    session_id: 'model_stress_50',
    created_at: '2026-10-27T10:00:00.000Z',
    tables,
    relationships,
  };
}

/**
 * Malformed / Corrupted dataset error response simulation
 */
export const mockMalformedDatasetError = {
  detail: 'Malformed dataset: Unable to parse delimiter or header row in sales_corrupted.csv',
};

export const mockCorruptedSqliteError = {
  detail: 'Corrupted SQLite database: file is not a database or disk I/O error on sqlite_master',
};
