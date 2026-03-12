import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Maximize2, Search, ZoomIn, ZoomOut } from 'lucide-react';
import type { TenderUpdate } from '@/lib/tenderUpdates';
import { cn } from '@/lib/utils';

type InteractiveGraphProps = {
  tenderName: string;
  tenderRef: string;
  updates: TenderUpdate[];
};

type Lane = 'subcontractor' | 'client';

type Node = {
  id: string;
  label: string;
  type: 'root' | 'lane' | 'actor' | 'update';
  lane?: Lane;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Edge = {
  from: string;
  to: string;
};

const NODE_SIZES = {
  root: { width: 300, height: 56 },
  lane: { width: 190, height: 50 },
  actor: { width: 180, height: 46 },
  update: { width: 210, height: 44 },
};

const LANE_X: Record<Lane, number> = {
  subcontractor: 360,
  client: 1080,
};

function groupByActor(updates: TenderUpdate[]) {
  const groups = new Map<string, TenderUpdate[]>();
  updates.forEach((update) => {
    const key = String(update.actor || 'Unknown').trim() || 'Unknown';
    const bucket = groups.get(key) || [];
    bucket.push(update);
    groups.set(key, bucket);
  });
  return Array.from(groups.entries()).map(([actor, actorUpdates]) => ({
    actor,
    updates: actorUpdates.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
  }));
}

export function InteractiveGraph({ tenderName, tenderRef, updates }: InteractiveGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [search, setSearch] = useState('');
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const { nodes, edges, bounds } = useMemo(() => {
    const root: Node = {
      id: 'root',
      label: `${tenderRef} • ${tenderName}`,
      type: 'root',
      x: 720,
      y: 90,
      ...NODE_SIZES.root,
    };

    const laneNodes: Node[] = [
      { id: 'lane-sub', label: 'Subcontractor', type: 'lane', lane: 'subcontractor', x: LANE_X.subcontractor, y: 240, ...NODE_SIZES.lane },
      { id: 'lane-cli', label: 'Client', type: 'lane', lane: 'client', x: LANE_X.client, y: 240, ...NODE_SIZES.lane },
    ];

    const edgeList: Edge[] = [
      { from: root.id, to: 'lane-sub' },
      { from: root.id, to: 'lane-cli' },
    ];

    const actorNodes: Node[] = [];
    const updateNodes: Node[] = [];

    (['subcontractor', 'client'] as Lane[]).forEach((lane) => {
      const laneGroups = groupByActor(updates.filter((update) => update.type === lane));
      const actorSpacing = 250;
      const actorStartX = LANE_X[lane] - ((laneGroups.length - 1) * actorSpacing) / 2;

      laneGroups.forEach((group, actorIndex) => {
        const actorId = `${lane}-actor-${actorIndex}`;
        const actorX = actorStartX + actorIndex * actorSpacing;
        const actorY = 390;

        actorNodes.push({
          id: actorId,
          label: group.actor,
          type: 'actor',
          lane,
          x: actorX,
          y: actorY,
          ...NODE_SIZES.actor,
        });

        edgeList.push({ from: lane === 'subcontractor' ? 'lane-sub' : 'lane-cli', to: actorId });

        group.updates.forEach((update, updateIndex) => {
          const updateId = `${lane}-update-${update.id}`;
          const updateY = 520 + updateIndex * 110;
          updateNodes.push({
            id: updateId,
            label: `${update.subType} • ${update.date}`,
            type: 'update',
            lane,
            x: actorX,
            y: updateY,
            ...NODE_SIZES.update,
          });
          edgeList.push({ from: actorId, to: updateId });
        });
      });
    });

    const allNodes = [root, ...laneNodes, ...actorNodes, ...updateNodes];
    const minX = Math.min(...allNodes.map((node) => node.x - node.width / 2)) - 120;
    const maxX = Math.max(...allNodes.map((node) => node.x + node.width / 2)) + 120;
    const minY = Math.min(...allNodes.map((node) => node.y - node.height / 2)) - 120;
    const maxY = Math.max(...allNodes.map((node) => node.y + node.height / 2)) + 140;

    return {
      nodes: allNodes,
      edges: edgeList,
      bounds: {
        minX,
        minY,
        width: maxX - minX,
        height: maxY - minY,
      },
    };
  }, [tenderName, tenderRef, updates]);

  const fitToScreen = useMemo(() => {
    return () => {
      const container = containerRef.current;
      if (!container) return;
      const { width, height } = container.getBoundingClientRect();
      if (!width || !height) return;

      const nextScale = Math.max(0.45, Math.min(1.15, Math.min(width / bounds.width, height / bounds.height)));
      const centeredX = (width - bounds.width * nextScale) / 2 - bounds.minX * nextScale;
      const centeredY = (height - bounds.height * nextScale) / 2 - bounds.minY * nextScale;

      setScale(nextScale);
      setOffset({ x: centeredX, y: centeredY });
    };
  }, [bounds]);

  useEffect(() => {
    fitToScreen();
  }, [fitToScreen]);

  const onWheel: React.WheelEventHandler<HTMLDivElement> = (event) => {
    event.preventDefault();
    setScale((prev) => Math.min(2.4, Math.max(0.4, prev - event.deltaY * 0.001)));
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

  const normalizedSearch = search.trim().toLowerCase();
  const hasSearch = normalizedSearch.length > 0;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:min-w-[240px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search actor or update nodes..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setScale((prev) => Math.min(2.4, prev + 0.1))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setScale((prev) => Math.max(0.4, prev - 0.1))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={fitToScreen}>
            <Maximize2 className="h-4 w-4" />
          </Button>
          <span className="max-w-full text-xs text-muted-foreground lg:ml-auto">{tenderName}</span>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-border bg-card/30 backdrop-blur-sm"
        onWheel={onWheel}
        onMouseDown={startDrag}
        onMouseMove={onDrag}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        <svg className="h-full w-full" style={{ cursor: dragging ? 'grabbing' : 'grab' }}>
          <g transform={`translate(${offset.x} ${offset.y}) scale(${scale})`}>
            {edges.map((edge) => {
              const from = nodes.find((node) => node.id === edge.from);
              const to = nodes.find((node) => node.id === edge.to);
              if (!from || !to) return null;

              const fromY = from.y + from.height / 2;
              const toY = to.y - to.height / 2;
              const midY = fromY + (toY - fromY) / 2;
              const path = `M ${from.x} ${fromY} C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${toY}`;

              return (
                <path
                  key={`${edge.from}-${edge.to}`}
                  d={path}
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth="1.6"
                  fill="none"
                  opacity="0.42"
                />
              );
            })}

            {nodes.map((node) => {
              const laneColor = node.lane === 'subcontractor' ? 'hsl(var(--info))' : 'hsl(var(--success))';
              const isRoot = node.type === 'root';
              const isLane = node.type === 'lane';
              const match = hasSearch ? node.label.toLowerCase().includes(normalizedSearch) : true;
              const shouldHighlight = hasSearch && match;
              const opacity = match ? 1 : 0.3;
              const fill = isRoot ? 'hsl(var(--primary))' : isLane ? laneColor : 'hsl(var(--card))';
              const stroke = shouldHighlight
                ? 'hsl(var(--warning))'
                : isRoot
                  ? 'hsl(var(--primary))'
                  : laneColor;
              const textFill = isRoot || isLane ? 'hsl(var(--primary-foreground))' : 'hsl(var(--foreground))';

              return (
                <g key={node.id} opacity={opacity}>
                  <rect
                    x={node.x - node.width / 2}
                    y={node.y - node.height / 2}
                    width={node.width}
                    height={node.height}
                    rx={14}
                    fill={fill}
                    stroke={stroke}
                    strokeWidth={isRoot ? 3 : 2}
                    className={cn(isRoot && 'drop-shadow-[0_0_18px_hsl(var(--primary)/0.4)]')}
                  />
                  <text
                    x={node.x}
                    y={node.y + 4}
                    textAnchor="middle"
                    fontSize={node.type === 'update' ? 12 : 13}
                    fill={textFill}
                  >
                    {node.label}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
