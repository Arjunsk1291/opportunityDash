import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';
import type { TenderUpdate } from '@/lib/tenderUpdates';
import { cn } from '@/lib/utils';

type InteractiveGraphProps = {
  tenderName: string;
  tenderRef: string;
  updates: TenderUpdate[];
};

type Node = {
  id: string;
  label: string;
  type: 'root' | 'lane' | 'update';
  lane?: 'subcontractor' | 'client';
  x: number;
  y: number;
};

export function InteractiveGraph({ tenderName, tenderRef, updates }: InteractiveGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [search, setSearch] = useState('');

  const { nodes, edges } = useMemo(() => {
    const laneNodes: Node[] = [
      { id: 'lane-sub', label: 'Subcontractor', type: 'lane', lane: 'subcontractor', x: 120, y: 140 },
      { id: 'lane-cli', label: 'Client', type: 'lane', lane: 'client', x: 520, y: 140 },
    ];
    const root: Node = { id: 'root', label: `${tenderRef} • ${tenderName}`, type: 'root', x: 320, y: 40 };

    const subUpdates = updates.filter((u) => u.type === 'subcontractor');
    const clientUpdates = updates.filter((u) => u.type === 'client');

    const updateNodes: Node[] = [
      ...subUpdates.map((u, idx) => ({
        id: `sub-${u.id}`,
        label: `${u.subType} · ${u.date}`,
        type: 'update',
        lane: 'subcontractor',
        x: 120,
        y: 220 + idx * 70,
      })),
      ...clientUpdates.map((u, idx) => ({
        id: `cli-${u.id}`,
        label: `${u.subType} · ${u.date}`,
        type: 'update',
        lane: 'client',
        x: 520,
        y: 220 + idx * 70,
      })),
    ];

    const edgeList = [
      { from: root.id, to: laneNodes[0].id },
      { from: root.id, to: laneNodes[1].id },
      ...updateNodes.filter((n) => n.lane === 'subcontractor').map((n) => ({ from: laneNodes[0].id, to: n.id })),
      ...updateNodes.filter((n) => n.lane === 'client').map((n) => ({ from: laneNodes[1].id, to: n.id })),
    ];

    return { nodes: [root, ...laneNodes, ...updateNodes], edges: edgeList };
  }, [tenderName, tenderRef, updates]);

  const onWheel: React.WheelEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setScale((prev) => Math.min(2.2, Math.max(0.6, prev - event.deltaY * 0.001)));
  };

  const startDrag: React.MouseEventHandler<HTMLDivElement> = (event) => {
    setDragging(true);
    setDragStart({ x: event.clientX - offset.x, y: event.clientY - offset.y });
  };

  const onDrag: React.MouseEventHandler<HTMLDivElement> = (event) => {
    if (!dragging) return;
    setOffset({ x: event.clientX - dragStart.x, y: event.clientY - dragStart.y });
  };

  const endDrag = () => setDragging(false);

  const fitToScreen = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  const normalizedSearch = search.trim().toLowerCase();

  return (
    <div className="h-full w-full flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="icon" onClick={() => setScale((prev) => Math.min(2.2, prev + 0.1))}>
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={() => setScale((prev) => Math.max(0.6, prev - 0.1))}>
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={fitToScreen}>
          <Maximize2 className="h-4 w-4" />
        </Button>
        <span className="ml-auto text-xs text-muted-foreground truncate">{tenderName}</span>
      </div>

      <div
        ref={containerRef}
        className="relative flex-1 rounded-xl border border-border bg-card/30 backdrop-blur-sm overflow-hidden"
        onWheel={onWheel}
        onMouseDown={startDrag}
        onMouseMove={onDrag}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        <svg
          className="w-full h-full"
          style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        >
          <g transform={`translate(${offset.x} ${offset.y}) scale(${scale})`}>
            {edges.map((edge) => {
              const from = nodes.find((n) => n.id === edge.from);
              const to = nodes.find((n) => n.id === edge.to);
              if (!from || !to) return null;
              const midX = (from.x + to.x) / 2;
              const path = `M ${from.x} ${from.y + 24} C ${midX} ${from.y + 60}, ${midX} ${to.y - 30}, ${to.x} ${to.y}`;
              return (
                <path
                  key={`${edge.from}-${edge.to}`}
                  d={path}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth="1.5"
                  fill="none"
                  opacity="0.5"
                />
              );
            })}
            {nodes.map((node) => {
              const match = normalizedSearch ? node.label.toLowerCase().includes(normalizedSearch) : true;
              const baseOpacity = match ? 1 : 0.3;
              const isRoot = node.type === 'root';
              const isLane = node.type === 'lane';
              const stroke = isRoot ? 'hsl(var(--primary))' : node.lane === 'subcontractor' ? 'hsl(var(--info))' : 'hsl(var(--success))';
              const fill = isRoot ? 'hsl(var(--primary))' : 'hsl(var(--card))';
              return (
                <g key={node.id} opacity={baseOpacity}>
                  <rect
                    x={node.x - 110}
                    y={node.y - 20}
                    width={220}
                    height={40}
                    rx={12}
                    fill={fill}
                    stroke={match ? 'hsl(var(--warning))' : stroke}
                    strokeWidth={isRoot ? 3 : 2}
                    className={cn(isRoot && 'drop-shadow-[0_0_12px_hsl(var(--primary)/0.45)]')}
                  />
                  <text
                    x={node.x}
                    y={node.y + 5}
                    textAnchor="middle"
                    fontSize="12"
                    fill={isRoot ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))'}
                  >
                    {node.label}
                  </text>
                  {isLane && (
                    <text
                      x={node.x}
                      y={node.y + 20}
                      textAnchor="middle"
                      fontSize="10"
                      fill={node.lane === 'subcontractor' ? 'hsl(var(--info))' : 'hsl(var(--success))'}
                    >
                      Lane
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
