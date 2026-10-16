import { useState } from 'react';
import { Navbar } from './components/Navbar';
import { UploadPage } from './pages/UploadPage';
import { ReportPage } from './pages/ReportPage';
import { ApprovalPage } from './pages/ApprovalPage';
import { ProgressPage } from './pages/ProgressPage';
import { ResultsPage } from './pages/ResultsPage';

export function App() {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [fileMeta, setFileMeta] = useState<{
    name: string;
    size: string;
    rowCount: string;
  }>({
    name: 'events_2026.csv',
    size: '1.05 GB',
    rowCount: '15.0M',
  });

  const handleUploadComplete = (meta: { name: string; size: string; rowCount: string }) => {
    setFileMeta(meta);
    setCurrentStep(2);
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
          <ReportPage onProceedToApproval={() => setCurrentStep(3)} />
        )}
        {currentStep === 3 && (
          <ApprovalPage onStartCleaning={() => setCurrentStep(4)} />
        )}
        {currentStep === 4 && (
          <ProgressPage onComplete={() => setCurrentStep(5)} />
        )}
        {currentStep === 5 && (
          <ResultsPage onRestart={() => setCurrentStep(1)} />
        )}
      </main>
    </div>
  );
}

export default App;
