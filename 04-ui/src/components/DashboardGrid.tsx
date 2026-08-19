import { useEffect, useMemo, useState } from "react";
import { Responsive, WidthProvider } from "react-grid-layout/legacy";

type Layout = { i: string; x: number; y: number; w: number; h: number };

const RGL = WidthProvider(Responsive);

// breakpoint별 cols. 모바일은 1열로 강제 스택.
const COLS = { lg: 12, md: 8, sm: 4, xs: 2, xxs: 1 } as const;
const BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 } as const;

// lg(12) 기준 layout → 다른 breakpoint 로 변환. y 충돌 회피용으로 widget 순서대로 sequential stack.
function deriveLayouts(base: Layout[]): Record<string, Layout[]> {
  const lg = base;
  // md(8): w를 12→8 비율로 축소, 최소 2
  const md = base.map((l) => ({
    ...l,
    w: Math.max(2, Math.min(8, Math.round((l.w * 8) / 12))),
    x: Math.min(l.x, 8 - 1),
  }));
  // sm(4): 폭 4 이하로 압축
  const sm = base.map((l) => ({
    ...l,
    w: Math.max(2, Math.min(4, Math.round((l.w * 4) / 12))),
    x: 0,
  }));
  // xs/xxs: 전체 폭 사용, 순차 y stack (자동 compactType=vertical 이 정리)
  const xs = base.map((l) => ({ ...l, x: 0, w: 2 }));
  const xxs = base.map((l) => ({ ...l, x: 0, w: 1 }));
  return { lg, md, sm, xs, xxs };
}
import { Lock, Unlock, Plus, RotateCcw, Pencil, Trash2, GripVertical } from "lucide-react";
import WidgetRenderer from "./WidgetRenderer";
import WidgetEditor from "./WidgetEditor";
import {
  loadLayout,
  saveLayout,
  resetLayout,
  newWidgetId,
  type WidgetInstance,
  type WidgetConfig,
  type DashboardTab,
} from "@/lib/widgets";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";


type Props = {
  tab: DashboardTab;
};

