import { useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';

/** Refetch the given query-key prefixes whenever this screen regains focus —
 *  a tab switch or back-navigation. The initial mount is skipped (queries
 *  fetch themselves then). Cached data stays on screen while the fresh call
 *  runs, so navigation feels instant AND the numbers update. */
export function useRefreshOnFocus(...keys: readonly (readonly unknown[])[]) {
  const queryClient = useQueryClient();
  const firstRun = useRef(true);
  // Key prefixes are static per screen — capture once.
  const keysRef = useRef(keys);

  useFocusEffect(
    useCallback(() => {
      if (firstRun.current) {
        firstRun.current = false;
        return;
      }
      for (const key of keysRef.current) {
        void queryClient.invalidateQueries({ queryKey: key as unknown[] });
      }
    }, [queryClient]),
  );
}
