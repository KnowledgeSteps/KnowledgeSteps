import { useCallback, useEffect, useState } from 'react'
import { startRecoverableRead, type ReadRecovery } from '../api/recoverableRead'

interface ReadState<T> extends ReadRecovery { key: string; data: T | null }

export function useRecoverableRead<T>(key: string, read: (signal: AbortSignal) => Promise<T>, shouldPoll?: (data: T) => boolean) {
  const [state, setState] = useState<ReadState<T> | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!key) return
    return startRecoverableRead({
      read, shouldPoll,
      onData: data => setState({ key, data, error: null, retrying: false, retryDelayMs: null }),
      onRecovery: recovery => setState(previous => ({
        key, data: previous?.key === key ? previous.data : null, ...recovery,
      })),
    })
  }, [key, read, shouldPoll, attempt])
  const reload = useCallback(() => {
    setState(previous => previous?.key === key ? { ...previous, error: null, retrying: false, retryDelayMs: null } : null)
    setAttempt(value => value + 1)
  }, [key])
  const visible = state?.key === key ? state : null
  return { data: visible?.data ?? null, error: visible?.error ?? null,
    retrying: visible?.retrying ?? false, retryDelayMs: visible?.retryDelayMs ?? null, reload }
}
