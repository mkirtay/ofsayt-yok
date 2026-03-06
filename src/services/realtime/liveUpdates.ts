type LiveUpdateHandler = () => Promise<boolean> | boolean;

export interface LiveUpdatesController {
  stop: () => void;
}

interface LiveUpdatesOptions {
  initialDelayMs?: number;
  minDelayMs?: number;
  maxDelayMs?: number;
  backoffFactor?: number;
  onUpdateTimestamp?: (timestamp: number) => void;
}

export const startLiveUpdates = (
  onTick: LiveUpdateHandler,
  options: LiveUpdatesOptions = {}
): LiveUpdatesController => {
  const {
    initialDelayMs = 15000,
    minDelayMs = 8000,
    maxDelayMs = 60000,
    backoffFactor = 1.7,
    onUpdateTimestamp,
  } = options;

  let stopped = false;
  let delay = initialDelayMs;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    if (stopped) {
      return;
    }
    timeoutId = setTimeout(run, delay);
  };

  const run = async () => {
    try {
      const result = await onTick();
      const succeeded = result !== false;
      if (succeeded) {
        delay = Math.max(minDelayMs, Math.floor(delay / backoffFactor));
        onUpdateTimestamp?.(Date.now());
      } else {
        delay = Math.min(maxDelayMs, Math.floor(delay * backoffFactor));
      }
    } catch {
      delay = Math.min(maxDelayMs, Math.floor(delay * backoffFactor));
    } finally {
      schedule();
    }
  };

  schedule();

  return {
    stop: () => {
      stopped = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    },
  };
};
