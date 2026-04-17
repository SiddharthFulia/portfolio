import { useState, useEffect, useRef } from 'react';
import { getRateLimitWaitSec, isRateLimited } from './utils';

/**
 * Error display with smart retry:
 * - On rate limit: shows a countdown timer, auto-retries when it expires
 * - On other errors: shows a manual retry button
 */
const ErrorWithRetry = ({ error, onRetry }) => {
  const [countdown, setCountdown] = useState(0);
  const intervalRef = useRef(null);
  const hasAutoRetried = useRef(false);

  useEffect(() => {
    // Check if this is a rate limit error
    if (error && (error.includes('Rate limit') || error.includes('429'))) {
      const wait = isRateLimited() ? getRateLimitWaitSec() : 10;
      setCountdown(wait > 0 ? wait : 10);
      hasAutoRetried.current = false;
    } else {
      setCountdown(0);
    }
  }, [error]);

  useEffect(() => {
    if (countdown <= 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      // Auto-retry once when countdown expires
      if (!hasAutoRetried.current && error && (error.includes('Rate limit') || error.includes('429'))) {
        hasAutoRetried.current = true;
        onRetry?.();
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [countdown, error, onRetry]);

  if (!error) return null;

  const isRateLimit = error.includes('Rate limit') || error.includes('429');

  return (
    <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-xl">
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          isRateLimit ? 'bg-yellow-900/50 text-yellow-500' : 'bg-red-900/50 text-red-400'
        }`}>
          {isRateLimit ? (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {isRateLimit ? (
            <>
              <p className="text-yellow-400 text-sm font-medium">API rate limit reached</p>
              {countdown > 0 ? (
                <div className="mt-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-yellow-500 rounded-full transition-all duration-1000 ease-linear"
                        style={{ width: `${((10 - countdown) / 10) * 100}%` }}
                      />
                    </div>
                    <span className="text-yellow-400 text-xs font-mono shrink-0">{countdown}s</span>
                  </div>
                  <p className="text-gray-500 text-xs mt-1.5">Auto-retrying when cooldown expires...</p>
                </div>
              ) : (
                <div className="mt-2 flex items-center gap-3">
                  <button
                    onClick={onRetry}
                    className="px-3 py-1.5 bg-yellow-600 hover:bg-yellow-500 text-white text-xs font-semibold rounded-lg transition-colors"
                  >
                    Retry Now
                  </button>
                  <span className="text-gray-500 text-xs">Cooldown complete</span>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-red-400 text-sm">{error}</p>
              <button
                onClick={onRetry}
                className="mt-2 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Retry
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorWithRetry;
