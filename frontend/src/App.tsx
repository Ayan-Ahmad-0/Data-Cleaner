import { useEffect, useState } from 'react';
import { Navbar } from './components/Navbar';
import { UploadPage } from './pages/UploadPage';
import { ReportPage } from './pages/ReportPage';
import { ApprovalPage } from './pages/ApprovalPage';
import { ProgressPage } from './pages/ProgressPage';
import { ResultsPage } from './pages/ResultsPage';
import { approveAndClean, getJobDetail, type JobDetailResponse } from './lib/api';

export function App() {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobData, setJobData] = useState<JobDetailResponse | null>(null);

  const [fileMeta, setFileMeta] = useState<{
    name: string;
    size: string;
    rowCount: string;
  }>({
    name: '',
    size: '',
    rowCount: '',
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
            rowCount: detail.profile.file.rows.toLocaleString(),
          }));
        }

        const status = detail.job.status;
        if (status === 'AWAITING_APPROVAL' && currentStep === 1) {
          setCurrentStep(2);
        } else if ((status === 'DONE' || status === 'DONE_WITH_WARNINGS') && currentStep === 4) {
          setCurrentStep(5);
        }
      } catch (err) {
        console.error('Error polling job status:', err);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [jobId, currentStep]);

  const handleUploadComplete = (info: { id: string; name: string; size: string; rowCount: string }) => {
    setJobId(info.id);
    setFileMeta({
      name: info.name,
      size: info.size,
      rowCount: info.rowCount,
    });
    // Immediately fetch initial job details
    getJobDetail(info.id).then(setJobData).catch(console.error);
    setCurrentStep(2);
  };

  const handleStartCleaning = async () => {
    if (!jobId) return;
    try {
      await approveAndClean(jobId);
      setCurrentStep(4);
    } catch (err) {
      console.error('Failed to trigger cleaning:', err);
    }
  };

  const handleRestart = () => {
    setJobId(null);
    setJobData(null);
    setFileMeta({ name: '', size: '', rowCount: '' });
    setCurrentStep(1);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg)] text-[var(--text)]">
      <Navbar
        currentStep={currentStep}
        onSelectStep={(step) => setCurrentStep(step)}
        fileName={fileMeta.name}
        fileSize={fileMeta.size}
        rowCount={fileMeta.rowCount}
      />

      <main className="flex-1">
        {currentStep === 1 && (
          <UploadPage onUploadComplete={handleUploadComplete} />
        )}
        {currentStep === 2 && (
          <ReportPage
            jobData={jobData}
            onProceedToApproval={() => setCurrentStep(3)}
          />
        )}
        {currentStep === 3 && (
          <ApprovalPage
            jobData={jobData}
            onStartCleaning={handleStartCleaning}
          />
        )}
        {currentStep === 4 && (
          <ProgressPage jobData={jobData} />
        )}
        {currentStep === 5 && (
          <ResultsPage jobData={jobData} onRestart={handleRestart} />
        )}
      </main>
    </div>
  );
}

export default App;
