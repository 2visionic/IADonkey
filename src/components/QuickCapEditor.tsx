import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Square,
  Circle,
  Highlighter,
  Type,
  MoveUpRight,
  Pencil,
  Undo2,
  Redo2,
  Check,
  X,
} from 'lucide-react';

export type QuickCapTool = 'rect' | 'ellipse' | 'highlighter' | 'arrow' | 'pencil' | 'text';
export type ShapeFillMode = 'outline' | 'filled' | 'highlight';

interface Point {
  x: number;
  y: number;
}

interface DrawItem {
  id: string;
  tool: QuickCapTool;
  color: string;
  fillMode?: ShapeFillMode;
  start?: Point;
  end?: Point;
  points?: Point[];
  text?: string;
  fontSize?: number;
}

const BASIC_COLORS = [
  { hex: '#ef4444', label: 'Červená' },
  { hex: '#eab308', label: 'Žlutá' },
  { hex: '#22c55e', label: 'Zelená' },
  { hex: '#3b82f6', label: 'Modrá' },
  { hex: '#a855f7', label: 'Fialová' },
  { hex: '#f97316', label: 'Oranžová' },
  { hex: '#ffffff', label: 'Bílá' },
  { hex: '#111827', label: 'Černá' },
];

const FONT_SIZES = [
  { label: 'S', size: 18 },
  { label: 'M', size: 26 },
  { label: 'L', size: 38 },
  { label: 'XL', size: 54 },
];

const EDITOR_FONT_FAMILY = "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif";

interface QuickCapEditorProps {
  imageUrl: string;
  filePath: string;
  imageWidth: number;
  imageHeight: number;
  onCancel: () => void;
}

