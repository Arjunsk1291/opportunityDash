import { useEffect, useMemo, useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProjectUpdate, ProjectUpdateType } from '@/lib/tenderUpdates';

type UpdateTimelineProps = {
  updates: ProjectUpdate[];
};

type TreeNode = ProjectUpdate & {
  children: TreeNode[];
};

type PositionMap = Record<string, { x: number; y: number }>;

const NODE_W = 230;
const NODE_H = 170;
const H_GAP = 90;
const V_GAP = 110;
const PAD = 80;

const TYPE_CONFIG: Record<ProjectUpdateType, { label: string; emoji: string; bg: string; border: string }> = {
  vendor_contacted: { label: 'Vendor Contacted', emoji: '📞', bg: '#1E3A8A', border: '#60A5FA' },
  vendor_response: { label: 'Vendor Response', emoji: '💬', bg: '#064E3B', border: '#34D399' },
  vendor_finalized: { label: 'Vendor Finalized', emoji: '📌', bg: '#064E25', border: '#4ADE80' },
  extension_requested: { label: 'Extension Requested', emoji: '⏳', bg: '#78350F', border: '#FBBF24' },
  due_date_changed: { label: 'Due Date Changed', emoji: '🗓️', bg: '#3B0764', border: '#A78BFA' },
  status_update: { label: 'Status Update', emoji: '📡', bg: '#1E293B', border: '#94A3B8' },
  general_note: { label: 'General Note', emoji: '📝', bg: '#27272A', border: '#A1A1AA' },
};

const decisionStyles: Record<string, React.CSSProperties> = {
  accepted: { background: 'rgba(34,197,94,0.18)', color: '#86EFAC', border: '1px solid rgba(74,222,128,0.45)' },
  rejected: { background: 'rgba(239,68,68,0.18)', color: '#FCA5A5', border: '1px solid rgba(248,113,113,0.45)' },
  negotiating: { background: 'rgba(245,158,11,0.18)', color: '#FCD34D', border: '1px solid rgba(251,191,36,0.45)' },
};

