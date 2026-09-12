import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { Button } from 'antd'
import { ApartmentOutlined } from '@ant-design/icons'
import '../../design/example-tree.css'
import { loadingController } from './loadingController'

const nodes = [
  { label: '注意力机制', detail: '理解信息如何聚合', x: 25, y: 330 },
  { label: '位置编码', detail: '为序列提供位置信息', x: 75, y: 330 },
  { label: '矩阵运算', detail: '理解向量间的计算', x: 25, y: 200 },
  { label: '词向量', detail: '将词语表示为向量', x: 75, y: 200 },
  { label: '向量与线性代数', detail: '认识向量和线性变换', x: 25, y: 70 },
  { label: '文本分词', detail: '将文本拆成基本单元', x: 75, y: 70 },
]
const edges = [
  [50, 443, 25, 357], [50, 443, 75, 357],
  [25, 303, 25, 227], [25, 303, 75, 227],
  [25, 173, 25, 97], [75, 173, 75, 97],
]

/** Esca-Byte's branch reveal, adapted to an upward prerequisite graph. */
export function ExampleTree() {
  const clipId = useId()
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const previewCancelled = useRef(false)
  useEffect(() => {
    let started = false
    let startTimer: ReturnType<typeof setTimeout> | undefined
    let endTimer: ReturnType<typeof setTimeout> | undefined
    const checkReady = () => {
      if (startTimer !== undefined) clearTimeout(startTimer)
      if (started || previewCancelled.current || loadingController.getSnapshot().visible) return
      // Wait until the shared loading overlay has gone, so the reveal is visible.
      startTimer = setTimeout(() => {
        if (previewCancelled.current) return
        started = true
        setPreviewing(true)
        endTimer = setTimeout(() => setPreviewing(false), 4000)
      }, 150)
    }
    const unsubscribe = loadingController.subscribe(checkReady)
    checkReady()
    return () => {
      unsubscribe()
      clearTimeout(startTimer)
      clearTimeout(endTimer)
    }
  }, [])
  const expanded = previewing || hovered || focused || pinned
  function stopPreview() { previewCancelled.current = true; setPreviewing(false) }
  function collapse() { stopPreview(); setHovered(false); setFocused(false); setPinned(false) }
  return <div className={`example-tree tooltip-container${expanded ? ' is-expanded' : ''}`}
    onPointerLeave={(event) => { if (event.pointerType === 'mouse') setHovered(false) }}
    onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false) }}
    onKeyDown={(event) => { if (event.key === 'Escape') collapse() }}>
    <div id="example-prerequisites" aria-hidden={!expanded}>
      <svg className="branch-path-svg" viewBox="0 0 100 520" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          {edges.map(([, y1, , y2], index) => <clipPath id={`${clipId}-${index}`} key={index} clipPathUnits="userSpaceOnUse">
            <rect className="branch-reveal" x="0" y={y2 - 4} width="100" height={y1 - y2 + 8}
              style={{ '--delay': `${index * 140}ms` } as CSSProperties} />
          </clipPath>)}
        </defs>
        {edges.map(([x1, y1, x2, y2], index) => <g key={index} clipPath={`url(#${clipId}-${index})`} style={{ '--delay': `${index * 140}ms` } as CSSProperties}>
          <path className={`branch-line ${index % 2 ? 'line-right' : 'line-left'}`}
            d={`M${x1},${y1} C${x1},${(y1 + y2) / 2} ${x2},${(y1 + y2) / 2} ${x2},${y2}`} />
          <ellipse className="branch-dot" cx={x2} cy={y2} rx="0.7" ry="3" />
        </g>)}
      </svg>
      {nodes.map((node, index) => <div className="tooltip-content" key={node.label}
        style={{ left: `${node.x}%`, top: node.y, '--delay': `${200 + index * 160}ms` } as CSSProperties}>
        <div className="tooltip-header">{node.label}</div>
        <div className="tooltip-info">{node.detail}</div>
      </div>)}
    </div>
    <div className="trigger-wrapper">
      <Button className="merge-btn" icon={<ApartmentOutlined />} aria-expanded={expanded} aria-controls="example-prerequisites"
        aria-label={`${pinned ? '收起' : '固定展开'} Transformer 前置知识`}
        onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHovered(true) }}
        onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) setFocused(true) }}
        onClick={() => { stopPreview(); if (pinned) collapse(); else setPinned(true) }}>Transformer</Button>
    </div>
    <p className="example-tree-hint">{expanded ? '沿着分支，向上追溯前置知识' : '靠近或点击 Transformer，展开知识台阶'}</p>
  </div>
}
