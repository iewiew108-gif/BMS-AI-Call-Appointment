// =============================================================================
// useRetryScheduler — React hook for the 30-minute retry scheduler
// =============================================================================

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  startRetryScheduler,
  stopRetryScheduler,
  registerRetryHandler,
  subscribeRetryScheduler,
  getScheduledRetries,
  isRetryEnabled,
  setRetryEnabled,
  msUntilNextRetry,
  type ScheduledRetry,
  type RetryHandler,
} from '@/services/retryScheduler';

interface UseRetrySchedulerOptions {
  onRetry: RetryHandler;
}

interface UseRetrySchedulerResult {
  scheduledRetries: ScheduledRetry[];
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  /** Human-readable countdown string e.g. "28:42" */
  countdown: string;
}

export function useRetryScheduler({ onRetry }: UseRetrySchedulerOptions): UseRetrySchedulerResult {
  // Sync with external store
  const scheduledRetries = useSyncExternalStore(subscribeRetryScheduler, getScheduledRetries);
  const [enabled, setEnabledState] = useState<boolean>(isRetryEnabled);

  // Countdown string — updated every second
  const [countdown, setCountdown] = useState<string>('—');
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    function updateCountdown() {
      const ms = msUntilNextRetry();
      if (ms === null) {
        setCountdown('—');
        return;
      }
      const totalSec = Math.ceil(ms / 1000);
      const min = Math.floor(totalSec / 60).toString().padStart(2, '0');
      const sec = (totalSec % 60).toString().padStart(2, '0');
      setCountdown(`${min}:${sec}`);
    }

    updateCountdown();
    countdownRef.current = setInterval(updateCountdown, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [scheduledRetries]);

  // Start/stop scheduler lifecycle
  useEffect(() => {
    startRetryScheduler();
    return () => stopRetryScheduler();
  }, []);

  // Register the retry handler
  useEffect(() => {
    const unregister = registerRetryHandler(onRetry);
    return unregister;
  }, [onRetry]);

  const setEnabled = useCallback((v: boolean) => {
    setRetryEnabled(v);
    setEnabledState(v);
  }, []);

  return { scheduledRetries, enabled, setEnabled, countdown };
}