function buildForest(updates: ProjectUpdate[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  updates.forEach((update) => {
    nodes.set(update.id, { ...update, children: [] });
  });

  const roots: TreeNode[] = [];
  nodes.forEach((node) => {
    const parentId = String(node.parentUpdateId || '').trim();
    if (parentId && nodes.has(parentId)) {
      nodes.get(parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortTree = (treeNode: TreeNode) => {
    treeNode.children.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    treeNode.children.forEach(sortTree);
  };

  roots.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  roots.forEach(sortTree);
  return roots;
}

function subtreeWidth(node: TreeNode): number {
  if (!node.children.length) return NODE_W;
  return node.children.reduce((sum, child, index) => sum + subtreeWidth(child) + (index > 0 ? H_GAP : 0), 0);
}

function assignPositions(node: TreeNode, offsetX: number, depth: number, positions: PositionMap): number {
  const width = subtreeWidth(node);
  const y = depth * (NODE_H + V_GAP) + PAD;

  if (!node.children.length) {
    positions[node.id] = { x: offsetX, y };
    return width;
  }

  let childOffset = offsetX;
  node.children.forEach((child) => {
    const childWidth = subtreeWidth(child);
    assignPositions(child, childOffset, depth + 1, positions);
    childOffset += childWidth + H_GAP;
  });

  const first = positions[node.children[0].id];
  const last = positions[node.children[node.children.length - 1].id];
  positions[node.id] = {
    x: ((first.x + last.x) / 2),
    y,
  };

  return width;
}

function measureCanvas(roots: TreeNode[], positions: PositionMap) {
  let offsetX = PAD;
  roots.forEach((root, index) => {
    assignPositions(root, offsetX, 0, positions);
    offsetX += subtreeWidth(root) + (index < roots.length - 1 ? H_GAP * 2 : 0);
  });

  const coords = Object.values(positions);
  const maxX = coords.length ? Math.max(...coords.map((pos) => pos.x + NODE_W / 2)) + PAD : NODE_W + PAD * 2;
  const maxY = coords.length ? Math.max(...coords.map((pos) => pos.y + NODE_H)) + PAD : NODE_H + PAD * 2;
  return { width: maxX, height: maxY };
}

function formatShortDate(value?: string) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

const summaryLineClamp: React.CSSProperties = {
  display: '-webkit-box',
  WebkitLineClamp: 3,
  WebkitBoxOrient: 'vertical',
  overflow: 'hidden',
};

export function UpdateTimeline({ updates }: UpdateTimelineProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const transformRef = useRef({ x: 40, y: 40, scale: 1 });
  const [transform, setTransformState] = useState(transformRef.current);

  const setTransform = (next: typeof transform | ((current: typeof transform) => typeof transform)) => {
    const resolved = typeof next === 'function' ? next(transformRef.current) : next;
    transformRef.current = resolved;
    setTransformState(resolved);
  };

  const { roots, positions, canvasW, canvasH } = useMemo(() => {
    const forest = buildForest(updates);
    const nextPositions: PositionMap = {};
    const canvas = measureCanvas(forest, nextPositions);
    return { roots: forest, positions: nextPositions, canvasW: canvas.width, canvasH: canvas.height };
  }, [updates]);

  const fitToScreen = () => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const padding = 0.1;
    const scale = clamp(Math.min((bounds.width * (1 - padding)) / canvasW, (bounds.height * (1 - padding)) / canvasH), 0.08, 6);
    const x = (bounds.width - canvasW * scale) / 2;
    const y = (bounds.height - canvasH * scale) / 2;
    setTransform({ x, y, scale });
  };

  useEffect(() => {
    fitToScreen();
  }, [canvasW, canvasH]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;

      setTransform((current) => {
        const factor = event.deltaY < 0 ? 1.12 : 0.9;
        const newScale = clamp(current.scale * factor, 0.08, 6);
        const ratio = newScale / current.scale;
        return {
          scale: newScale,
          x: mouseX - ratio * (mouseX - current.x),
          y: mouseY - ratio * (mouseY - current.y),
        };
      });
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  const handleMouseDown: React.MouseEventHandler<HTMLDivElement> = (event) => {
    const startX = event.clientX;
    const startY = event.clientY;
    const startTransform = transformRef.current;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setTransform({
        ...transformRef.current,
        x: startTransform.x + (moveEvent.clientX - startX),
        y: startTransform.y + (moveEvent.clientY - startY),
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  if (!updates.length) {
    return (
      <div style={{ minHeight: 480, display: 'grid', placeItems: 'center', background: '#080E1A', borderRadius: 18, border: '1px solid rgba(148,163,184,0.18)' }}>
        <div style={{ textAlign: 'center', color: '#CBD5E1' }}>
          <FileText style={{ width: 28, height: 28, margin: '0 auto 12px' }} />
          <div style={{ fontSize: 18, fontWeight: 600 }}>No updates logged yet</div>
        </div>
      </div>
    );
  }

  const renderEdges = (node: TreeNode): JSX.Element[] => {
    const result: JSX.Element[] = [];
    const source = positions[node.id];
    if (!source) return result;

    node.children.forEach((child) => {
      const target = positions[child.id];
      if (!target) return;
      const sourceX = source.x;
      const sourceY = source.y + NODE_H;
      const targetX = target.x;
      const targetY = target.y;
      const midY = sourceY + (targetY - sourceY) / 2;
      const config = TYPE_CONFIG[node.updateType];
      const d = `M ${sourceX} ${sourceY} C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`;

      result.push(
        <g key={`${node.id}-${child.id}`}>
          <path d={d} fill="none" stroke={config.border} strokeOpacity={0.22} strokeWidth={8} />
          <path d={d} fill="none" stroke={config.border} strokeWidth={2.5} markerEnd="url(#tracker-arrow)" />
          <circle cx={sourceX} cy={sourceY} r={5} fill={config.border} />
        </g>
      );
      result.push(...renderEdges(child));
    });
    return result;
  };

  const renderNodes = (node: TreeNode): JSX.Element[] => {
    const pos = positions[node.id];
    if (!pos) return [];
    const config = TYPE_CONFIG[node.updateType];
    const x = pos.x - NODE_W / 2;
    const y = pos.y;
    const isRoot = !node.parentUpdateId;

    const bodyBlocks: JSX.Element[] = [];
    if (node.vendorName) {
      bodyBlocks.push(<div key="vendor" style={{ color: '#F8FAFC', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{node.vendorName}</div>);
    }
    if (node.contactDate) bodyBlocks.push(<div key="contact" style={{ color: '#94A3B8', fontSize: 12, marginBottom: 6 }}>📅 Contact: {formatShortDate(node.contactDate)}</div>);
    if (node.responseDate) bodyBlocks.push(<div key="response" style={{ color: '#94A3B8', fontSize: 12, marginBottom: 6 }}>📨 Response: {formatShortDate(node.responseDate)}</div>);
    if (node.finalizedDate) bodyBlocks.push(<div key="finalized" style={{ color: '#94A3B8', fontSize: 12, marginBottom: 6 }}>✅ Finalized: {formatShortDate(node.finalizedDate)}</div>);
    if (node.responseDetails) {
      bodyBlocks.push(
        <div key="response-details" style={{ background: '#131C2E', color: '#CBD5E1', borderRadius: 12, padding: '10px 12px', fontSize: 12, marginBottom: 8, ...summaryLineClamp }}>
          {node.responseDetails}
        </div>
      );
    }
    if (node.finalInstructions) {
      bodyBlocks.push(
        <div key="instructions" style={{ background: '#0A1F12', color: '#86EFAC', borderRadius: 12, padding: '10px 12px', fontSize: 12, marginBottom: 8 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8, marginBottom: 4 }}>Final Instructions:</div>
          <div style={summaryLineClamp}>{node.finalInstructions}</div>
        </div>
      );
    }
    if (node.finalDecision) {
      bodyBlocks.push(
        <span key="decision" style={{ ...decisionStyles[node.finalDecision], borderRadius: 999, fontSize: 11, padding: '5px 9px', display: 'inline-block', marginRight: 8, marginBottom: 8 }}>
          {node.finalDecision}
        </span>
      );
    }
    if (typeof node.finalPrice === 'number') {
      bodyBlocks.push(
        <span key="price" style={{ background: 'rgba(59,130,246,0.18)', color: '#93C5FD', border: '1px solid rgba(96,165,250,0.35)', borderRadius: 999, fontSize: 11, padding: '5px 9px', display: 'inline-block', marginBottom: 8 }}>
          ${node.finalPrice.toLocaleString()}
        </span>
      );
    }
    if (node.extensionDate) {
      bodyBlocks.push(<div key="extension" style={{ color: '#FCD34D', fontSize: 12, marginBottom: 8 }}>⏰ {formatShortDate(node.extensionDate)}</div>);
    }
    if (node.notes) {
      bodyBlocks.push(<div key="notes" style={{ color: '#94A3B8', fontSize: 12, fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.notes}</div>);
    }

    const nodeElement = (
      <foreignObject key={node.id} x={x} y={y} width={NODE_W} height={NODE_H}>
        <div
          style={{
            width: NODE_W,
            height: NODE_H,
            borderRadius: 20,
            overflow: 'hidden',
            border: `2px solid ${config.border}`,
            background: '#0B1220',
            boxShadow: isRoot ? `0 0 0 1px rgba(255,255,255,0.04), 0 18px 50px color-mix(in srgb, ${config.border} 33%, transparent)` : '0 18px 50px rgba(0,0,0,0.22)',
          }}
        >
          <div style={{ background: config.bg, color: '#E2E8F0', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', display: 'flex', gap: 6, alignItems: 'center' }}>
                <span>{config.emoji}</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{config.label}</span>
              </div>
            </div>
            {!node.parentUpdateId && (
              <span style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', borderRadius: 999, padding: '4px 8px', background: 'rgba(255,255,255,0.14)' }}>
                Root
              </span>
            )}
          </div>
          <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', height: NODE_H - 52 }}>
            <div style={{ flex: 1, minHeight: 0 }}>{bodyBlocks}</div>
            <div style={{ borderTop: '1px solid rgba(148,163,184,0.18)', paddingTop: 8, color: '#64748B', fontSize: 11, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(node.updatedBy || 'unknown').split('@')[0]}</span>
              <span>{formatShortDate(node.createdAt)}</span>
            </div>
          </div>
        </div>
      </foreignObject>
    );

    return [nodeElement, ...node.children.flatMap(renderNodes)];
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
        <Button variant="outline" size="sm" onClick={() => setTransform((current) => ({ ...current, scale: clamp(current.scale * 1.15, 0.08, 6) }))}>+</Button>
        <Button variant="outline" size="sm" onClick={() => setTransform((current) => ({ ...current, scale: clamp(current.scale / 1.15, 0.08, 6) }))}>-</Button>
        <Button variant="outline" size="sm" onClick={fitToScreen}>Fit to Screen</Button>
      </div>

      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        style={{
          position: 'relative',
          minHeight: 560,
          height: '70vh',
          overflow: 'hidden',
          borderRadius: 20,
          border: '1px solid rgba(148,163,184,0.18)',
          background: '#080E1A',
          cursor: 'grab',
        }}
      >
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0 }}>
          <defs>
            <pattern id="tracker-grid" width="26" height="26" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.1" fill="rgba(148,163,184,0.16)" />
            </pattern>
            <marker id="tracker-arrow" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" fill="#94A3B8" />
            </marker>
          </defs>
          <rect width="100%" height="100%" fill="url(#tracker-grid)" />
        </svg>

        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: canvasW,
            height: canvasH,
            transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
            transformOrigin: '0 0',
          }}
        >
          <svg width={canvasW} height={canvasH}>
            <defs>
              <marker id="tracker-arrow" markerWidth="10" markerHeight="10" refX="7" refY="5" orient="auto">
                <path d="M0,0 L10,5 L0,10 z" fill="#94A3B8" />
              </marker>
            </defs>
            {roots.flatMap(renderEdges)}
            {roots.flatMap(renderNodes)}
          </svg>
        </div>

        <div style={{ position: 'absolute', left: 14, bottom: 12, color: '#CBD5E1', fontSize: 12, background: 'rgba(15,23,42,0.72)', padding: '6px 10px', borderRadius: 999 }}>
          {Math.round(transform.scale * 100)}%
        </div>
        <div style={{ position: 'absolute', right: 14, bottom: 12, color: '#94A3B8', fontSize: 12 }}>
          Scroll to zoom · Drag to pan
        </div>
      </div>
    </div>
  );
}
