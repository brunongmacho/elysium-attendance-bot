/**
 * Debounce Hook with proper cleanup
 */

import { useEffect, useState } from 'react';
import { LEADERBOARD } from '@/lib/constants';

export function useDebounce<T>(value: T, delay: number = LEADERBOARD.DEBOUNCE_DELAY): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    // Set up the timeout
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    // Clean up the timeout if value changes or component unmounts
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
