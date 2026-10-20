import { useEffect, useMemo, useState } from 'react';
import { Navbar } from './components/Navbar';
import { UploadPage } from './pages/UploadPage';
import { ReportPage } from './pages/ReportPage';
import { ApprovalPage } from './pages/ApprovalPage';
import { ProgressPage } from './pages/ProgressPage';
import { ResultsPage } from './pages/ResultsPage';
import { ConvertPage } from './pages/ConvertPage';
import { approveAndClean, getJobDetail, type JobDetailResponse } from './lib/api';
import { formatNumber } from './lib/format';

export function App() {
  const [appMode, setAppMode] = useState<'clean' | 'convert'>('clean');
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<JobDetailResponse | null>(null);

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

      <main className="flex-1">
        {/* Centered Mode Switcher (Clean Data vs Convert Only) - visible when selecting mode or uploading */}
        {currentStep === 1 && (
          <div className="pt-3 sm:pt-4 pb-0 flex justify-center items-center">
            <div className="inline-flex items-center bg-[var(--bg-subtle)] p-1.5 rounded-[var(--radius-md)] hairline-border shadow-xs">
              <button
                type="button"
                onClick={() => setAppMode('clean')}
                className={`px-5 py-2 text-sm sm:text-base font-semibold rounded-[var(--radius-sm)] transition-all cursor-pointer select-none ${
                  appMode === 'clean'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                Clean Data
              </button>
              <button
                type="button"
                onClick={() => setAppMode('convert')}
                className={`px-5 py-2 text-sm sm:text-base font-semibold rounded-[var(--radius-sm)] transition-all cursor-pointer select-none ${
                  appMode === 'convert'
                    ? 'bg-[var(--accent)] text-white shadow-sm'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                }`}
              >
                Convert Only
              </button>
            </div>
          </div>
        )}

        {appMode === 'convert' ? (
          <ConvertPage onHandoffToClean={handleHandoffToClean} />
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
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
