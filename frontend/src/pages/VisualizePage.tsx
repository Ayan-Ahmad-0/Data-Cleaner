import React, { useEffect, useRef, useState } from 'react';
import {
  detectFormat,
  getColumnStats,
  getChartSuggestions,
  getStarterSpec,
  getChartAiStatus,
  getVisualizationPlan,
  autoVisualizeCharts,
  buildChart,
  uploadForQuery,
  type AutoVisualizeItem,
  type ChartColumnStats,
  type ChartFromTextResult,
  type ChartRecommendation,
  type ChartSpec,
  type DataPrepTip,
  type PageDataOptions,
  type QueryUploadResult,
  type VisualizationPlan,
} from '../lib/api';
import { formatBytes, formatNumber } from '../lib/format';
import { ChartCard, type ChartCardItem } from '../components/explore/ChartCard';
import { DataOptionsPanel } from '../components/explore/DataOptionsPanel';
import { DescribeChartBar } from '../components/explore/DescribeChartBar';
import { VisualizationAdviceModal } from '../components/explore/VisualizationAdviceModal';
import { DEFAULT_CHART_COLOR } from '../components/explore/chartColors';
import { Button } from '../components/ui/Button';
import { Callout } from '../components/ui/Callout';
import { Tag } from '../components/ui/Tag';
import {
  BarChart3,
  Upload,
  Info,
  FileSpreadsheet,
  Database,
  Sparkles,
  ShieldCheck,
} from 'lucide-react';

interface VisualizePageProps {
  initialDataset?: QueryUploadResult | null;
  onHandoffToQuery: (jobId: string, filename: string) => void;
  onHandoffToClean: (cleanJobId: string, filename: string) => void;
  onBackToSource?: () => void;
}

