import { useRef, useCallback } from 'react';
import type { StreamEvent } from '../lib/types';

interface UseSSEStreamOptions {
  onEvent: (event: StreamEvent) => void;
  onError?: () => void;
}

export function useSSEStream({ onEvent, onError }: UseSSEStreamOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);

  const connect = useCallback((url: string) => {
    disconnect();
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const payload: StreamEvent = JSON.parse(e.data);
        onEvent(payload);

        if (payload.event === 'agent_complete' || payload.event === 'approval_needed') {
          es.close();
          eventSourceRef.current = null;
        }
      } catch (err) {
        console.error('SSE parse error:', err);
      }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      onError?.();
    };
  }, [onEvent, onError]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  return { connect, disconnect };
}
