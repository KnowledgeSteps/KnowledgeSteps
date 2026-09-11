import { CardDecoration } from '../ui/CardDecoration';
import { AimOutlined, BookOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { ArrowRightOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useLayoutEffect, useRef, useState } from 'react';
import type { CompletionResult, KnowledgeNode } from '../../api/types';
const LEVEL_LABELS = { VERY_FAMILIAR: '非常了解 · 已掌握', BASICALLY_KNOW: '基本了解 · 建议巩固', HEARD_OF: '听说过 · 需要补充', DONT_KNOW: '不了解 · 优先学习' } as const;

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
                const nextLines = result.edges.flatMap((edge, index) => {
                    const from = nodeRefs.current.get(edge.from);
                    const to = nodeRefs.current.get(edge.to);
                    if (!from || !to)
                        return [];
                    const fromRect = from.getBoundingClientRect();
                    const toRect = to.getBoundingClientRect();
                    const sourceNode = result.nodes.find(node => node.id === edge.from);
                    const wrappedLevel = result.nodes.some(node => {
                        if (node.level !== sourceNode?.level)
                            return false;
                        const rect = nodeRefs.current.get(node.id)?.getBoundingClientRect();
                        return rect && Math.abs(rect.top - fromRect.top) > 1;
                    });
                    // Wrapped siblings remain parallel: route beside cards, not through them.
                    const sidePath = wrappedLevel
                        ? `M ${fromRect.right - graphRect.left} ${fromRect.top + fromRect.height / 2 - graphRect.top} H ${graphRect.width - 6 - index % 3 * 5} V ${toRect.top + toRect.height / 2 - graphRect.top} H ${toRect.right - graphRect.left}`
                        : undefined;
                    return [
                        {
                            sidePath,
                            key: `${edge.from}-${edge.to}-${index}`,
                            x1: fromRect.left + fromRect.width / 2 - graphRect.left,
                            y1: fromRect.bottom - graphRect.top,
                            x2: toRect.left + toRect.width / 2 - graphRect.left,
                            y2: toRect.top - graphRect.top,
                        },
                    ];
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
      <div className="path-graph" ref={graphRef}>
        <svg className="path-edges" viewBox={`0 0 ${size.width} ${size.height}`} aria-hidden="true" focusable="false">
          <defs>
            <marker id="path-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 z"/>
            </marker>
          </defs>
          {lines.map((line) => (<path key={line.key} d={line.sidePath ?? `M ${line.x1} ${line.y1} C ${line.x1} ${(line.y1 + line.y2) / 2}, ${line.x2} ${(line.y1 + line.y2) / 2}, ${line.x2} ${line.y2}`} markerEnd="url(#path-arrow)"/>))}
        </svg>
        {levels.map((level) => {
            const nodes = rows.get(level) ?? [];
            return (<div className="path-level" key={level}>
              <span className="path-level-label">第 {level + 1} 级</span>
              <div className={`path-row ${nodes.length === 1 ? 'single' : ''}`}>
                {nodes.map((node) => (<div className="uiverse-parent" key={node.id}><Button htmlType="button" ref={(element) => {
                        if (element instanceof HTMLButtonElement)
                            nodeRefs.current.set(node.id, element);
                        else
                            nodeRefs.current.delete(node.id);
                    }} className={`node-card uiverse-card ${node.isTarget ? "target" : ""} ${node.answer === "VERY_FAMILIAR" ? "mastered-node" : ""}`} onClick={() => onOpenNode(node)}><CardDecoration icon={node.isTarget ? <AimOutlined /> : <BookOutlined />}/><span className="uiverse-content">

                    <span className="node-tag">
                      {node.isTarget ? '学习目标' : node.answer ? LEVEL_LABELS[node.answer] : '待自评'}
                    </span>
                    <strong>{node.name}</strong>
                    <small>{node.isTarget || node.resourceLimit === 0 ? '查看节点说明 · 无推荐资料' : `查看资料 · 最多 ${node.resourceLimit} 条`}</small>
                  </span></Button></div>))}
              </div>
            </div>);
        })}
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
interface PathLine {
    sidePath?: string;
    key: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}
