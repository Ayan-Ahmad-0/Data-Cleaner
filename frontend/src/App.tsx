import { useEffect, useMemo, useRef, useState } from 'react';
import { Navbar } from './components/Navbar';
import { UploadPage } from './pages/UploadPage';
import { ReportPage } from './pages/ReportPage';
import { ApprovalPage } from './pages/ApprovalPage';
import { ProgressPage } from './pages/ProgressPage';
import { ResultsPage } from './pages/ResultsPage';
import { ConvertPage } from './pages/ConvertPage';
import { QueryPage } from './pages/QueryPage';
import { VisualizePage } from './pages/VisualizePage';
import { ModelPage } from './pages/ModelPage';
import {
  approveAndClean,
  getJobDetail,
  type JobDetailResponse,
  type QueryUploadResult,
  type QueryHandoffResult,
} from './lib/api';
import { formatNumber } from './lib/format';

type AppMode = 'clean' | 'convert' | 'query' | 'visualize' | 'model';

function parseHashState(): { mode: AppMode; step: number } {
  if (typeof window === 'undefined') return { mode: 'clean', step: 1 };
  const hash = window.location.hash.replace(/^#/, '');
  const [modePart, queryPart] = hash.split('?');
  const validModes: AppMode[] = ['clean', 'convert', 'query', 'visualize', 'model'];
  const mode = validModes.includes(modePart as AppMode) ? (modePart as AppMode) : 'clean';
  let step = 1;
  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    const parsedStep = parseInt(params.get('step') || '1', 10);
    if (!isNaN(parsedStep) && parsedStep >= 1 && parsedStep <= 5) {
      step = parsedStep;
    }
  }
  return { mode, step };
}

