import { useLayoutEffect } from 'react'
import { loadingController } from './loadingController'

/** Declare a pending operation; the shared overlay survives route unmounts. */
export function LoadingScreen({ label = '页面加载中…' }: { label?: string }) {
  useLayoutEffect(() => loadingController.begin(label), [label])
  return null
}