export const VisualizePage: React.FC<VisualizePageProps> = ({
  initialDataset,
  onHandoffToQuery,
  onHandoffToClean,
  onBackToSource,
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [datasetInfo, setDatasetInfo] = useState<QueryUploadResult | null>(null);
  const [columns, setColumns] = useState<ChartColumnStats[]>([]);
  const [cards, setCards] = useState<ChartCardItem[]>([]);
  const [viewTab, setViewTab] = useState<'standard' | 'ai'>('standard');
  const [pageOptions, setPageOptions] = useState<PageDataOptions>({
    cast_overrides: {},
    exclude_missing: false,
    hide_outliers: false,
  });
  const [globalChartColor, setGlobalChartColor] = useState<string>(DEFAULT_CHART_COLOR);

  // AI status & Advice modal state
  const [aiEnabled, setAiEnabled] = useState(false);
  const [isAutoVisualizing, setIsAutoVisualizing] = useState(false);
  const [isAdviceOpen, setIsAdviceOpen] = useState(false);
  const [advicePlan, setAdvicePlan] = useState<VisualizationPlan | null>(null);
  const [loadingAdvice, setLoadingAdvice] = useState(false);
  const [isAddingChart, setIsAddingChart] = useState(false);

  // File sheet/table disambiguation
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [tableNames, setTableNames] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-load pre-staged dataset when handed off from Clean or Convert flows
  useEffect(() => {
    if (initialDataset && initialDataset.query_id) {
      setDatasetInfo(initialDataset);
      setStagedFile(null);
      setSheetNames([]);
      setSelectedSheet('');
      setTableNames([]);
      setSelectedTable('');

      Promise.all([
        getColumnStats(initialDataset.query_id),
        getChartSuggestions(initialDataset.query_id),
        getChartAiStatus(initialDataset.query_id),
      ])
        .then(([colStats, chartSuggestions, aiStatusRes]) => {
          setColumns(colStats);
          setAiEnabled(aiStatusRes.enabled);
          loadCardsFromSuggestions(initialDataset.query_id, chartSuggestions, pageOptions);
        })
        .catch((err) => {
          console.error('Failed to load dataset metadata for visualizer:', err);
        });
    }
  }, [initialDataset?.query_id]);

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelected = async (file: File) => {
    setError(null);
    setSheetNames([]);
    setSelectedSheet('');
    setTableNames([]);
    setSelectedTable('');
    setStagedFile(file);

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const supportedExts = ['.csv', '.tsv', '.parquet', '.json', '.ndjson', '.jsonl', '.xlsx', '.db', '.sqlite'];

    if (!supportedExts.includes(ext)) {
      setError(`Unsupported file type '${ext}'. Please upload a CSV, TSV, Parquet, JSON, NDJSON, Excel (.xlsx), or SQLite (.db) file.`);
      setStagedFile(null);
      return;
    }

    try {
      const detectRes = await detectFormat(file);
      if (detectRes.sheets && detectRes.sheets.length > 1) {
        setSheetNames(detectRes.sheets);
        setSelectedSheet(detectRes.sheets[0]);
        // Await user sheet selection confirmation
        return;
      } else if (detectRes.tables && detectRes.tables.length > 1) {
        setTableNames(detectRes.tables);
        setSelectedTable(detectRes.tables[0]);
        return;
      } else if (detectRes.sheets && detectRes.sheets.length === 1) {
        // Single sheet Excel - auto stage with explicit sheet name
        await processAndStageFile(file, { sheet: detectRes.sheets[0] });
      } else {
        await processAndStageFile(file);
      }
    } catch {
      await processAndStageFile(file);
    }
  };

  const processAndStageFile = async (
    file: File,
    customOptions?: { sheet?: string; table?: string }
  ) => {
    setError(null);
    setIsUploading(true);
    setUploadProgress(20);

    const timer = setInterval(() => {
      setUploadProgress((prev) => (prev < 85 ? prev + 15 : prev));
    }, 200);

    try {
      const options = customOptions || (
        selectedSheet ? { sheet: selectedSheet } : selectedTable ? { table: selectedTable } : undefined
      );

      const res = await uploadForQuery(file, options);
      clearInterval(timer);
      setUploadProgress(100);
      setDatasetInfo(res);
      setStagedFile(null);
      setSheetNames([]);
      setSelectedSheet('');
      setTableNames([]);
      setSelectedTable('');

      try {
        const [colStats, chartSuggestions, aiStatusRes] = await Promise.all([
          getColumnStats(res.query_id),
          getChartSuggestions(res.query_id),
          getChartAiStatus(res.query_id),
        ]);
        setColumns(colStats);
        setAiEnabled(aiStatusRes.enabled);

        // Load initial standard suggestions as cards
        loadCardsFromSuggestions(res.query_id, chartSuggestions, pageOptions);
      } catch (err: any) {
        console.error('Failed to load dataset metadata:', err);
      }
    } catch (err: any) {
      clearInterval(timer);
      setError(err.message || 'Failed to prepare dataset for visualization.');
    } finally {
      setIsUploading(false);
    }
  };

  const loadCardsFromSuggestions = async (
    jobId: string,
    suggestions: ChartSpec[],
    currentOptions: PageDataOptions
  ) => {
    const initialCards: ChartCardItem[] = suggestions.map((spec, idx) => ({
      id: `suggest_${idx + 1}`,
      spec,
      originalSpec: spec,
      data: null,
      loading: true,
      source: 'standard',
    }));
    setCards(initialCards);

    // Build charts in background
    for (let i = 0; i < initialCards.length; i++) {
      const item = initialCards[i];
      try {
        const data = await buildChart(jobId, item.spec, currentOptions);
        setCards((prev) =>
          prev.map((c) => (c.id === item.id ? { ...c, data, loading: false } : c))
        );
      } catch (err: any) {
        setCards((prev) =>
          prev.map((c) => (c.id === item.id ? { ...c, loading: false, error: err.message } : c))
        );
      }
    }
  };

  // Re-render all cards when page options change
  const handlePageOptionsChange = async (newOptions: PageDataOptions) => {
    setPageOptions(newOptions);
    if (!datasetInfo) return;

    // Trigger re-render of all active cards with new options
    setCards((prev) => prev.map((c) => ({ ...c, loading: true })));

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      try {
        const data = await buildChart(datasetInfo.query_id, card.spec, newOptions);
        setCards((prev) =>
          prev.map((c) => (c.id === card.id ? { ...c, data, loading: false, error: null } : c))
        );
      } catch (err: any) {
        setCards((prev) =>
          prev.map((c) => (c.id === card.id ? { ...c, loading: false, error: err.message } : c))
        );
      }
    }
  };

  const handleResetPageOptions = () => {
    handlePageOptionsChange({
      cast_overrides: {},
      exclude_missing: false,
      hide_outliers: false,
    });
  };

  // Auto-Visualize with AI
  const handleAutoVisualize = async () => {
    if (!datasetInfo || isAutoVisualizing) return;
    setIsAutoVisualizing(true);
    setViewTab('ai');

    try {
      const items: AutoVisualizeItem[] = await autoVisualizeCharts(
        datasetInfo.query_id,
        pageOptions,
        6,
        true
      );

      const newCards: ChartCardItem[] = items.map((item, idx) => ({
        id: item.recommendation.id || `ai_rec_${idx + 1}`,
        spec: item.recommendation.spec,
        originalSpec: item.recommendation.spec,
        data: item.data || null,
        error: item.error || null,
        loading: false,
        source: item.recommendation.source || 'ai',
        questionAnswered: item.recommendation.question_answered,
        why: item.recommendation.why,
        caveats: item.recommendation.caveats,
      }));

      setCards(newCards);
    } catch (err: any) {
      setError(err.message || 'Auto-visualize failed. Please try again.');
    } finally {
      setIsAutoVisualizing(false);
    }
  };

  // Open Visualization Advice Modal
  const handleOpenAdvice = async () => {
    if (!datasetInfo) return;
    setIsAdviceOpen(true);
    if (!advicePlan) {
      setLoadingAdvice(true);
      try {
        const plan = await getVisualizationPlan(datasetInfo.query_id, pageOptions);
        setAdvicePlan(plan);
      } catch (err: any) {
        console.error('Failed to load visualization advice:', err);
      } finally {
        setLoadingAdvice(false);
      }
    }
  };

  // Create chart from advice modal
  const handleCreateChartFromAdvice = async (rec: ChartRecommendation) => {
    if (!datasetInfo) return;
    const newCard: ChartCardItem = {
      id: `rec_${Date.now()}`,
      spec: rec.spec,
      originalSpec: rec.spec,
      data: null,
      loading: true,
      source: rec.source || 'ai',
      questionAnswered: rec.question_answered,
      why: rec.why,
      caveats: rec.caveats,
    };
    setCards((prev) => [newCard, ...prev]);

    try {
      const data = await buildChart(datasetInfo.query_id, rec.spec, pageOptions);
      setCards((prev) =>
        prev.map((c) => (c.id === newCard.id ? { ...c, data, loading: false } : c))
      );
    } catch (err: any) {
      setCards((prev) =>
        prev.map((c) => (c.id === newCard.id ? { ...c, loading: false, error: err.message } : c))
      );
    }
  };

  // Apply prep tip from advice modal
  const handleApplyPrepTip = (tip: DataPrepTip) => {
    const updated = { ...pageOptions };
    if (tip.action === 'exclude_missing') {
      updated.exclude_missing = true;
    } else if (tip.action === 'hide_outliers') {
      updated.hide_outliers = true;
    } else if (tip.action === 'cast_as_date' && tip.column) {
      updated.cast_overrides = { ...updated.cast_overrides, [tip.column]: 'date' };
    } else if (tip.action === 'cast_as_number' && tip.column) {
      updated.cast_overrides = { ...updated.cast_overrides, [tip.column]: 'number' };
    }
    handlePageOptionsChange(updated);
  };

  // "Add chart" button (Section 5.3)
  const handleAddChart = async () => {
    if (!datasetInfo || isAddingChart) return;
    setIsAddingChart(true);
    try {
      const starterSpec = await getStarterSpec(datasetInfo.query_id);
      const newCard: ChartCardItem = {
        id: `manual_${Date.now()}`,
        spec: starterSpec,
        originalSpec: starterSpec,
        data: null,
        loading: true,
        source: 'manual',
      };
      setCards((prev) => [newCard, ...prev]);

      const data = await buildChart(datasetInfo.query_id, starterSpec, pageOptions);
      setCards((prev) =>
        prev.map((c) => (c.id === newCard.id ? { ...c, data, loading: false } : c))
      );
    } catch (err: any) {
      console.error('Failed to add starter chart:', err);
    } finally {
      setIsAddingChart(false);
    }
  };

  // Chart created from "Describe a chart" top bar
  const handleChartCreatedFromText = (res: ChartFromTextResult) => {
    if (!res.spec) return;
    const newCard: ChartCardItem = {
      id: `ask_${Date.now()}`,
      spec: res.spec,
      originalSpec: res.spec,
      data: res.data || null,
      loading: false,
      source: 'ai',
      explanation: res.explanation || undefined,
      assumptions: res.assumptions,
    };
    setCards((prev) => [newCard, ...prev]);
  };

  // Update card spec from Tweak panel or color picker
  const handleUpdateCardSpec = async (id: string, updatedSpec: ChartSpec) => {
    if (!datasetInfo) return;
    const existing = cards.find((c) => c.id === id);
    if (!existing) return;

    // Check if ONLY visual fields (like custom_color or title) changed
    const queryFieldsChanged =
      existing.spec.chart_type !== updatedSpec.chart_type ||
      JSON.stringify(existing.spec.x) !== JSON.stringify(updatedSpec.x) ||
      JSON.stringify(existing.spec.y) !== JSON.stringify(updatedSpec.y) ||
      JSON.stringify(existing.spec.color) !== JSON.stringify(updatedSpec.color) ||
      existing.spec.aggregation !== updatedSpec.aggregation ||
      JSON.stringify(existing.spec.filters) !== JSON.stringify(updatedSpec.filters) ||
      existing.spec.sort !== updatedSpec.sort ||
      existing.spec.top_n !== updatedSpec.top_n ||
      existing.spec.log_y !== updatedSpec.log_y;

    if (!queryFieldsChanged && existing.data) {
      // Instant local update with 0ms latency!
      const updatedData = { ...existing.data, spec: updatedSpec };
      setCards((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, spec: updatedSpec, data: updatedData, isEdited: true } : c
        )
      );
      return;
    }

    let specToBuild = { ...updatedSpec };
    if (specToBuild.chart_type === 'pie') {
      if (!specToBuild.top_n || specToBuild.top_n > 6) {
        specToBuild.top_n = 6;
      }
      if (specToBuild.aggregation === 'none') {
        specToBuild.aggregation = 'count';
      }
    }

    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, spec: specToBuild, loading: true, error: null, isEdited: true } : c))
    );

    try {
      const data = await buildChart(datasetInfo.query_id, specToBuild, pageOptions);
      setCards((prev) =>
        prev.map((c) => (c.id === id ? { ...c, spec: specToBuild, data, loading: false, error: null } : c))
      );
    } catch (err: any) {
      setCards((prev) =>
        prev.map((c) => (c.id === id ? { ...c, loading: false, error: err.message } : c))
      );
    }
  };

  // Retry failed chart render
  const handleRetryCard = async (id: string) => {
    const card = cards.find((c) => c.id === id);
    if (!card || !datasetInfo) return;

    let retrySpec = { ...card.spec };
    if (retrySpec.chart_type === 'pie') {
      if (!retrySpec.top_n || retrySpec.top_n > 6) {
        retrySpec.top_n = 6;
      }
      if (retrySpec.aggregation === 'none') {
        retrySpec.aggregation = 'count';
      }
    }

    setCards((prev) =>
      prev.map((c) => (c.id === id ? { ...c, spec: retrySpec, loading: true, error: null } : c))
    );

    try {
      const data = await buildChart(datasetInfo.query_id, retrySpec, pageOptions);
      setCards((prev) =>
        prev.map((c) => (c.id === id ? { ...c, spec: retrySpec, data, loading: false, error: null } : c))
      );
    } catch (err: any) {
      setCards((prev) =>
        prev.map((c) => (c.id === id ? { ...c, loading: false, error: err.message } : c))
      );
    }
  };

  // Reset card spec to original
  const handleResetCardSpec = async (id: string) => {
    const card = cards.find((c) => c.id === id);
    if (!card || !datasetInfo) return;
    handleUpdateCardSpec(id, card.originalSpec);
  };

  // Remove card
  const handleRemoveCard = (id: string) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
  };

  // Switch between Standard suggestions and AI picks
  const handleSwitchTab = async (tab: 'standard' | 'ai') => {
    setViewTab(tab);
    if (!datasetInfo) return;
    if (tab === 'standard') {
      try {
        const suggestions = await getChartSuggestions(datasetInfo.query_id);
        loadCardsFromSuggestions(datasetInfo.query_id, suggestions, pageOptions);
      } catch (err) {
        console.error('Failed to load standard suggestions:', err);
      }
    } else {
      handleAutoVisualize();
    }
  };

  const handleReset = () => {
    setDatasetInfo(null);
    setColumns([]);
    setCards([]);
    setError(null);
    setAdvicePlan(null);
    setStagedFile(null);
    setSheetNames([]);
    setSelectedSheet('');
    setTableNames([]);
    setSelectedTable('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="container-shell pt-6 sm:pt-8 pb-12 sm:pb-16 space-y-5 sm:space-y-6">
      {/* Hero Title */}
      <div className="text-left space-y-2">
        <h1 className="text-2xl sm:text-3xl font-semibold text-[var(--text-primary)] tracking-tight">
          Visualize Your Data
        </h1>
        <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed max-w-2xl">
          Upload raw datasets up to 10 GB. Instant AI-assisted charts, auto-visualization, interactive tweak panels, and zero cleaning required.
        </p>
      </div>

      {/* Raw-Data Honesty Note */}
      <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
        <Info className="w-4 h-4 shrink-0 text-[var(--text-muted)]" />
        <span>
          Viewing original, uncleaned data. Missing values, duplicates, and unparsed types are included in charts unless filtered out.
        </span>
      </div>

      {/* Error Callout */}
      {error && (
        <Callout variant="danger" title="Error">
          {error}
        </Callout>
      )}

      {/* Upload & Prepare Area (if no dataset loaded) */}
      {!datasetInfo && (
        <div className="space-y-4">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".csv,.tsv,.parquet,.json,.ndjson,.jsonl,.xlsx,.db,.sqlite"
            onChange={handleFileInputChange}
            id="visualize-file-input"
          />

          {/* Disambiguation for multi-sheet Excel / multi-table SQLite */}
          {stagedFile && !isUploading && (sheetNames.length > 1 || tableNames.length > 1) ? (
            <div className="bg-[var(--bg-surface)] rounded-[var(--radius-lg)] p-8 sm:p-10 border border-[var(--border-hairline)] shadow-[var(--shadow-card)] space-y-6 max-w-2xl mx-auto text-left">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-[var(--radius-lg)] bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center border border-[var(--accent-border)] shrink-0">
                    {sheetNames.length > 1 ? (
                      <FileSpreadsheet className="w-6 h-6" />
                    ) : (
                      <Database className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-[var(--text-primary)]">
                      {sheetNames.length > 1 ? 'Select Excel Sheet to Visualize' : 'Select SQLite Table to Visualize'}
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">
                      {stagedFile.name} • {formatBytes(stagedFile.size)}
                    </p>
                  </div>
                </div>
                <Tag variant="neutral" font="mono">
                  {sheetNames.length > 1 ? `${sheetNames.length} SHEETS` : `${tableNames.length} TABLES`}
                </Tag>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--text-secondary)] block">
                  {sheetNames.length > 1 ? 'Available Sheets:' : 'Available Tables:'}
                </label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <select
                    value={sheetNames.length > 1 ? (selectedSheet || sheetNames[0]) : (selectedTable || tableNames[0])}
                    onChange={(e) => {
                      if (sheetNames.length > 1) setSelectedSheet(e.target.value);
                      else setSelectedTable(e.target.value);
                    }}
                    className="flex-1 bg-[var(--bg-app)] text-[var(--text-primary)] text-sm rounded-[var(--radius-md)] px-3.5 py-2.5 border border-[var(--border-hairline)] focus:border-[var(--accent)] outline-none transition-colors"
                  >
                    {(sheetNames.length > 1 ? sheetNames : tableNames).map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>

                  <Button
                    variant="primary"
                    size="md"
                    leftIcon={<BarChart3 className="w-4 h-4" />}
                    onClick={() => {
                      const chosenSheet = selectedSheet || sheetNames[0];
                      const chosenTable = selectedTable || tableNames[0];
                      processAndStageFile(
                        stagedFile,
                        sheetNames.length > 1 ? { sheet: chosenSheet } : { table: chosenTable }
                      );
                    }}
                    className="shadow-[0_2px_12px_rgba(253,66,51,0.18)] hover:shadow-[0_4px_20px_rgba(253,66,51,0.25)] shrink-0"
                  >
                    {sheetNames.length > 1 ? 'Visualize Selected Sheet' : 'Visualize Selected Table'}
                  </Button>
                </div>
              </div>

              <div className="pt-2 border-t border-[var(--border-hairline)] flex items-center justify-between text-xs text-[var(--text-muted)]">
                <span>Want to visualize a different file?</span>
                <button
                  type="button"
                  onClick={() => {
                    setStagedFile(null);
                    setSheetNames([]);
                    setSelectedSheet('');
                    setTableNames([]);
                    setSelectedTable('');
                    if (fileInputRef.current) fileInputRef.current.value = '';
                    fileInputRef.current?.click();
                  }}
                  className="text-[var(--accent)] hover:underline font-medium cursor-pointer"
                >
                  Choose another file
                </button>
              </div>
            </div>
          ) : (
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`dropzone-glow bg-[var(--bg-surface)] rounded-[var(--radius-lg)] p-10 sm:p-14 text-center transition-all duration-200 border border-dashed ${
                dragActive
                  ? 'drag-active border-[var(--accent)] bg-[var(--accent-subtle)]'
                  : 'border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
              }`}
              style={{
                backgroundImage: dragActive
                  ? undefined
                  : 'radial-gradient(ellipse at center top, var(--bg-subtle) 0%, transparent 70%)',
              }}
            >
              {isUploading ? (
                <div className="space-y-5 py-4">
                  <div className="w-14 h-14 rounded-[var(--radius-lg)] bg-[var(--accent-subtle)] text-[var(--accent)] flex items-center justify-center mx-auto border border-[var(--accent-border)]">
                    <BarChart3 className="w-7 h-7 animate-pulse" />
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-base sm:text-lg font-semibold text-[var(--text-primary)] block">
                      Preparing your file (internal zero-copy conversion)...
                    </span>
                    <span className="text-sm text-[var(--text-muted)] font-mono block">
                      {uploadProgress}% processed
                    </span>
                  </div>

                  <div className="w-64 mx-auto bg-[var(--bg-subtle)] h-1.5 rounded-full overflow-hidden border border-[var(--border-hairline)]">
                    <div
                      className="bg-[var(--accent)] h-full transition-all duration-200 rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="w-16 h-16 rounded-[var(--radius-xl)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] flex items-center justify-center mx-auto border border-[var(--border-hairline)] shadow-[var(--shadow-card)]">
                    <BarChart3 className="w-7 h-7 text-[var(--accent)]" />
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-base sm:text-lg font-semibold text-[var(--text-primary)] block tracking-tight">
                      Drag and drop your data file here to visualize
                    </span>
                    <span className="text-sm text-[var(--text-muted)] block">
                      CSV, TSV, Parquet, JSON, NDJSON, Excel (.xlsx), or SQLite (.db) up to 10 GB
                    </span>
                  </div>

                  <div className="pt-1">
                    <Button
                      variant="primary"
                      size="lg"
                      leftIcon={<Upload className="w-4 h-4" />}
                      onClick={() => fileInputRef.current?.click()}
                      className="shadow-[0_2px_12px_rgba(253,66,51,0.18)] hover:shadow-[0_4px_20px_rgba(253,66,51,0.25)] transition-shadow duration-200"
                    >
                      Select Dataset File
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Active Dataset Dashboard */}
      {datasetInfo && (
        <div className="space-y-3.5 sm:space-y-4">
          {/* Row 1: Integrated File & Quick-Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-xs shadow-xs">
              <FileSpreadsheet className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span className="font-semibold text-[var(--text-primary)] truncate max-w-[200px] sm:max-w-xs md:max-w-md">
                {datasetInfo.filename}
              </span>
              <span className="text-[var(--text-muted)] font-mono">
                • {formatNumber(datasetInfo.row_count)} rows
              </span>
              <span className="hidden sm:inline text-[var(--text-muted)] font-mono">
                • {formatBytes(datasetInfo.file_size_bytes)}
              </span>
              <span className="hidden md:inline text-[var(--text-muted)]">
                • {columns.length} cols
              </span>
              {aiEnabled && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-[var(--accent)] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--accent-subtle)] border border-[var(--accent-border)] ml-1">
                  <Sparkles className="w-2.5 h-2.5" /> AI Ready
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {onBackToSource && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onBackToSource}
                  className="text-xs h-7.5"
                >
                  Back
                </Button>
              )}
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onHandoffToQuery(datasetInfo.query_id, datasetInfo.filename)}
                className="text-xs h-7.5"
              >
                Query data
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onHandoffToClean(datasetInfo.query_id, datasetInfo.filename)}
                className="text-xs h-7.5"
              >
                Clean data
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleReset}
                className="text-xs h-7.5 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Visualize another file
              </Button>
            </div>
          </div>

          {/* Row 2: Unified Command Bar (Natural Language Prompt input) */}
          <DescribeChartBar
            jobId={datasetInfo.query_id}
            columns={columns}
            pageOptions={pageOptions}
            onChartCreated={handleChartCreatedFromText}
            onHandoffToQuery={() => onHandoffToQuery(datasetInfo.query_id, datasetInfo.filename)}
          />

          {/* Row 3: Streamlined Global Filter Strip */}
          <DataOptionsPanel
            options={pageOptions}
            columns={columns}
            onChange={handlePageOptionsChange}
            onReset={handleResetPageOptions}
            viewTab={viewTab}
            onSwitchTab={handleSwitchTab}
            onAutoVisualize={handleAutoVisualize}
            isAutoVisualizing={isAutoVisualizing}
            onOpenAdvice={handleOpenAdvice}
            loadingAdvice={loadingAdvice}
            onAddChart={handleAddChart}
            isAddingChart={isAddingChart}
            globalColor={globalChartColor}
            onGlobalColorChange={setGlobalChartColor}
          />

          {/* Active Chart Cards Grid */}
          {cards.length > 0 ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 sm:gap-6 pt-1">
              {cards.map((card) => (
                <ChartCard
                  key={card.id}
                  jobId={datasetInfo.query_id}
                  item={card}
                  columns={columns}
                  onUpdateSpec={handleUpdateCardSpec}
                  onResetSpec={handleResetCardSpec}
                  onRemove={handleRemoveCard}
                  onRetry={handleRetryCard}
                  globalColor={globalChartColor}
                />
              ))}
            </div>
          ) : (
            <div className="p-12 text-center rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-muted)] space-y-2">
              <BarChart3 className="w-8 h-8 mx-auto text-[var(--text-muted)]" />
              <p className="text-sm font-medium">No charts currently displayed.</p>
              <p className="text-xs">Click "Auto-visualize", "Add chart", or describe a chart in the prompt bar above.</p>
            </div>
          )}

          {/* Privacy & Escaping Guarantee Footer Notice */}
          <div className="flex items-center justify-center gap-2 pt-2 text-xs text-[var(--text-muted)]">
            <ShieldCheck className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>
              Column names, statistical aggregates, and small samples are sent to Gemini. Full datasets are never sent.
            </span>
          </div>

          {/* Visualization Advice Modal */}
          <VisualizationAdviceModal
            plan={advicePlan}
            isOpen={isAdviceOpen}
            onClose={() => setIsAdviceOpen(false)}
            onCreateChart={handleCreateChartFromAdvice}
            onApplyPrepTip={handleApplyPrepTip}
            pageOptions={pageOptions}
          />
        </div>
      )}
    </div>
  );
};
