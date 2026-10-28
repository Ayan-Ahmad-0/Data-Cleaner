import os

path = r'frontend/src/App.tsx'
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()

target = """import { useEffect, useMemo, useState } from 'react';
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

export function App() {
  const [appMode, setAppMode] = useState<'clean' | 'convert' | 'query' | 'visualize' | 'model'>('clean');
  const [currentStep, setCurrentStep] = useState<number>(1);"""

replacement = """import { useEffect, useMemo, useRef, useState } from 'react';
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
  }, []);"""

# Normalize CRLF
target_crlf = target.replace('\r\n', '\n').replace('\n', '\r\n')
replacement_crlf = replacement.replace('\r\n', '\n').replace('\n', '\r\n')

if target_crlf in text:
    text = text.replace(target_crlf, replacement_crlf, 1)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(text)
    print("SUCCESS")
else:
    print("TARGET NOT FOUND")
