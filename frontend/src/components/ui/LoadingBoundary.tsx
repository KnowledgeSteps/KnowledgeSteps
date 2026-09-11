import { useSyncExternalStore, type ReactNode } from 'react'
import { loadingController, LOADING_CYCLE_MS, LOADING_FADE_MS } from './loadingController'

export function LoadingBoundary({ children }: { children: ReactNode }) {
  const { visible, fading, label } = useSyncExternalStore(loadingController.subscribe, loadingController.getSnapshot)
  return <>
    <div inert={visible} aria-hidden={visible || undefined}>{children}</div>
    {visible && <div className={`ks-loading-screen${fading ? ' is-fading' : ''}`} style={{ transitionDuration: `${LOADING_FADE_MS}ms` }} role="status" aria-live="polite" aria-busy="true">
      <div className="pattern-waves" aria-hidden="true" />
      <div className="ks-loader" aria-hidden="true" style={{ animationDuration: `${LOADING_CYCLE_MS}ms` }}>
        {Array.from({ length: 9 }, (_, index) => <div className="text" key={index}><span>Loading</span></div>)}
        <div className="line" />
      </div>
      <p>{label}</p>
    </div>}
  </>
}
