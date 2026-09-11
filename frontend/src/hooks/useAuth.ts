import { useSyncExternalStore } from 'react'
import { getAuthSnapshot, subscribeAuth } from '../api/auth'

export function useAuth() {
  return useSyncExternalStore(subscribeAuth, getAuthSnapshot)
}
