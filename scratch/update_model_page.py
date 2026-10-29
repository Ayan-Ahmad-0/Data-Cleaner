path = 'frontend/src/pages/ModelPage.tsx'
with open(path, 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add mobileSidebarOpen state
state_target = """  // Modals & Drawers
  const [selectedRelationship, setSelectedRelationship] = useState<Relationship | null>(null);
  const [editingRelationship, setEditingRelationship] = useState<Relationship | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);"""

state_replacement = """  // Modals & Drawers
  const [selectedRelationship, setSelectedRelationship] = useState<Relationship | null>(null);
  const [editingRelationship, setEditingRelationship] = useState<Relationship | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);"""

assert state_target in code, "state_target not found"
code = code.replace(state_target, state_replacement, 1)

# 2. Update Header and Workspace JSX
jsx_target = """      {/* Top Action Header */}
      <div className="px-5 py-3 bg-[var(--bg-surface)] border-b border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[#FF4B3E] flex items-center justify-center">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
                Data Modeler & ERD Studio
              </h2>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                {tablesCount} {tablesCount === 1 ? 'Table' : 'Tables'} · {relationshipsCount} Links
              </span>
            </div>
            <p className="text-xs text-[var(--text-muted)] hidden sm:block">
              Multi-table staging, automated primary/foreign key discovery, and interactive schema modeling.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleAutoDetect}
            disabled={tablesCount < 2 || loading}
            leftIcon={<Sparkles className="w-3.5 h-3.5 text-[#FF4B3E]" />}
            className="text-xs border border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            Auto-Detect Keys
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleDownloadMergedCsv}
            disabled={tablesCount === 0}
            leftIcon={<Download className="w-3.5 h-3.5 text-emerald-400" />}
            className="text-xs border border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer"
            title="Execute relational JOIN in DuckDB and download the complete merged dataset as CSV"
          >
            Download Merged CSV
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowExportModal(true)}
            disabled={tablesCount === 0}
            leftIcon={<Share2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
            className="text-xs border border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            Export ERD
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleHandoff('ask_ai')}
            disabled={tablesCount === 0}
            leftIcon={<Bot className="w-3.5 h-3.5 text-purple-400" />}
            className="text-xs border border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer"
            title="Materialize modeled dataset and explore with natural-language AI Analyst"
          >
            Ask AI Analyst
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleHandoff('sql')}
            disabled={tablesCount === 0}
            leftIcon={<Terminal className="w-3.5 h-3.5 text-[#FF4B3E]" />}
            className="text-xs border border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer"
            title="Materialize modeled dataset and open DuckDB SQL query editor"
          >
            Query in SQL Studio
          </Button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 shadow-lg font-mono">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="mx-5 mt-3 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between font-mono shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Sidebar / Tables Drawer */}
        <div className="w-72 bg-[var(--bg-surface)] border-r border-[var(--border-hairline)] flex flex-col shrink-0">
          <div className="p-3 border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] flex items-center justify-between">
            <span className="font-mono text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Staged Entities ({tablesCount})
            </span>
          </div>

          <div className="p-3 border-b border-[var(--border-hairline)]">
            <MultiTableDropzone
              onUploadFiles={handleUploadFiles}
              isUploading={isUploading}
            />
          </div>

          {/* Table List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-hairline)]/60">
            {tablesCount === 0 ? (
              <div className="p-5 text-center text-xs text-[var(--text-muted)] font-mono">
                No tables staged. Upload multiple CSVs, Parquet, or an SQLite database above.
              </div>
            ) : (
              Object.values(session!.tables).map((t) => (
                <div key={t.table_name} className="p-3 hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-between text-xs">
                  <div className="min-w-0 pr-2">
                    <span className="font-mono font-bold text-[var(--text-primary)] block truncate" title={t.table_name}>
                      {t.table_name}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] block">
                      {t.row_count.toLocaleString()} rows · {t.columns.length} cols
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteTable(t.table_name)}
                    className="p-1 text-[var(--text-muted)] hover:text-red-400 transition-colors cursor-pointer"
                    title="Remove table"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Center ERD Canvas Area */}
        <div className="flex-1 relative overflow-hidden">
          {loading && !session ? (
            <div className="w-full h-full flex items-center justify-center gap-2 text-xs text-[var(--text-muted)] font-mono">
              <Loader2 className="w-5 h-5 animate-spin text-[#FF4B3E]" />
              <span>Loading modeling session...</span>
            </div>
          ) : tablesCount === 0 ? (
            /* Empty State Hero */
            <div className="w-full h-full flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[#FF4B3E] flex items-center justify-center shadow-lg mb-4">
                <Database className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
                Build your Relational Data Model
              </h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mt-1 mb-6 leading-relaxed">
                Upload multiple related datasets (orders, customers, products) to auto-detect Primary Keys and Foreign Key overlap, or inspect your SQLite database schema.
              </p>
              <div className="w-full max-w-sm">
                <MultiTableDropzone
                  onUploadFiles={handleUploadFiles}
                  isUploading={isUploading}
                />
              </div>
            </div>"""

jsx_replacement = """      {/* Top Action Header */}
      <div className="px-3 sm:px-5 py-2.5 sm:py-3 bg-[var(--bg-surface)] border-b border-[var(--border-hairline)] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 shrink-0">
        <div className="flex items-center justify-between w-full sm:w-auto">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[#FF4B3E] flex items-center justify-center shrink-0">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-semibold text-[var(--text-primary)] tracking-tight">
                  Data Modeler & ERD Studio
                </h2>
                <span className="text-[10px] sm:text-[11px] font-mono px-2 py-0.5 rounded-full bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                  {tablesCount} {tablesCount === 1 ? 'Table' : 'Tables'} · {relationshipsCount} Links
                </span>
              </div>
              <p className="text-xs text-[var(--text-muted)] hidden sm:block">
                Multi-table staging, automated primary/foreign key discovery, and interactive schema modeling.
              </p>
            </div>
          </div>

          {/* Mobile Sidebar Toggle Button */}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMobileSidebarOpen((prev) => !prev)}
            className="md:hidden text-xs border border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer shrink-0 ml-2"
            leftIcon={<Layers className="w-3.5 h-3.5 text-[#FF4B3E]" />}
          >
            Entities ({tablesCount})
          </Button>
        </div>

        {/* Action Controls - horizontally swipeable on mobile */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none w-full sm:w-auto pb-1 sm:pb-0 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleAutoDetect}
            disabled={tablesCount < 2 || loading}
            leftIcon={<Sparkles className="w-3.5 h-3.5 text-[#FF4B3E]" />}
            className="text-xs border border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer shrink-0 whitespace-nowrap"
          >
            Auto-Detect Keys
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={handleDownloadMergedCsv}
            disabled={tablesCount === 0}
            leftIcon={<Download className="w-3.5 h-3.5 text-emerald-400" />}
            className="text-xs border border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer shrink-0 whitespace-nowrap"
            title="Execute relational JOIN in DuckDB and download the complete merged dataset as CSV"
          >
            Download Merged CSV
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowExportModal(true)}
            disabled={tablesCount === 0}
            leftIcon={<Share2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />}
            className="text-xs border border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer shrink-0 whitespace-nowrap"
          >
            Export ERD
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleHandoff('ask_ai')}
            disabled={tablesCount === 0}
            leftIcon={<Bot className="w-3.5 h-3.5 text-purple-400" />}
            className="text-xs border border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer shrink-0 whitespace-nowrap"
            title="Materialize modeled dataset and explore with natural-language AI Analyst"
          >
            Ask AI Analyst
          </Button>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleHandoff('sql')}
            disabled={tablesCount === 0}
            leftIcon={<Terminal className="w-3.5 h-3.5 text-[#FF4B3E]" />}
            className="text-xs border border-[var(--border-hairline)] bg-[var(--bg-subtle)] hover:bg-[var(--bg-hover)] cursor-pointer shrink-0 whitespace-nowrap"
            title="Materialize modeled dataset and open DuckDB SQL query editor"
          >
            Query in SQL Studio
          </Button>
        </div>
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-16 right-6 z-50 px-4 py-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2 shadow-lg font-mono">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div className="mx-3 sm:mx-5 mt-3 px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between font-mono shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} className="cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Mobile Backdrop for Sidebar Drawer */}
        {mobileSidebarOpen && (
          <div
            className="fixed inset-0 bg-black/50 z-30 md:hidden backdrop-blur-2xs transition-opacity"
            onClick={() => setMobileSidebarOpen(false)}
            aria-hidden="true"
          />
        )}

        {/* Left Sidebar / Tables Drawer: absolute sliding drawer on mobile, static on desktop */}
        <div
          className={`absolute md:static inset-y-0 left-0 z-40 w-72 max-w-[85vw] bg-[var(--bg-surface)] border-r border-[var(--border-hairline)] flex flex-col shrink-0 transition-transform duration-200 ease-in-out md:translate-x-0 ${
            mobileSidebarOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
          }`}
        >
          <div className="p-3 border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] flex items-center justify-between">
            <span className="font-mono text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Staged Entities ({tablesCount})
            </span>
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(false)}
              className="md:hidden p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded cursor-pointer"
              aria-label="Close entities sidebar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 border-b border-[var(--border-hairline)]">
            <MultiTableDropzone
              onUploadFiles={async (files) => {
                await handleUploadFiles(files);
                setMobileSidebarOpen(false);
              }}
              isUploading={isUploading}
            />
          </div>

          {/* Table List */}
          <div className="flex-1 overflow-y-auto divide-y divide-[var(--border-hairline)]/60">
            {tablesCount === 0 ? (
              <div className="p-5 text-center text-xs text-[var(--text-muted)] font-mono">
                No tables staged. Upload multiple CSVs, Parquet, or an SQLite database above.
              </div>
            ) : (
              Object.values(session!.tables).map((t) => (
                <div key={t.table_name} className="p-3 hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-between text-xs">
                  <div className="min-w-0 pr-2">
                    <span className="font-mono font-bold text-[var(--text-primary)] block truncate" title={t.table_name}>
                      {t.table_name}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)] block">
                      {t.row_count.toLocaleString()} rows · {t.columns.length} cols
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteTable(t.table_name)}
                    className="p-1 text-[var(--text-muted)] hover:text-red-400 transition-colors cursor-pointer"
                    title="Remove table"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Center ERD Canvas Area */}
        <div className="flex-1 relative overflow-hidden w-full min-w-0">
          {loading && !session ? (
            <div className="w-full h-full flex items-center justify-center gap-2 text-xs text-[var(--text-muted)] font-mono">
              <Loader2 className="w-5 h-5 animate-spin text-[#FF4B3E]" />
              <span>Loading modeling session...</span>
            </div>
          ) : tablesCount === 0 ? (
            /* Empty State Hero - perfectly responsive on mobile */
            <div className="w-full h-full flex flex-col items-center justify-center p-4 sm:p-8 text-center max-w-full overflow-y-auto">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[#FF4B3E] flex items-center justify-center shadow-lg mb-3 sm:mb-4">
                <Database className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <h3 className="text-base sm:text-lg font-semibold text-[var(--text-primary)] tracking-tight">
                Build your Relational Data Model
              </h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mt-1 mb-5 sm:mb-6 leading-relaxed px-2">
                Upload multiple related datasets (orders, customers, products) to auto-detect Primary Keys and Foreign Key overlap, or inspect your SQLite database schema.
              </p>
              <div className="w-full max-w-sm px-2">
                <MultiTableDropzone
                  onUploadFiles={handleUploadFiles}
                  isUploading={isUploading}
                />
              </div>
            </div>"""

assert jsx_target in code, "jsx_target not found"
code = code.replace(jsx_target, jsx_replacement, 1)

with open(path, 'w', encoding='utf-8') as f:
    f.write(code)

print("Successfully updated ModelPage.tsx")