export function App() {
  const initialHash = parseHashState();
  const [appMode, setAppMode] = useState<AppMode>(initialHash.mode);
  const [currentStep, setCurrentStep] = useState<number>(initialHash.step);
  const isNavigatingFromPopstate = useRef(false);
  const hasInitializedHistory = useRef(false);

  // Synchronize navigation state with browser history for back/forward support
  useEffect(() => {
    if (!hasInitializedHistory.current) {
      hasInitializedHistory.current = true;
      const initialHashStr = `#${appMode}${appMode === 'clean' && currentStep > 1 ? `?step=${currentStep}` : ''}`;
      window.history.replaceState({ appMode, currentStep }, '', initialHashStr);
      return;
    }

    if (isNavigatingFromPopstate.current) {
      isNavigatingFromPopstate.current = false;
      return;
    }

    const nextHash = `#${appMode}${appMode === 'clean' && currentStep > 1 ? `?step=${currentStep}` : ''}`;
    if (window.location.hash !== nextHash) {
      window.history.pushState({ appMode, currentStep }, '', nextHash);
    }
  }, [appMode, currentStep]);

  // Handle browser back and forward button clicks (popstate)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      isNavigatingFromPopstate.current = true;
      if (event.state && event.state.appMode) {
        setAppMode(event.state.appMode);
        if (event.state.currentStep) {
          setCurrentStep(event.state.currentStep);
        }
      } else {
        const { mode, step } = parseHashState();
        setAppMode(mode);
        setCurrentStep(step);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<JobDetailResponse | null>(null);
  const [visualizeTarget, setVisualizeTarget] = useState<QueryUploadResult | null>(null);
  const [visualizeReturnMode, setVisualizeReturnMode] = useState<'clean' | 'convert' | null>(null);
  const [queryTarget, setQueryTarget] = useState<QueryUploadResult | null>(null);
  const [queryInitialSql, setQueryInitialSql] = useState<string | undefined>(undefined);
  const [queryInitialMode, setQueryInitialMode] = useState<'sql' | 'ask_ai'>('ask_ai');

  const [fileMeta, setFileMeta] = useState<{
    name: string;
    sizeFormatted: string;
    rowCountFormatted: string;
  }>({
    name: '',
    sizeFormatted: '',
    rowCountFormatted: '',
  });

  // Polling job detail from FastAPI backend
  useEffect(() => {
    if (!jobId) return;

    const interval = setInterval(async () => {
      try {
        const detail = await getJobDetail(jobId);
        setJobData(detail);

        // Update row count if available from profile
        if (detail.profile?.file?.rows) {
          setFileMeta((prev) => ({
            ...prev,
            rowCountFormatted: formatNumber(detail.profile.file.rows),
          }));
        }

        const status = detail.job.status;
        // Automatic stage transitions
        if (status === 'AWAITING_APPROVAL' && currentStep === 1) {
          setCurrentStep(2);
        } else if ((status === 'DONE' || status === 'DONE_WITH_WARNINGS') && currentStep === 4) {
          setCurrentStep(5);
        } else if (status === 'AWAITING_APPROVAL' && currentStep === 4) {
          // Progress must be linear: if approvals are pending, redirect to Step 3 (Approval)
          setCurrentStep(3);
        }
      } catch (err) {
        console.error('Error polling job status:', err);
      }
    }, 600);

    return () => clearInterval(interval);
  }, [jobId, currentStep]);

  const handleUploadComplete = (info: { id: string; name: string; size: string; rowCount: string }) => {
    setJobId(info.id);
    setFileMeta({
      name: info.name,
      sizeFormatted: info.size,
      rowCountFormatted: info.rowCount,
    });
    // Automatically transition to Step 2 (Profile & Report) upon upload completion
    setCurrentStep(2);

    // Immediately fetch initial job details
    getJobDetail(info.id).then((detail) => {
      setJobData(detail);
    }).catch(console.error);
  };

  const handleStartCleaning = async (customRecipe?: any) => {
    if (!jobId) return;
    try {
      await approveAndClean(jobId, customRecipe);
      setCurrentStep(4);
    } catch (err) {
      console.error('Failed to trigger cleaning:', err);
    }
  };

  const handleRestart = () => {
    setJobId(null);
    setJobData(null);
    setFileMeta({ name: '', sizeFormatted: '', rowCountFormatted: '' });
    setCurrentStep(1);
  };

  const handleHandoffToClean = (cleanJobId: string, filename: string) => {
    setJobId(cleanJobId);
    setFileMeta({
      name: filename,
      sizeFormatted: '',
      rowCountFormatted: '',
    });
    setAppMode('clean');
    setCurrentStep(2);
    getJobDetail(cleanJobId).then((detail) => {
      setJobData(detail);
    }).catch(console.error);
  };

  const handleHandoffToVisualize = (
    targetJobId: string,
    filename: string,
    rowCount?: number,
    fileSize?: number
  ) => {
    setVisualizeTarget({
      query_id: targetJobId,
      filename,
      row_count: rowCount || 0,
      file_size_bytes: fileSize || 0,
      columns: [],
    });
    setVisualizeReturnMode(appMode === 'convert' ? 'convert' : 'clean');
    setAppMode('visualize');
  };

  const handleHandoffToQuery = (
    targetJobId: string,
    filename: string,
    handoff?: QueryHandoffResult,
    initialMode: 'sql' | 'ask_ai' = 'sql'
  ) => {
    setQueryTarget({
      query_id: targetJobId,
      filename: filename,
      row_count: handoff?.row_count || 0,
      columns: handoff?.columns || [],
      file_size_bytes: handoff?.file_size_bytes || 0,
      detected_format: handoff?.detected_format || 'PARQUET',
    });
    setQueryInitialSql(handoff?.sql || 'SELECT * FROM data LIMIT 100;');
    setQueryInitialMode(initialMode);
    setAppMode('query');
  };

  // Determine max step the user is allowed to navigate to
  const maxAllowedStep = useMemo(() => {
    if (!jobId) return 1;
    const status = jobData?.job?.status;
    if (status === 'DONE' || status === 'DONE_WITH_WARNINGS') return 5;
    if (status === 'CLEANING' || status === 'VERIFYING' || status === 'FAILED') return 4;
    // Before cleaning is approved/started, user cannot go past Step 3 (Approval)
    return 3;
  }, [jobId, jobData?.job?.status]);

  const handleSelectStep = (step: number) => {
    if (step <= maxAllowedStep) {
      setCurrentStep(step);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)] font-sans antialiased">
      <Navbar
        appMode={appMode}
        onSelectMode={(mode) => setAppMode(mode)}
        currentStep={currentStep}
        maxAllowedStep={maxAllowedStep}
        onSelectStep={handleSelectStep}
        fileName={fileMeta.name}
        fileSizeFormatted={fileMeta.sizeFormatted}
        rowCountFormatted={fileMeta.rowCountFormatted}
      />

      <main className="flex-1 w-full max-w-full overflow-x-hidden flex flex-col">
        {/* Centered Mode Switcher (Clean Data vs Convert Only vs Query Data vs Visualize Data) - responsive with smooth horizontal touch scroll */}
        {currentStep === 1 && (
          <div className="pt-3 sm:pt-5 pb-2 sm:pb-5 w-full max-w-full px-2 sm:px-4 flex justify-start sm:justify-center items-center overflow-x-auto scrollbar-none touch-pan-x">
            <div className="inline-flex items-center bg-[var(--bg-subtle)] p-1 rounded-[var(--radius-lg)] border border-[var(--border-hairline)] shadow-[var(--shadow-card)] shrink-0 sm:mx-auto w-max">
              {([
                { key: 'clean' as const, label: 'Clean Data' },
                { key: 'convert' as const, label: 'Convert Only' },
                { key: 'query' as const, label: 'Query Data' },
                { key: 'visualize' as const, label: 'Visualize Data' },
                { key: 'model' as const, label: 'Model Data (ERD)' },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setAppMode(tab.key)}
                  className={`relative px-2.5 sm:px-5 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-[var(--radius-md)] transition-all duration-200 cursor-pointer select-none whitespace-nowrap ${
                    appMode === tab.key
                      ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border-t-2 border-t-[var(--accent)] border-x border-b border-x-[var(--border-hairline)] border-b-[var(--border-hairline)]'
                      : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] border-t-2 border-transparent'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {appMode === 'model' ? (
          <ModelPage onHandoffToQuery={handleHandoffToQuery} />
        ) : appMode === 'convert' ? (
          <ConvertPage
            onHandoffToClean={handleHandoffToClean}
            onHandoffToVisualize={handleHandoffToVisualize}
          />
        ) : appMode === 'query' ? (
          <QueryPage
            initialDataset={queryTarget}
            initialSql={queryInitialSql}
            initialMode={queryInitialMode}
            onHandoffToClean={handleHandoffToClean}
          />
        ) : appMode === 'visualize' ? (
          <VisualizePage
            initialDataset={visualizeTarget}
            onHandoffToQuery={(id, name) => handleHandoffToQuery(id, name)}
            onHandoffToClean={handleHandoffToClean}
            onBackToSource={visualizeReturnMode ? () => setAppMode(visualizeReturnMode) : undefined}
          />
        ) : (
          <>
            {currentStep === 1 && (
              <UploadPage onUploadComplete={handleUploadComplete} />
            )}
            {currentStep === 2 && (
              <ReportPage
                jobData={jobData}
                onProceedToApproval={() => setCurrentStep(3)}
                onGoToUpload={() => setCurrentStep(1)}
              />
            )}
            {currentStep === 3 && (
              <ApprovalPage
                jobData={jobData}
                onStartCleaning={handleStartCleaning}
                onGoToUpload={() => setCurrentStep(1)}
              />
            )}
            {currentStep === 4 && (
              <ProgressPage
                jobData={jobData}
                onProceedToResults={() => setCurrentStep(5)}
                onGoToApproval={() => setCurrentStep(3)}
                onRetry={() => handleStartCleaning(jobData?.recipe)}
                onCancel={handleRestart}
                onGoToUpload={() => setCurrentStep(1)}
              />
            )}
            {currentStep === 5 && (
              <ResultsPage
                jobData={jobData}
                onRestart={handleRestart}
                onGoToUpload={() => setCurrentStep(1)}
                onHandoffToVisualize={handleHandoffToVisualize}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