export default function DashboardGrid({ tab }: Props) {
  const [widgets, setWidgets] = useState<WidgetInstance[]>(() => loadLayout(tab));
  const [editMode, setEditMode] = useState(false);
  const [editorOpen, setEditorOpen] = useState<{ mode: "add" } | { mode: "edit"; id: string } | null>(null);

  // 탭 변경 시 해당 탭의 레이아웃 로드
  useEffect(() => {
    setWidgets(loadLayout(tab));
  }, [tab]);

  useEffect(() => {
    saveLayout(tab, widgets);
  }, [tab, widgets]);

  const layouts = useMemo(() => {
    const base: Layout[] = widgets.map((w) => ({
      i: w.id,
      x: w.layout.x,
      y: w.layout.y,
      w: w.layout.w,
      h: w.layout.h,
    }));
    return deriveLayouts(base);
  }, [widgets]);

  // lg layout 변경만 widgets 에 반영 (작은 breakpoint 에서 드래그한 결과는 저장 안 함)
  // Responsive 콜백은 (currentLayout, allLayouts) 시그니처. legacy 타입이 부정확해서 unknown 으로 받음.
  function onLayoutChange(_curr: unknown, allLayouts: unknown) {
    const lg = (allLayouts as Record<string, Layout[]> | undefined)?.lg;
    if (!lg) return;
    setWidgets((prev) =>
      prev.map((w) => {
        const l = lg.find((x) => x.i === w.id);
        if (!l) return w;
        return { ...w, layout: { x: l.x, y: l.y, w: l.w, h: l.h } };
      }),
    );
  }

  function deleteWidget(id: string) {
    if (!confirm("이 위젯을 삭제할까요?")) return;
    setWidgets((prev) => prev.filter((w) => w.id !== id));
  }

  function saveEditor(cfg: WidgetConfig) {
    if (!editorOpen) return;
    if (editorOpen.mode === "add") {
      // 새 위젯 → 첫 빈 자리 (간단히 y=무한 끝에 배치)
      const maxY = widgets.reduce((m, w) => Math.max(m, w.layout.y + w.layout.h), 0);
      setWidgets((prev) => [
        ...prev,
        {
          id: newWidgetId(),
          config: cfg,
          layout: { x: 0, y: maxY, w: 4, h: 3 },
        },
      ]);
    } else {
      setWidgets((prev) => prev.map((w) => (w.id === editorOpen.id ? { ...w, config: cfg } : w)));
    }
    setEditorOpen(null);
  }

  function doReset() {
    if (!confirm("기본 레이아웃으로 되돌리고 추가/편집한 위젯을 모두 잃습니다. 계속할까요?")) return;
    resetLayout(tab);
    setWidgets(loadLayout(tab));
  }

  const editing = editorOpen
    ? editorOpen.mode === "edit"
      ? widgets.find((w) => w.id === editorOpen.id)?.config
      : undefined
    : undefined;

  return (
    <div>
      <div className="mb-3 flex items-center justify-end gap-2">
        <button
          onClick={() => setEditMode((v) => !v)}
          className={`inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs transition-colors ${
            editMode
              ? "border-brand bg-brand/10 text-brand"
              : "border-subtle bg-surface text-text-secondary hover:text-text-primary"
          }`}
        >
          {editMode ? <Unlock size={12} /> : <Lock size={12} />}
          {editMode ? "편집 중" : "고정됨"}
        </button>
        {editMode && (
          <>
            <button
              onClick={() => setEditorOpen({ mode: "add" })}
              className="inline-flex items-center gap-1 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-base hover:opacity-90"
            >
              <Plus size={12} /> 위젯 추가
            </button>
            <button
              onClick={doReset}
              className="inline-flex items-center gap-1 rounded-md border border-subtle px-3 py-1.5 text-xs text-text-secondary hover:bg-elevated"
            >
              <RotateCcw size={12} /> 기본값
            </button>
          </>
        )}
      </div>

      <RGL
        className="layout"
        layouts={layouts}
        cols={COLS}
        breakpoints={BREAKPOINTS}
        rowHeight={70}
        margin={[4, 4]}
        containerPadding={[0, 0]}
        compactType="vertical"
        isDraggable={editMode}
        isResizable={editMode}
        draggableHandle=".drag-handle"
        onLayoutChange={onLayoutChange}
        measureBeforeMount={true}
        useCSSTransforms={true}
      >
        {widgets.map((w) => (
          <div key={w.id} className={`group relative ${editMode ? "ring-1 ring-brand/30 rounded-card" : ""}`}>
            <div className="h-full w-full overflow-hidden">
              <WidgetRenderer config={w.config} />
            </div>

            {editMode && (
              <>
                {/* 드래그 핸들 — 터치 친화 44px (md+ 호버 노출, 모바일은 상시 가시) */}
                <div
                  className="drag-handle absolute inset-x-0 top-0 z-10 h-11 cursor-move opacity-100 transition-opacity md:opacity-60 md:hover:opacity-100"
                  title="드래그"
                >
                  <div className="flex h-full items-center justify-center bg-brand/10 text-[11px] text-brand">
                    <GripVertical size={14} /> 드래그
                  </div>
                </div>

                {/* 편집·삭제 — 터치 디바이스 상시 노출, md+ 는 hover */}
                <div className="absolute right-1 top-1 z-20 flex gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditorOpen({ mode: "edit", id: w.id });
                    }}
                    className="flex h-11 w-11 items-center justify-center rounded-md bg-elevated text-text-secondary shadow hover:text-text-primary md:h-8 md:w-8"
                    title="편집"
                    aria-label="위젯 편집"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteWidget(w.id);
                    }}
                    className="flex h-11 w-11 items-center justify-center rounded-md bg-elevated text-text-secondary shadow hover:text-crit md:h-8 md:w-8"
                    title="삭제"
                    aria-label="위젯 삭제"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </RGL>

      {editorOpen && (
        <WidgetEditor
          initial={editing}
          onSave={saveEditor}
          onClose={() => setEditorOpen(null)}
        />
      )}
    </div>
  );
}