export const QuickCapEditor: React.FC<QuickCapEditorProps> = ({
  imageUrl,
  filePath,
  imageWidth,
  imageHeight,
  onCancel,
}) => {
  const [tool, setTool] = useState<QuickCapTool>('rect');
  const [fillMode, setFillMode] = useState<ShapeFillMode>('outline');
  const [color, setColor] = useState<string>('#ef4444');
  const [fontSize, setFontSize] = useState<number>(FONT_SIZES[0].size);

  // Undo / Redo history stacks
  const [items, setItems] = useState<DrawItem[]>([]);
  const [redoStack, setRedoStack] = useState<DrawItem[]>([]);
  const [currentDraft, setCurrentDraft] = useState<DrawItem | null>(null);

  // Active text input state (in canvas coordinates)
  const [activeText, setActiveText] = useState<{
    x: number;
    y: number;
    value: string;
    color: string;
    fontSize: number;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number; scale: number }>({
    width: imageWidth || 800,
    height: imageHeight || 600,
    scale: 1,
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const itemsRef = useRef(items);
  itemsRef.current = items;
  const currentDraftRef = useRef(currentDraft);
  currentDraftRef.current = currentDraft;
  const redoStackRef = useRef(redoStack);
  redoStackRef.current = redoStack;
  const activeTextRef = useRef(activeText);
  activeTextRef.current = activeText;
  const isSavingRef = useRef(isSaving);
  isSavingRef.current = isSaving;

  // Compute responsive display size so the image fits nicely below the top toolbar
  useEffect(() => {
    const computeLayout = () => {
      const maxW = Math.max(320, window.innerWidth - 80);
      const maxH = Math.max(240, window.innerHeight - 140);
      const natW = baseImageRef.current?.naturalWidth || imageWidth || 800;
      const natH = baseImageRef.current?.naturalHeight || imageHeight || 600;
      const scale = Math.min(1, maxW / natW, maxH / natH);
      setDisplaySize({
        width: Math.round(natW * scale),
        height: Math.round(natH * scale),
        scale,
      });
    };

    computeLayout();
    window.addEventListener('resize', computeLayout);
    return () => window.removeEventListener('resize', computeLayout);
  }, [imageWidth, imageHeight]);

  // Draw single item onto 2D context
  const drawItemOnCtx = useCallback((ctx: CanvasRenderingContext2D, item: DrawItem) => {
    ctx.save();
    ctx.strokeStyle = item.color;
    ctx.fillStyle = item.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (item.tool === 'pencil') {
      const pts = item.points || [];
      if (pts.length > 0) {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        if (pts.length === 1) {
          ctx.arc(pts[0].x, pts[0].y, 1, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.stroke();
        }
      }
    } else if (item.tool === 'rect' || item.tool === 'highlighter') {
      if (item.start && item.end) {
        const x = Math.min(item.start.x, item.end.x);
        const y = Math.min(item.start.y, item.end.y);
        const w = Math.abs(item.end.x - item.start.x);
        const h = Math.abs(item.end.y - item.start.y);
        const mode: ShapeFillMode = item.tool === 'highlighter' ? 'highlight' : item.fillMode || 'outline';

        if (mode === 'highlight') {
          ctx.globalAlpha = 0.38;
          ctx.fillRect(x, y, w, h);
        } else if (mode === 'filled') {
          ctx.fillRect(x, y, w, h);
        } else {
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, w, h);
        }
      }
    } else if (item.tool === 'ellipse') {
      if (item.start && item.end) {
        const cx = (item.start.x + item.end.x) / 2;
        const cy = (item.start.y + item.end.y) / 2;
        const rx = Math.abs(item.end.x - item.start.x) / 2;
        const ry = Math.abs(item.end.y - item.start.y) / 2;
        const mode: ShapeFillMode = item.fillMode || 'outline';

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (mode === 'highlight') {
          ctx.globalAlpha = 0.38;
          ctx.fill();
        } else if (mode === 'filled') {
          ctx.fill();
        } else {
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
    } else if (item.tool === 'arrow') {
      if (item.start && item.end) {
        const dx = item.end.x - item.start.x;
        const dy = item.end.y - item.start.y;
        const dist = Math.hypot(dx, dy);
        if (dist >= 4) {
          const angle = Math.atan2(dy, dx);
          // Scale arrow thickness and arrowhead proportionally to drag length (press & release)
          const strokeW = Math.max(2.5, Math.min(10, dist * 0.035));
          const headLen = Math.max(12, Math.min(38, dist * 0.22));
          const headAngle = Math.PI / 6.5;

          const shaftEndX = item.end.x - Math.cos(angle) * (headLen * 0.7);
          const shaftEndY = item.end.y - Math.sin(angle) * (headLen * 0.7);

          ctx.lineWidth = strokeW;
          ctx.beginPath();
          ctx.moveTo(item.start.x, item.start.y);
          ctx.lineTo(shaftEndX, shaftEndY);
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(item.end.x, item.end.y);
          ctx.lineTo(
            item.end.x - headLen * Math.cos(angle - headAngle),
            item.end.y - headLen * Math.sin(angle - headAngle)
          );
          ctx.lineTo(
            item.end.x - headLen * Math.cos(angle + headAngle),
            item.end.y - headLen * Math.sin(angle + headAngle)
          );
          ctx.closePath();
          ctx.fill();
        }
      }
    } else if (item.tool === 'text' && item.text && item.start) {
      const fSize = item.fontSize || FONT_SIZES[0].size;
      ctx.font = `600 ${fSize}px ${EDITOR_FONT_FAMILY}`;
      ctx.textBaseline = 'top';
      const lines = item.text.split('\n');
      const lineHeight = Math.round(fSize * 1.25);
      lines.forEach((line, idx) => {
        ctx.fillText(line, item.start!.x, item.start!.y + idx * lineHeight);
      });
    }

    ctx.restore();
  }, []);

  // Re-render full canvas whenever image, items, or draft changes
  const renderCanvas = useCallback(
    (customItems?: DrawItem[], draft?: DrawItem | null) => {
      const canvas = canvasRef.current;
      const img = baseImageRef.current;
      if (!canvas || !img) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const list = customItems ?? itemsRef.current;
      for (const it of list) {
        drawItemOnCtx(ctx, it);
      }
      const activeDraft = draft !== undefined ? draft : currentDraftRef.current;
      if (activeDraft) {
        drawItemOnCtx(ctx, activeDraft);
      }
    },
    [drawItemOnCtx]
  );

  // Load base image ONCE when imageUrl changes
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      baseImageRef.current = img;
      const natW = img.naturalWidth || imageWidth || 800;
      const natH = img.naturalHeight || imageHeight || 600;
      if (canvasRef.current) {
        canvasRef.current.width = natW;
        canvasRef.current.height = natH;
      }
      const maxW = Math.max(320, window.innerWidth - 80);
      const maxH = Math.max(240, window.innerHeight - 140);
      const scale = Math.min(1, maxW / natW, maxH / natH);
      setDisplaySize({
        width: Math.round(natW * scale),
        height: Math.round(natH * scale),
        scale,
      });
      renderCanvas(itemsRef.current, currentDraftRef.current);
    };
    img.src = imageUrl;
  }, [imageUrl, imageWidth, imageHeight, renderCanvas]);

  useEffect(() => {
    renderCanvas(items, currentDraft);
  }, [items, currentDraft, renderCanvas]);

  // Focus textarea when activeText is created
  useEffect(() => {
    if (activeText && textAreaRef.current) {
      setTimeout(() => {
        textAreaRef.current?.focus();
      }, 10);
    }
  }, [activeText?.x, activeText?.y]);

  const commitActiveText = useCallback((): DrawItem[] => {
    const current = activeTextRef.current;
    if (!current) return itemsRef.current;
    const trimmed = current.value.replace(/\s+$/, '');
    setActiveText(null);
    activeTextRef.current = null;
    if (!trimmed) {
      return itemsRef.current;
    }
    const newItem: DrawItem = {
      id: `txt_${Date.now()}`,
      tool: 'text',
      color: current.color,
      start: { x: current.x, y: current.y },
      text: trimmed,
      fontSize: current.fontSize,
    };
    const updated = [...itemsRef.current, newItem];
    setItems(updated);
    itemsRef.current = updated;
    setRedoStack([]);
    return updated;
  }, []);

  const handleUndo = useCallback(() => {
    if (activeTextRef.current) {
      setActiveText(null);
      activeTextRef.current = null;
      return;
    }
    if (itemsRef.current.length === 0) return;
    const prev = [...itemsRef.current];
    const popped = prev.pop()!;
    setItems(prev);
    itemsRef.current = prev;
    setRedoStack((r) => [...r, popped]);
  }, []);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const nextRedo = [...redoStackRef.current];
    const restored = nextRedo.pop()!;
    setRedoStack(nextRedo);
    redoStackRef.current = nextRedo;
    setItems((prev) => [...prev, restored]);
  }, []);

  const handleSave = useCallback(async () => {
    if (isSavingRef.current) return;
    setIsSaving(true);
    isSavingRef.current = true;

    try {
      const finalItems = commitActiveText();
      renderCanvas(finalItems, null);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dataUrl = canvas.toDataURL('image/png');
      if (window.electronAPI?.saveEditedQuickCap) {
        await window.electronAPI.saveEditedQuickCap({
          filePath,
          dataUrl,
        });
      } else {
        onCancel();
      }
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  }, [commitActiveText, filePath, onCancel, renderCanvas]);

  // Global keyboard shortcuts (Enter to save when not typing text, Ctrl+Z / Ctrl+Y, Escape)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isTyping = Boolean(activeTextRef.current);
      const isDrawing = Boolean(currentDraftRef.current);

      if (e.key === 'Escape') {
        e.preventDefault();
        // 1. Pokud uživatel právě táhne tvar / šipku / čáru se stisknutou myší, Escape pouze zruší tento tah
        if (isDrawing) {
          setCurrentDraft(null);
          currentDraftRef.current = null;
          return;
        }
        // 2. Pokud uživatel právě píše text, Escape rozepsaný text zruší (nezapíše ho)
        if (isTyping) {
          setActiveText(null);
          activeTextRef.current = null;
          return;
        }
        // 3. Jinak (žádná aktivní akce) Escape zavře okno bez uložení
        onCancel();
        return;
      }

      // Undo / Redo when not typing inside textarea
      if (!isTyping && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if (!isTyping && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Enter saves edited screenshot if NOT typing text (when typing text, Enter inserts a newline)
      if (e.key === 'Enter' && !isTyping && !isDrawing) {
        e.preventDefault();
        handleSave();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRedo, handleSave, handleUndo, onCancel]);

  const getCanvasPoint = (e: React.MouseEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: Math.max(0, Math.min(canvas.width, (e.clientX - rect.left) * scaleX)),
      y: Math.max(0, Math.min(canvas.height, (e.clientY - rect.top) * scaleY)),
    };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    const pt = getCanvasPoint(e);

    if (activeText) {
      commitActiveText();
      if (tool === 'text') return;
    }

    if (tool === 'text') {
      setActiveText({
        x: pt.x,
        y: pt.y,
        value: '',
        color,
        fontSize,
      });
      return;
    }

    const draft: DrawItem = {
      id: `draw_${Date.now()}`,
      tool,
      color,
      fillMode: tool === 'highlighter' ? 'highlight' : fillMode,
      start: pt,
      end: pt,
      points: tool === 'pencil' ? [pt] : undefined,
    };
    setCurrentDraft(draft);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!currentDraft) return;
    const pt = getCanvasPoint(e);
    if (currentDraft.tool === 'pencil') {
      setCurrentDraft((prev) =>
        prev
          ? {
              ...prev,
              points: [...(prev.points || []), pt],
            }
          : null
      );
    } else {
      setCurrentDraft((prev) =>
        prev
          ? {
              ...prev,
              end: pt,
            }
          : null
      );
    }
  };

  const handleCanvasMouseUp = () => {
    if (!currentDraft) return;
    const d = currentDraft;
    setCurrentDraft(null);

    if (d.tool === 'pencil') {
      if ((d.points?.length || 0) > 0) {
        setItems((prev) => [...prev, d]);
        setRedoStack([]);
      }
      return;
    }

    if (d.start && d.end) {
      const dist = Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y);
      if (dist >= 3) {
        setItems((prev) => [...prev, d]);
        setRedoStack([]);
      }
    }
  };

  const selectTool = (nextTool: QuickCapTool) => {
    if (activeText) {
      commitActiveText();
    }
    setTool(nextTool);
  };

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden z-50 bg-black/75 flex items-center justify-center"
      style={{ width: '100vw', height: '100vh' }}
      onMouseMove={handleCanvasMouseMove}
      onMouseUp={handleCanvasMouseUp}
      onMouseDown={() => {
        if (activeText) {
          commitActiveText();
        }
      }}
    >
      {/* Top Floating Bar (Unified Spotlight / ScreenRuler / QuickCap style) */}
      <div
        className="fixed top-5 left-1/2 transform -translate-x-1/2 flex items-center gap-2 p-2 px-3.5 rounded-full transition-all pointer-events-auto bg-[#15161c] text-gray-100 select-none z-50 animate-fade-in max-w-[98vw] overflow-x-auto"
        style={{
          boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.55), 0 2px 8px -2px rgba(0, 0, 0, 0.35)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* 1. Drawing Tools */}
        <div className="h-8 flex items-center gap-1 bg-white/[0.05] p-1 rounded-full shrink-0">
          <button
            type="button"
            onClick={() => selectTool('rect')}
            className={`h-6 px-2.5 rounded-full flex items-center gap-1 text-xs font-medium transition cursor-pointer ${
              tool === 'rect' ? 'bg-rose-500 text-white shadow-sm' : 'text-gray-300 hover:text-white hover:bg-white/[0.08]'
            }`}
            title="Obdélník"
          >
            <Square className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Obdélník</span>
          </button>

          <button
            type="button"
            onClick={() => selectTool('ellipse')}
            className={`h-6 px-2.5 rounded-full flex items-center gap-1 text-xs font-medium transition cursor-pointer ${
              tool === 'ellipse' ? 'bg-rose-500 text-white shadow-sm' : 'text-gray-300 hover:text-white hover:bg-white/[0.08]'
            }`}
            title="Kolečko / Elipsa"
          >
            <Circle className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Kolečko</span>
          </button>

          <button
            type="button"
            onClick={() => selectTool('highlighter')}
            className={`h-6 px-2.5 rounded-full flex items-center gap-1 text-xs font-medium transition cursor-pointer ${
              tool === 'highlighter' ? 'bg-rose-500 text-white shadow-sm' : 'text-gray-300 hover:text-white hover:bg-white/[0.08]'
            }`}
            title="Zvýrazňovač textu"
          >
            <Highlighter className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Zvýrazňovač</span>
          </button>

          <button
            type="button"
            onClick={() => selectTool('arrow')}
            className={`h-6 px-2.5 rounded-full flex items-center gap-1 text-xs font-medium transition cursor-pointer ${
              tool === 'arrow' ? 'bg-rose-500 text-white shadow-sm' : 'text-gray-300 hover:text-white hover:bg-white/[0.08]'
            }`}
            title="Šipka (velikost dle tažení)"
          >
            <MoveUpRight className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Šipka</span>
          </button>

          <button
            type="button"
            onClick={() => selectTool('pencil')}
            className={`h-6 px-2.5 rounded-full flex items-center gap-1 text-xs font-medium transition cursor-pointer ${
              tool === 'pencil' ? 'bg-rose-500 text-white shadow-sm' : 'text-gray-300 hover:text-white hover:bg-white/[0.08]'
            }`}
            title="Tužka (2px volné kreslení)"
          >
            <Pencil className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Tužka</span>
          </button>

          <button
            type="button"
            onClick={() => selectTool('text')}
            className={`h-6 px-2.5 rounded-full flex items-center gap-1 text-xs font-medium transition cursor-pointer ${
              tool === 'text' ? 'bg-rose-500 text-white shadow-sm' : 'text-gray-300 hover:text-white hover:bg-white/[0.08]'
            }`}
            title="Psát text"
          >
            <Type className="w-3.5 h-3.5" />
            <span className="hidden xl:inline">Text</span>
          </button>
        </div>

        {/* 2. Contextual Sub-options: Fill mode for Rect/Ellipse OR Font sizes for Text */}
        {(tool === 'rect' || tool === 'ellipse') && (
          <div className="h-8 flex items-center gap-1 bg-white/[0.05] p-1 rounded-full shrink-0">
            <button
              type="button"
              onClick={() => setFillMode('outline')}
              className={`h-6 px-2.5 rounded-full text-[11px] font-medium transition cursor-pointer ${
                fillMode === 'outline' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Pouze obrys"
            >
              Obrys
            </button>
            <button
              type="button"
              onClick={() => setFillMode('filled')}
              className={`h-6 px-2.5 rounded-full text-[11px] font-medium transition cursor-pointer ${
                fillMode === 'filled' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Plná výplň"
            >
              Výplň
            </button>
            <button
              type="button"
              onClick={() => setFillMode('highlight')}
              className={`h-6 px-2.5 rounded-full text-[11px] font-medium transition cursor-pointer ${
                fillMode === 'highlight' ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Poloprůhledný zvýrazňovač"
            >
              Zvýraznit
            </button>
          </div>
        )}

        {tool === 'text' && (
          <div className="h-8 flex items-center gap-1 bg-white/[0.05] p-1 rounded-full shrink-0">
            {FONT_SIZES.map((fs) => (
              <button
                key={fs.label}
                type="button"
                onClick={() => {
                  setFontSize(fs.size);
                  if (activeText) {
                    setActiveText({ ...activeText, fontSize: fs.size });
                  }
                }}
                className={`h-6 px-2 rounded-full text-[11px] font-mono font-semibold transition cursor-pointer ${
                  fontSize === fs.size ? 'bg-white/20 text-white' : 'text-gray-400 hover:text-white'
                }`}
                title={`Velikost písma ${fs.size}px`}
              >
                {fs.label}
              </button>
            ))}
          </div>
        )}

        {/* 3. Basic Colors Palette (for all tools) */}
        <div className="h-8 flex items-center gap-1.5 px-2 bg-white/[0.05] rounded-full shrink-0">
          {BASIC_COLORS.map((c) => {
            const isSelected = color === c.hex;
            return (
              <button
                key={c.hex}
                type="button"
                onClick={() => {
                  setColor(c.hex);
                  if (activeText) {
                    setActiveText({ ...activeText, color: c.hex });
                  }
                }}
                className={`w-4 h-4 rounded-full transition-transform cursor-pointer shrink-0 ${
                  isSelected ? 'scale-125 ring-2 ring-white ring-offset-1 ring-offset-[#15161c]' : 'opacity-80 hover:opacity-100 hover:scale-110'
                }`}
                style={{ backgroundColor: c.hex }}
                title={c.label}
              />
            );
          })}
        </div>

        {/* 4. Undo / Redo */}
        <div className="h-8 flex items-center gap-1 bg-white/[0.05] p-1 rounded-full shrink-0">
          <button
            type="button"
            onClick={handleUndo}
            disabled={items.length === 0 && !activeText}
            className="w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/[0.1] disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            title="Krok zpět (Ctrl+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="w-6 h-6 rounded-full flex items-center justify-center text-gray-300 hover:text-white hover:bg-white/[0.1] disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
            title="Krok vpřed (Ctrl+Y)"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 5. Shortcuts Summary + Save + Close */}
        <div className="h-8 hidden lg:flex items-center gap-1.5 px-2 text-[11px] text-gray-400 font-sans shrink-0">
          <kbd className="h-[20px] px-2 bg-white/[0.08] text-gray-300 rounded-full font-mono text-[10px] leading-none flex items-center justify-center">
            Enter
          </kbd>
          <span>uložit</span>
          <kbd className="h-[20px] px-2 bg-white/[0.08] text-gray-300 rounded-full font-mono text-[10px] leading-none flex items-center justify-center ml-1">
            Ctrl+Z
          </kbd>
          <span>zpět</span>
          <kbd className="h-[20px] px-2 bg-white/[0.08] text-gray-300 rounded-full font-mono text-[10px] leading-none flex items-center justify-center ml-1">
            Esc
          </kbd>
          <span>zrušit</span>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="h-8 flex items-center gap-1.5 px-3.5 bg-emerald-500/25 hover:bg-emerald-500/35 text-emerald-200 hover:text-white rounded-full text-xs font-semibold transition-all active:scale-95 cursor-pointer shrink-0 shadow-sm"
          title="Uložit do schránky i souboru (Enter)"
        >
          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span>Uložit</span>
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="w-8 h-8 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 hover:text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0 shadow-sm"
          title="Zavřít bez uložení (Escape)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Centered Image Canvas Container */}
      <div
        className="relative mt-12 shadow-2xl rounded-lg overflow-hidden"
        style={{
          width: displaySize.width,
          height: displaySize.height,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          className={`block w-full h-full ${tool === 'text' ? 'cursor-text' : 'cursor-crosshair'}`}
          style={{
            width: displaySize.width,
            height: displaySize.height,
          }}
        />

        {/* Floating in-place Textarea when typing text */}
        {activeText && (
          <textarea
            ref={textAreaRef}
            value={activeText.value}
            onChange={(e) => {
              const val = e.target.value;
              setActiveText((prev) => (prev ? { ...prev, value: val } : null));
            }}
            onKeyDown={(e) => {
              // Enter inside textarea naturally creates a newline (do not trigger global save)
              e.stopPropagation();
              if (e.key === 'Escape') {
                e.preventDefault();
                setActiveText(null);
                activeTextRef.current = null;
                return;
              }
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                commitActiveText();
              }
            }}
            placeholder="Pište text... (Enter = nový řádek, klik mimo = potvrdit, Esc = zrušit)"
            className="absolute bg-black/40 backdrop-blur-[2px] outline-none border border-dashed border-white/50 rounded px-1.5 py-0.5 resize"
            style={{
              left: Math.min(displaySize.width - 120, Math.max(0, activeText.x * displaySize.scale)),
              top: Math.min(displaySize.height - 44, Math.max(0, activeText.y * displaySize.scale)),
              color: activeText.color,
              fontFamily: EDITOR_FONT_FAMILY,
              fontSize: `${Math.max(12, Math.round(activeText.fontSize * displaySize.scale))}px`,
              fontWeight: 600,
              lineHeight: 1.25,
              minWidth: '180px',
              minHeight: `${Math.max(34, Math.round(activeText.fontSize * displaySize.scale * 1.6))}px`,
            }}
          />
        )}
      </div>
    </div>
  );
};
