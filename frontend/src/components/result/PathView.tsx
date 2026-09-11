import '../../design/graph-reveal.css';
import { routeEdge, type NodeRect } from './routeEdges';
import { GraphNodeCard } from './GraphNodeCard';
import { CardDecoration } from '../ui/CardDecoration';
import { AimOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { ArrowRightOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useLayoutEffect, useRef, useState } from 'react';
import type { CompletionResult, KnowledgeNode } from '../../api/types';


interface PathViewProps {
    result: CompletionResult;
    onOpenNode: (node: KnowledgeNode) => void;
}
export function PathView({ result, onOpenNode }: PathViewProps) {
    const rows = new Map<number, KnowledgeNode[]>();
    for (const node of result.nodes) {
        const list = rows.get(node.level) ?? [];
        list.push(node);
        rows.set(node.level, list);
    }
    const levels = [...rows.keys()].sort((a, b) => a - b);
    if (result.missingCount === 0 && result.nodes.length === 1) {
        const target = result.nodes[0];
        return (<div className="uiverse-parent"><section className="all-clear enter uiverse-card"><CardDecoration icon={<CheckCircleOutlined />}/><div className="uiverse-content">

        <span className="badge">可以直接开始</span>
        <h2>所有前置知识都已掌握</h2>
        <p>
          你不需要再补前置内容，可以从目标知识
          <em>「{result.target}」</em> 开始学习。第一版不会为目标搜索资料。
        </p>
        <div className="uiverse-parent"><Button htmlType="button" className="node-card target all-clear-target uiverse-card" onClick={() => onOpenNode(target)}><CardDecoration icon={<AimOutlined />}/><span className="uiverse-content">

          <span className="node-tag">学习目标</span>
          <strong>{target.name}</strong>
          <small>查看目标说明</small>
        </span></Button></div>
      </div></section></div>);
    }
    return (<DependencyGraph result={result} onOpenNode={onOpenNode} rows={rows} levels={levels}/>);
}
function DependencyGraph({ result, onOpenNode, rows, levels, }: PathViewProps & {
    rows: Map<number, KnowledgeNode[]>;
    levels: number[];
}) {
    const graphRef = useRef<HTMLDivElement>(null);
    const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
    const [lines, setLines] = useState<PathLine[]>([]);
    const [size, setSize] = useState({ width: 0, height: 0 });
    useLayoutEffect(() => {
        let frame = 0;
        const measure = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const graph = graphRef.current;
                if (!graph)
                    return;
                const graphRect = graph.getBoundingClientRect();
                const cards: NodeRect[] = [...nodeRefs.current.entries()].map(([id, button]) => {
                    const rect = (button.querySelector('.graph-node-card') ?? button).getBoundingClientRect();
                    return { id, left: rect.left - graphRect.left, right: rect.right - graphRect.left,
                        top: rect.top - graphRect.top, bottom: rect.bottom - graphRect.top };
                });
                const nextLines = result.edges.flatMap((edge, index) => {
                    const from = cards.find(card => card.id === edge.from);
                    const to = cards.find(card => card.id === edge.to);
                    if (!from || !to) return [];
                    const points = routeEdge(from, to, cards);
                    if (!points.length) return [];
                    const start = { x: (from.left + from.right) / 2, y: from.bottom };
                    const end = { x: (to.left + to.right) / 2, y: to.top };
                    points.unshift(start);
                    points.push(end);
                    return [{ start, end, key: `${edge.from}-${edge.to}-${index}`,
                        d: points.map((point, i) => `${i ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ') }];
                });
                setLines(nextLines);
                setSize({ width: graphRect.width, height: graphRect.height });
            });
        };
        measure();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        if (graphRef.current)
            observer?.observe(graphRef.current);
        for (const node of nodeRefs.current.values())
            observer?.observe(node);
        window.addEventListener('resize', measure);
        return () => {
            cancelAnimationFrame(frame);
            observer?.disconnect();
            window.removeEventListener('resize', measure);
        };
    }, [result.edges, result.nodes]);
    const names = new Map(result.nodes.map((node) => [node.id, node.name]));
    const visibleEdges = result.edges.filter((edge) => names.has(edge.from) && names.has(edge.to));
    return (<section className="path" aria-label="完整知识图谱">
      <div className="path-scroll" tabIndex={0} role="region" aria-label="知识图谱，可横向滚动">
      <div className="path-graph" ref={graphRef} style={{ minWidth: `${Math.min(5, Math.max(...[...rows.values()].map(nodes => nodes.length))) * 324 + 8}px` }}>
        <svg className="path-edges" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true" focusable="false">
          {lines.map((line) => (<g key={line.key}>
            <path className="graph-branch-line" pathLength={1} d={line.d}/>
          </g>))}
        </svg>
        {levels.map((level) => {
            const nodes = rows.get(level) ?? [];
            return (<div className="path-level" key={level}>
              <span className="path-level-label">第 {level + 1} 级</span>
              <div className={`path-row ${nodes.length === 1 ? 'single' : ''}`}>
                {nodes.map((node) => (<GraphNodeCard key={`${result.sessionId}:${node.id}`} sessionId={result.sessionId} node={node} onOpen={() => onOpenNode(node)} buttonRef={(element) => {
                    if (element) nodeRefs.current.set(node.id, element);
                    else nodeRefs.current.delete(node.id);
                }} />))}
              </div>
            </div>);
        })}
      </div>
      </div>
      {visibleEdges.length > 0 && (<div className="path-dependencies" aria-label="实际依赖关系">
          <span>依赖关系</span>
          <ul>
            {visibleEdges.map((edge) => (<li key={`${edge.from}-${edge.to}`}>
                {names.get(edge.from)}{' '}
                <ArrowRightOutlined aria-hidden="true"/>{' '}
                {names.get(edge.to)}
              </li>))}
          </ul>
        </div>)}
    </section>);
}
interface PathLine { key: string; d: string; start: { x: number; y: number }; end: { x: number; y: number } }
