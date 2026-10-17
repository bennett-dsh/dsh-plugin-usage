// ============================================================================
// Token 用量统计 — settings.section Client UI（纯 JS，动态插件沙箱）
// 可用全局：React / ctx / styles / host / console；浏览器全局 Date / Intl 等。
// CSS 常量内联自 styles.js（动态插件沙箱无 import，样式随本文件加载）。
// ============================================================================
const CSS = `
/* ============ 布局 ============ */
.tsd-section {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--dsw-alias-label-primary);
  animation: tsd-fade-in 0.4s var(--ds-ease-in-out);
}
@keyframes tsd-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

/* ============ Header ============ */
.tsd-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.tsd-title {
  margin: 0;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--dsw-alias-label-primary);
}
.tsd-subtitle {
  margin: 4px 0 0;
  font-size: 14px;
  color: var(--dsw-alias-label-secondary);
}
.tsd-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-secondary);
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}
.tsd-icon-btn:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.tsd-spinning svg {
  animation: tsd-spin 0.9s linear infinite;
}
@keyframes tsd-spin {
  to { transform: rotate(360deg); }
}

/* ============ 筛选栏 ============ */
.tsd-filterbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tsd-seg-wrap {
  position: relative;
  display: inline-flex;
}
.tsd-seg {
  display: inline-flex;
  gap: 2px;
  padding: 4px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--dsw-alias-label-tertiary) 12%, transparent);
}
.tsd-seg-btn {
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
}
.tsd-seg-btn:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.tsd-seg-active {
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-brand-primary);
  font-weight: 600;
  box-shadow: var(--dsw-shadow-lv1);
}
.tsd-seg-custom {
  max-width: 220px;
}
.tsd-seg-custom .tsd-seg-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tsd-seg-custom.tsd-seg-active {
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-label-primary-inverted, #fff);
}
.tsd-seg-custom.tsd-seg-active:hover {
  background: var(--dsw-alias-button-primary-hover);
}

/* ============ 通用按钮 ============ */
.tsd-btn {
  height: 30px;
  padding: 0 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.tsd-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.tsd-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.tsd-btn-primary {
  background: var(--dsw-alias-button-primary-fill);
  border-color: transparent;
  color: var(--dsw-alias-label-primary-inverted, #fff);
}
.tsd-btn-primary:hover { background: var(--dsw-alias-button-primary-hover); }
.tsd-btn-ghost { background: transparent; }
.tsd-btn-ghost:hover { background: var(--dsw-alias-interactive-bg-hover); }

/* ============ 浮层 Popover ============ */
.tsd-popover-anchor {
  position: relative;
  display: inline-flex;
}
.tsd-popover {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 40;
  padding: 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-overlay);
  border-radius: 12px;
  box-shadow: var(--dsw-shadow-lv3);
}
.tsd-model-popover {
  width: 320px;
  max-width: calc(100vw - 24px);
}
.tsd-range-popover {
  width: 300px;
  max-width: calc(100vw - 24px);
}
.tsd-popover-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  margin: 0 0 10px;
}
.tsd-popover-tools {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}
.tsd-link-btn {
  border: none;
  background: none;
  color: var(--dsw-alias-state-business-primary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
}
.tsd-link-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.tsd-popover-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.tsd-popover-note {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.tsd-popover-empty {
  margin: 0;
  padding: 10px 0;
  text-align: center;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}

/* ============ 模型下拉搜索 ============ */
.tsd-select-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 120px;
  max-width: 260px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.tsd-select-btn:hover { border-color: var(--dsw-alias-border-l3); }
.tsd-select-has { border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, var(--dsw-alias-border-l2)); }
.tsd-select-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.tsd-chevron {
  flex: none;
  transition: transform var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}
.tsd-chevron-open { transform: rotate(180deg); }
.tsd-search {
  position: relative;
  margin-bottom: 8px;
}
.tsd-search-icon {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--dsw-alias-label-tertiary);
  pointer-events: none;
}
.tsd-search input {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 8px 0 28px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  outline: none;
}
.tsd-search input:focus {
  border-color: var(--dsw-alias-state-business-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent);
}
.tsd-model-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 240px;
  overflow-y: auto;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
.tsd-model-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 6px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  min-width: 0;
}
.tsd-model-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.tsd-model-item input { margin: 0; accent-color: var(--dsw-alias-brand-primary); }
.tsd-model-name {
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* ============ 自定义日期浮层 ============ */
.tsd-range-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.tsd-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tsd-field-label {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.tsd-field input {
  box-sizing: border-box;
  width: 100%;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  border-radius: 8px;
  font: inherit;
  font-size: 13px;
  outline: none;
}
.tsd-field input:focus {
  border-color: var(--dsw-alias-state-business-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent);
}
.tsd-field-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--dsw-alias-state-error-primary);
}
.tsd-field-hint {
  margin: 6px 0 0;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}

/* ============ 汇总指标卡 ============ */
.tsd-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}
.tsd-card {
  min-width: 0;
  padding: 14px 16px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3);
  border-radius: 12px;
  box-shadow: var(--dsw-shadow-lv1);
}
.tsd-card-head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.tsd-card-icon {
  display: inline-flex;
}
.tsd-card-label {
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tsd-card-value {
  margin-top: 8px;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--dsw-alias-label-primary);
  font-variant-numeric: tabular-nums;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tsd-card-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
}
.tsd-card-note {
  margin-top: 4px;
  font-size: 11px;
  color: var(--dsw-alias-state-warn-primary);
}

/* ============ 卡片头部（图表 / 表格共用） ============ */
.tsd-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 12px;
}
.tsd-card-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.tsd-card-tag {
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ============ 每日用量柱状图 ============ */
.tsd-chart-card { padding: 14px 16px 10px; }
.tsd-legend {
  display: flex;
  gap: 14px;
  margin-bottom: 8px;
}
.tsd-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
}
.tsd-legend-dot,
.tsd-tooltip-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex: none;
}
.tsd-legend-in { background: var(--dsw-static-deepseek-500); }
.tsd-legend-out { background: var(--dsw-static-green-500); }
.tsd-legend-total { background: var(--dsw-alias-label-secondary); }

.tsd-chart {
  position: relative;
  display: flex;
  align-items: stretch;
  gap: 2px;
  height: 240px;
  padding: 0 4px;
}
.tsd-chart-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: 4px;
  cursor: default;
  transition: opacity var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}
.tsd-chart-col:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}
.tsd-chart:hover .tsd-chart-col { opacity: 0.4; }
.tsd-chart:hover .tsd-chart-col:hover,
.tsd-chart:focus-within .tsd-chart-col:focus { opacity: 1; }

.tsd-chart-plot {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  background-image: linear-gradient(to top, var(--dsw-alias-border-l1) 1px, transparent 1px);
  background-size: 100% 25%;
  background-repeat: no-repeat;
}
.tsd-chart-stack {
  width: 62%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}
.tsd-chart-seg {
  width: 100%;
}
.tsd-seg-in {
  background: var(--dsw-static-deepseek-500);
}
.tsd-seg-out {
  background: var(--dsw-static-green-500);
  border-radius: 3px 3px 0 0;
}
.tsd-chart-label {
  height: 14px;
  line-height: 14px;
  margin-top: 6px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.tsd-chart-label-hidden { visibility: hidden; }

/* tooltip */
.tsd-tooltip {
  position: absolute;
  top: 10px;
  transform: translateX(-50%);
  z-index: 6;
  min-width: 156px;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-overlay);
  backdrop-filter: blur(8px);
  border-radius: 8px;
  box-shadow: var(--dsw-shadow-lv3);
  pointer-events: none;
}
.tsd-tooltip-date {
  margin-bottom: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.tsd-tooltip-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}
.tsd-tooltip-val {
  margin-left: auto;
  padding-left: 12px;
  color: var(--dsw-alias-label-primary);
}
.tsd-tooltip-total {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--dsw-alias-border-l2);
  font-size: 12px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  font-variant-numeric: tabular-nums;
}

/* ============ 按模型明细表 ============ */
.tsd-table-card { padding: 0; }
.tsd-table-card .tsd-card-header { padding: 14px 16px 0; }
.tsd-table-wrap {
  overflow-x: auto;
  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);
  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);
}
.tsd-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.tsd-th {
  padding: 10px 12px;
  text-align: left;
  font-size: 12px;
  font-weight: 500;
  color: var(--dsw-alias-label-secondary);
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  white-space: nowrap;
}
.tsd-th-num { text-align: right; }
.tsd-sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: none;
  background: none;
  font: inherit;
  font-size: 12px;
  color: inherit;
  cursor: pointer;
}
.tsd-sort-btn:hover { color: var(--dsw-alias-label-primary); }
.tsd-sort-active { color: var(--dsw-alias-brand-primary); }
.tsd-sort-arrow {
  font-size: 10px;
  line-height: 1;
}
.tsd-tr:hover { background: var(--dsw-alias-interactive-bg-hover); }
.tsd-td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--dsw-alias-border-l1);
  color: var(--dsw-alias-label-secondary);
  white-space: nowrap;
}
.tsd-td-model { max-width: 240px; }
.tsd-model-mono {
  display: block;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
}
.tsd-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.tsd-total {
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.tsd-unpriced {
  color: var(--dsw-alias-label-tertiary);
  font-style: italic;
}
.tsd-td-ratio { text-align: right; }
.tsd-ratio {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.tsd-ratio-bar {
  width: 60px;
  height: 6px;
  border-radius: 3px;
  background: var(--dsw-alias-bg-layer-1);
  overflow: hidden;
  flex: none;
}
.tsd-ratio-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--dsw-static-deepseek-500), color-mix(in srgb, var(--dsw-static-deepseek-500) 55%, var(--dsw-static-deepseek-300)));
}
.tsd-ratio-pct {
  min-width: 42px;
  text-align: right;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  font-variant-numeric: tabular-nums;
}

/* ============ 三态：空 / 错误 / 加载 ============ */
.tsd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 40px 16px;
  text-align: center;
}
.tsd-empty-icon {
  color: var(--dsw-alias-label-tertiary);
  margin-bottom: 4px;
}
.tsd-empty-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.tsd-empty-desc {
  margin: 0;
  font-size: 13px;
  color: var(--dsw-alias-label-secondary);
}
.tsd-empty-block {
  padding: 24px;
  text-align: center;
  font-size: 13px;
  color: var(--dsw-alias-label-tertiary);
}

.tsd-error {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 16px;
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-error-secondary) 30%, var(--dsw-alias-bg-layer-3));
}
.tsd-error-icon {
  flex: none;
  color: var(--dsw-alias-state-error-primary);
}
.tsd-error-text {
  flex: 1;
  min-width: 0;
}
.tsd-error-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
}
.tsd-error-detail {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tsd-alert-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-error-primary) 40%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--dsw-alias-state-error-secondary) 30%, var(--dsw-alias-bg-layer-3));
  color: var(--dsw-alias-state-error-primary);
  font-size: 13px;
}

.tsd-loading {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.tsd-card-skeleton { min-height: 84px; }
.tsd-skeleton {
  background: var(--dsw-alias-bg-skeleton);
  border-radius: 6px;
  animation: tsd-pulse 1.6s var(--ds-ease-in-out) infinite;
}
.tsd-skeleton-row {
  height: 14px;
  margin: 12px 0;
  background: var(--dsw-alias-bg-skeleton);
  border-radius: 4px;
  animation: tsd-pulse 1.6s var(--ds-ease-in-out) infinite;
}
@keyframes tsd-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

/* ============ 刷新时的内容态 ============ */
.tsd-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: opacity var(--ds-transition-duration) var(--ds-ease-in-out);
}
.tsd-content[data-busy=true] { opacity: 0.55; }

/* ============ 无障碍 ============ */
.tsd-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
.tsd-icon {
  flex: none;
}
.tsd-seg-btn:focus-visible,
.tsd-select-btn:focus-visible,
.tsd-btn:focus-visible,
.tsd-icon-btn:focus-visible,
.tsd-link-btn:focus-visible,
.tsd-sort-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}
/* ============ 粒度切换 ============ */
.tsd-card-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.tsd-gran {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
}
.tsd-gran-btn {
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  font: inherit;
  font-size: 11px;
  line-height: 16px;
  border-radius: 6px;
  padding: 2px 8px;
  cursor: pointer;
}
.tsd-gran-btn[data-active="true"] {
  background: var(--dsw-alias-bg-layer-3);
  color: var(--dsw-alias-label-primary);
  box-shadow: var(--dsw-shadow-lv1);
}
.tsd-gran-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
/* ============ 折线图 ============ */
.tsd-linechart {
  position: relative;
  padding: 6px 10px 8px;
}
.tsd-linechart svg {
  display: block;
  width: 100%;
  height: auto;
}
.tsd-linechart .tsd-line-grid {
  stroke: var(--dsw-alias-border-l2);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
.tsd-linechart .tsd-line-axis {
  stroke: var(--dsw-alias-border-l2);
  stroke-width: 1;
}
.tsd-linechart .tsd-line-in {
  stroke: var(--dsw-static-deepseek-500);
  stroke-width: 2;
  fill: none;
}
.tsd-linechart .tsd-line-out {
  stroke: var(--dsw-static-green-500);
  stroke-width: 2;
  fill: none;
}
.tsd-linechart .tsd-line-total {
  stroke: var(--dsw-alias-label-secondary);
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
  fill: none;
}
.tsd-linechart .tsd-line-dot {
  fill: var(--dsw-alias-bg-layer-2);
  stroke: var(--dsw-alias-label-secondary);
  stroke-width: 1;
}
.tsd-linechart .tsd-line-hover {
  fill: transparent;
  cursor: crosshair;
}
.tsd-linechart .tsd-line-cursor {
  stroke: var(--dsw-alias-border-l3);
  stroke-width: 1;
  stroke-dasharray: 3 3;
  pointer-events: none;
}
.tsd-linechart .tsd-line-hl {
  stroke: var(--dsw-alias-bg-base);
  stroke-width: 1.5;
  pointer-events: none;
}
.tsd-linechart .tsd-line-hl-in { fill: var(--dsw-static-deepseek-500); }
.tsd-linechart .tsd-line-hl-out { fill: var(--dsw-static-green-500); }
.tsd-linechart .tsd-line-hl-total { fill: var(--dsw-alias-label-secondary); }
.tsd-linechart .tsd-line-text {
  fill: var(--dsw-alias-label-tertiary);
  font-size: 10px;
}
/* ============ 年度热力图 ============ */
.tsd-heatmap {
  padding: 6px 14px 14px;
  overflow-x: auto;
}
.tsd-heatmap-inner {
  display: inline-flex;
  flex-direction: column;
  gap: 4px;
  min-width: min-content;
}
.tsd-heatmap-months {
  display: flex;
  margin-left: 26px;
  height: 14px;
  position: relative;
}
.tsd-heatmap-month {
  font-size: 9px;
  line-height: 14px;
  color: var(--dsw-alias-label-tertiary);
  white-space: nowrap;
  position: absolute;
  top: 0;
}
.tsd-heatmap-body {
  display: flex;
  gap: 4px;
}
.tsd-heatmap-days {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 22px;
  flex: none;
}
.tsd-heatmap-day {
  height: 10px;
  font-size: 9px;
  line-height: 10px;
  color: var(--dsw-alias-label-tertiary);
  text-align: right;
  padding-right: 4px;
}
.tsd-heatmap-grid {
  display: flex;
  gap: 2px;
}
.tsd-heatmap-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tsd-heatmap-cell {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  background: var(--dsw-alias-interactive-bg-hover);
  transition: transform var(--ds-transition-duration-fast) var(--ds-ease-in-out), box-shadow var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}
.tsd-heatmap-cell:hover {
  outline: 1px solid var(--dsw-alias-label-secondary);
  transform: scale(1.35);
  box-shadow: var(--dsw-shadow-lv2);
  position: relative;
  z-index: 2;
}
.tsd-heatmap-legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 8px 14px 0;
  padding-top: 8px;
  border-top: 1px solid var(--dsw-alias-border-l2);
  font-size: 10px;
  color: var(--dsw-alias-label-tertiary);
}
`

// 0.2+ host transport: POST /api/<channel>/<endpoint>, args as the JSON body,
// answering { ok, value } | { ok, error } (see src/host/rpc.js). The route is
// mounted on Connection's shared API channel, so it never needs the plugin's
// fiber to own `webServer`.
function callFetch(channel, endpoint, args) {
  const path = '/api/' + String(channel).replace(/^\/+/, '') + '/' + endpoint
  return fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(args === undefined ? null : args),
  }).then((res) => {
    const type = res.headers.get('content-type') || ''
    // Route missing on this host: 404/405 from the shared dispatcher, or the
    // SPA HTML when no transport route matched the path at all.
    if (res.status === 404 || res.status === 405 || type.indexOf('application/json') === -1) {
      const error = new Error('usage Fetch route unavailable (HTTP ' + res.status + ')')
      error.code = 'usage-route-missing'
      throw error
    }
    return res.json().then((body) => {
      if (body && body.ok) return body.value
      throw new Error((body && body.error && body.error.message) || ('RPC ' + endpoint + ' failed'))
    })
  })
}

// RPC bridge: dynamic-plugin runs provide a `host` global; static (bundle)
// installs provide ctx.get('connection'). Keep one UI source for both.
function hostCall(method, args) {
  // P0-3: prefer the official `remote` service when it exposes the usage API;
  // otherwise fall through to the host/connection fallbacks unchanged.
  const remoteScope = (typeof ctx !== 'undefined' && ctx && typeof ctx.get === 'function')
    ? ctx
    : (typeof _usageCtx !== 'undefined' && _usageCtx && typeof _usageCtx.get === 'function' ? _usageCtx : null)
  if (remoteScope && typeof remoteScope.get === 'function') {
    try {
      const remote = remoteScope.get('remote')
      if (remote && remote.usage) {
        const rName = String(method)
        const rSlash = rName.indexOf('/')
        const rEp = rSlash === -1 ? rName : rName.slice(rSlash + 1)
        const rCamel = rEp.replace(/-([a-z])/g, (m, c) => c.toUpperCase())
        const fn = (typeof remote.usage[rCamel] === 'function' && remote.usage[rCamel])
          || (typeof remote.usage[rEp] === 'function' && remote.usage[rEp])
        if (fn) {
          return Promise.resolve().then(() => fn(args)).then((res) => {
            if (res && res.ok) return res.value
            throw new Error((res && res.error && res.error.message) || ('RPC ' + method + ' failed'))
          })
        }
      }
    } catch (e) {
      // remote probing failed — fall through to the existing fallbacks
    }
  }
  if (typeof host !== 'undefined' && host && typeof host.call === 'function') {
    return Promise.resolve(host.call(method, args))
  }
  // Static bundle installs have no ctx/host globals: the entry apply() stores
  // the real context in _usageCtx (declared by the build wrapper).
  const scope = (typeof ctx !== 'undefined' && ctx && typeof ctx.get === 'function')
    ? ctx
    : (typeof _usageCtx !== 'undefined' ? _usageCtx : null)
  if (scope === null || typeof scope.get !== 'function') {
    return Promise.reject(new Error('context unavailable'))
  }
  const name = String(method)
  const slash = name.indexOf('/')
  const channel = slash === -1 ? name : name.slice(0, slash)
  const endpoint = slash === -1 ? name : name.slice(slash + 1)
  // Legacy pre-0.2 transport: a `/usage` prefix RPC channel owned by the host
  // plugin itself.
  const callRpc = () => {
    const connection = scope.get('connection')
    if (connection === undefined || connection.rpc === undefined) {
      return Promise.reject(new Error('connection service unavailable'))
    }
    return connection.rpc.call('/' + channel.replace(/^\/+/, ''), endpoint, args).then((res) => {
      if (res && res.ok) return res.value
      throw new Error((res && res.error && res.error.message) || ('RPC ' + method + ' failed'))
    })
  }
  // Prefer the shared-channel Fetch route; an older host answers "route
  // missing" and we fall back to the legacy channel it does implement.
  const fetchUsable = typeof fetch === 'function'
    && !(typeof location !== 'undefined' && location.protocol === 'file:')
  if (!fetchUsable) return callRpc()
  return callFetch(channel, endpoint, args).catch((error) => {
    if (error && error.code === 'usage-route-missing') return callRpc()
    throw error
  })
}

/* ---------------------------------------------------------------------------
 * 设置域定价：官方 `ctx.configForms.get('usage')`（dsh-client-ui-settings）优先，
 * 不可用时回退 usage/prices RPC。绑定只做一次，读写共用同一 form。
 * ------------------------------------------------------------------------- */
let usageCtx = null
let _usagePricesScope = null

function resolveUsageCtx() {
  if (usageCtx && typeof usageCtx.get === 'function') return usageCtx
  if (typeof _usageCtx !== 'undefined' && _usageCtx && typeof _usageCtx.get === 'function') return _usageCtx
  return null
}

function getUsagePricesScope() {
  if (_usagePricesScope) return _usagePricesScope
  const c = resolveUsageCtx()
  if (!c || typeof c.get !== 'function') return null
  try {
    // 0.2.x: the official config-form surface for this plugin's entry id
    // (`usage`, the bundle patch row id). `settingsScope` from 0.1.x does not
    // exist in the shipped client, so probing it only ever returned null.
    const forms = c.get('configForms')
    if (!forms || typeof forms.get !== 'function') return null
    _usagePricesScope = forms.get('usage')
    return _usagePricesScope
  } catch (e) {
    return null
  }
}

// 价格写入口：settings scope 可用时写 usage.prices 命名空间字段，
// 否则回退 usage/prices RPC（当前 UI 无价格编辑器，保留此写入 seam 供后续使用）。
function usageSavePrices(next) {
  const args = {}
  if (next && typeof next === 'object') {
    if (next.prices !== undefined) args.prices = next.prices
    if (next.currency !== undefined) args.currency = next.currency
  }
  try {
    const scope = getUsagePricesScope()
    if (scope && typeof scope.set === 'function') {
      const jobs = []
      if (args.prices !== undefined) jobs.push(scope.set('prices', args.prices))
      if (args.currency !== undefined) jobs.push(scope.set('currency', args.currency))
      if (jobs.length > 0) {
        return Promise.all(jobs).then(() => {
          const snap = typeof scope.getSnapshot === 'function' ? scope.getSnapshot() : null
          return snap && snap.value ? snap.value : null
        })
      }
    }
  } catch (e) {
    // fall through to the RPC write path
  }
  return hostCall('usage/prices', args)
}

;
const h = React.createElement

/* ---------------------------------------------------------------------------
 * 国际化：zh/en 字典 + Context（locale 服务经 slot 注册注入 t，子组件经 Context 取用）
 * ------------------------------------------------------------------------- */
const NS = 'usage'
const ZH = {
  nav: '用量统计',
  subtitle: '查看 AI 模型的使用情况和成本统计',
  refresh: '刷新',
  today: '今日',
  last7d: '近7天',
  last30d: '近30天',
  custom: '自定义',
  allModels: '全部模型',
  selectedModels: '已选 {count} 个模型',
  selectAll: '全选',
  clear: '清空',
  searchModels: '搜索模型',
  noMatchModels: '无匹配模型',
  modelFilterHint: '勾选即时生效，仅列出当前范围内有数据的模型',
  customRangeTitle: '自定义时间范围',
  customRangeAria: '自定义日期范围',
  startTime: '开始时间',
  endTime: '结束时间',
  rangeInvalid: '开始时间不能晚于结束时间',
  rangeHint: '支持选择日期，最长 30 天',
  cancel: '取消',
  confirm: '确定',
  dateRangeGroup: '日期范围',
  modelFilterGroup: '模型筛选',
  chartTypeGroup: '图表类型',
  totalTokens: '总 Token',
  inputTokens: '输入 Token',
  outputTokens: '输出 Token',
  calls: '调用次数',
  cost: '成本',
  approxIO: '≈ 输入+输出',
  unpricedNote: '{count} 次调用未定价',
  dailyTrend: '每日用量趋势',
  barView: '柱状图',
  lineView: '折线图',
  byHour: '按小时',
  byDay: '按天',
  everyNDays: '每 {n} 天',
  legendInput: '输入',
  legendOutput: '输出',
  legendTotal: '总 Token',
  tooltipTotal: '合计',
  startNDays: '起 {n} 天',
  lineChartAria: 'Token 用量趋势折线图',
  yearlyHeatmap: '年度用量热力图',
  yearDaily: '{year} 年每日 Token 用量',
  monthLabel: '{n}月',
  weekdayMon: '一',
  weekdayWed: '三',
  weekdayFri: '五',
  less: '少',
  more: '多',
  byModelTitle: '按模型明细',
  modelCount: '共 {n} 个模型',
  modelTableCaption: '按模型用量明细',
  colModel: '模型',
  colCalls: '请求数',
  colInput: '输入 Token',
  colOutput: '输出 Token',
  colTotal: '总 Token',
  colCost: '成本',
  colShare: '占比',
  unpriced: '未定价',
  unpricedRowHint: '该模型未配置定价，按 0 计价',
  noData: '暂无数据',
  emptyDesc: '该时间段内没有调用记录',
  emptyFiltered: '当前筛选条件下没有数据，试试调整时间范围或模型',
  resetFilters: '重置筛选',
  loadFailed: '数据加载失败：{message}',
  loadFailedTitle: '数据加载失败',
  retry: '重试',
  barAria: '{key}，输入 {in} Token，输出 {out} Token，合计 {tot} Token',
  hmTitle: '{key}：{tokens} Token{calls}',
  hmCalls: '，{count} 次调用',
  wd0: '周日',
  wd1: '周一',
  wd2: '周二',
  wd3: '周三',
  wd4: '周四',
  wd5: '周五',
  wd6: '周六',
}
const EN = {
  nav: 'Usage Stats',
  subtitle: 'View AI model usage and cost statistics',
  refresh: 'Refresh',
  today: 'Today',
  last7d: 'Last 7 days',
  last30d: 'Last 30 days',
  custom: 'Custom',
  allModels: 'All models',
  selectedModels: '{count} models selected',
  selectAll: 'Select all',
  clear: 'Clear',
  searchModels: 'Search models',
  noMatchModels: 'No matching models',
  modelFilterHint: 'Applies instantly; lists only models with data in the range',
  customRangeTitle: 'Custom time range',
  customRangeAria: 'Custom date range',
  startTime: 'Start',
  endTime: 'End',
  rangeInvalid: 'Start must not be later than end',
  rangeHint: 'Date only, up to 30 days',
  cancel: 'Cancel',
  confirm: 'OK',
  dateRangeGroup: 'Date range',
  modelFilterGroup: 'Model filter',
  chartTypeGroup: 'Chart type',
  totalTokens: 'Total Tokens',
  inputTokens: 'Input Tokens',
  outputTokens: 'Output Tokens',
  calls: 'Calls',
  cost: 'Cost',
  approxIO: '≈ input+output',
  unpricedNote: '{count} calls unpriced',
  dailyTrend: 'Daily usage trend',
  barView: 'Bars',
  lineView: 'Line',
  byHour: 'Hourly',
  byDay: 'Daily',
  everyNDays: 'Every {n} days',
  legendInput: 'Input',
  legendOutput: 'Output',
  legendTotal: 'Total',
  tooltipTotal: 'Total',
  startNDays: 'for {n} days',
  lineChartAria: 'Token usage trend line chart',
  yearlyHeatmap: 'Yearly heatmap',
  yearDaily: 'Daily tokens in {year}',
  monthLabel: '{n}',
  weekdayMon: 'Mon',
  weekdayWed: 'Wed',
  weekdayFri: 'Fri',
  less: 'Less',
  more: 'More',
  byModelTitle: 'By model',
  modelCount: '{n} models',
  modelTableCaption: 'Token usage by model',
  colModel: 'Model',
  colCalls: 'Calls',
  colInput: 'Input Tokens',
  colOutput: 'Output Tokens',
  colTotal: 'Total Tokens',
  colCost: 'Cost',
  colShare: 'Share',
  unpriced: 'Unpriced',
  unpricedRowHint: 'No pricing configured; counted as 0',
  noData: 'No data',
  emptyDesc: 'No calls in this period',
  emptyFiltered: 'No data for the current filters, try adjusting the range or models',
  resetFilters: 'Reset filters',
  loadFailed: 'Failed to load data: {message}',
  loadFailedTitle: 'Failed to load data',
  retry: 'Retry',
  barAria: '{key}, input {in} tokens, output {out} tokens, total {tot} tokens',
  hmTitle: '{key}: {tokens} tokens{calls}',
  hmCalls: ', {count} calls',
  wd0: 'Sun',
  wd1: 'Mon',
  wd2: 'Tue',
  wd3: 'Wed',
  wd4: 'Thu',
  wd5: 'Fri',
  wd6: 'Sat',
}
const T = React.createContext(null)
function useT() {
  return React.useContext(T)
}
function fallbackT(key, params) {
  let s = ZH[key]
  if (s === undefined) return key
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (m, n) => (params[n] !== undefined ? String(params[n]) : m))
  }
  return s
}

/* ---------------------------------------------------------------------------
 * 数字格式化（规格第 5 节）
 * ------------------------------------------------------------------------- */
function formatTokensShort(n) {
  if (!Number.isFinite(n)) return '--'
  if (n >= 1e6) return Math.round(n / 1e4) / 100 + 'M' // 1.23M
  if (n >= 1e3) return Math.round(n / 1e2) / 10 + 'K' // 12.3K
  return String(Math.round(n))
}
function formatInt(n) {
  return Number.isFinite(n) ? Math.round(n).toLocaleString() : '--'
}
function formatCost(n, cur) {
  if (!Number.isFinite(n)) return '--'
  return (cur || '¥') + n.toFixed(2)
}
function dayLabel(key) {
  const [, m, d] = String(key || '').split('-')
  if (m === undefined || d === undefined) return '--'
  return m + '-' + d
}
function fmtPct(ratio) {
  if (!Number.isFinite(ratio)) return '0%'
  const p = ratio * 100
  if (p >= 99.95) return '100%'
  return p.toFixed(1) + '%'
}

/* ---------------------------------------------------------------------------
 * 日期工具
 * ------------------------------------------------------------------------- */
function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}
function addDays(d, n) {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
function fmtDateInput(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}
function fmtDateSlash(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return '--'
  return m[1] + '/' + m[2] + '/' + m[3]
}
// 预设 / 自定义 → { from, to }（Unix 毫秒）
// 今日 = 当天 00:00 至今；近7/30天 = 含今天往前 N 个自然日 00:00 起；自定义 = 起日 00:00 ~ 止日 23:59:59.999
function rangeFor(preset, custom) {
  const now = new Date()
  const today = startOfDay(now)
  if (preset === 'today') return { from: today.getTime(), to: now.getTime() }
  if (preset === '7d') return { from: addDays(today, -6).getTime(), to: now.getTime() }
  if (preset === '30d') return { from: addDays(today, -29).getTime(), to: now.getTime() }
  const from = new Date(custom.from + 'T00:00:00').getTime()
  const to = new Date(custom.to + 'T23:59:59.999').getTime()
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return { from: today.getTime(), to: now.getTime() }
  }
  return { from, to }
}
function weekdayOf(key) {
  try {
    return new Date(key + 'T00:00:00').toLocaleDateString('zh-CN', { weekday: 'short' })
  } catch (e) {
    return ''
  }
}
/** Weekday for a day/hour/minute bucket key (`YYYY-MM-DD` or `YYYY-MM-DD HH:mm`). */
function weekdayName(key, t) {
  try {
    const d = new Date(String(key).replace(' ', 'T'))
    return t(['wd0', 'wd1', 'wd2', 'wd3', 'wd4', 'wd5', 'wd6'][d.getDay()] || 'wd0')
  } catch (e) {
    return ''
  }
}
/** X-axis label for a bucket key under a granularity. */
function xLabel(key, g) {
  const s = String(key)
  const sp = s.split(' ')
  if (g === 'minute') return sp.length > 1 ? sp[1].slice(0, 5) : s.slice(5)
  if (g === 'hour') return sp.length > 1 ? sp[1].slice(0, 2) + ':00' : s.slice(5)
  return dayLabel(key)
}
/** Fixed granularity policy: today is hourly, everything else is daily. */
function effGranularity(range) {
  return range === 'today' ? 'hour' : 'day';
}
/** Stable step strategy for custom ranges: target ~15-25 buckets. */
function pickStepDays(spanMs) {
  const days = Math.max(1, Math.round((spanMs || 0) / 86400000))
  if (days <= 31) return 1
  if (days <= 62) return 3
  if (days <= 150) return 5
  return 7
}
/** Human label for the current step policy. */
function stepLabel(t, range, stepDays) {
  if (range === 'today') return t('byHour')
  return stepDays > 1 ? t('everyNDays', { n: stepDays }) : t('byDay')
}
/** Heatmap cell color by relative token volume. */
function heatColor(total, max) {
  if (!total) return 'var(--dsw-alias-interactive-bg-hover)'
  const r = total / max
  const pct = r < 0.25 ? 22 : r < 0.5 ? 45 : r < 0.75 ? 70 : 100
  return 'color-mix(in srgb, var(--dsw-static-deepseek-500) ' + pct + '%, var(--dsw-alias-bg-layer-2))'
}
function niceCeil(v) {
  if (!Number.isFinite(v) || v <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  const norm = v / mag
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10
  return nice * mag
}
function defaultCustom() {
  const now = new Date()
  return { from: fmtDateInput(addDays(now, -6)), to: fmtDateInput(now) }
}

/* ---------------------------------------------------------------------------
 * 内联 SVG 图标（无图标库，手写 feather 风格 stroke 图标）
 * ------------------------------------------------------------------------- */
const ICON_PATHS = {
  layers: 'M12 2l8 4.5-8 4.5-8-4.5L12 2zm0 8l8 4.5-8 4.5-8-4.5L12 10zm0 8l8 4.5-8 4.5-8-4.5L12 18z',
  down: 'M12 3v12m0 0l-4.5-4.5M12 15l4.5-4.5M4 21h16',
  up: 'M12 21V9m0 0l-4.5 4.5M12 9l4.5 4.5M4 3h16',
  activity: 'M2 12h4l2.5-8 5 16 2.5-8h6',
  coins: 'M3 9a2 2 0 012-2h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9zm0 5h18M8 5.5V4a2 2 0 012-2h4a2 2 0 012 2v1.5',
  refresh: 'M21 12a9 9 0 11-2.64-6.36M21 4v6h-6',
  chevron: 'M6 9l6 6 6-6',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2m3.5-6.5L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.5-6.5A2 2 0 0016.76 5H7.24a2 2 0 00-1.74 1.5z',
  alert: 'M12 9v4m0 4h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.7 3.86a2 2 0 00-3.4 0z',
  search: 'M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z',
}
function SvgIcon(props) {
  const { name, size, className } = props
  return h('svg', {
    className: className || 'tsd-icon',
    width: size || 16,
    height: size || 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }, h('path', { d: ICON_PATHS[name] || ICON_PATHS.activity }))
}

/* ---------------------------------------------------------------------------
 * 通用 Hook：外部点击关闭
 * ------------------------------------------------------------------------- */
function useOutsideClick(open, ref, onClose) {
  React.useEffect(() => {
    if (!open) return undefined
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [open, onClose, ref])
}

/* ---------------------------------------------------------------------------
 * Header：标题 + 副标题 + 刷新按钮
 * ------------------------------------------------------------------------- */
function StatsHeader(props) {
  const { busy, onRefresh } = props
  const t = useT()
  return h('div', { className: 'tsd-header' },
    h('div', { className: 'tsd-header-text' },
      h('h2', { className: 'tsd-title' }, t('nav')),
      h('p', { className: 'tsd-subtitle' }, t('subtitle'))),
    h('button', {
      type: 'button',
      className: 'tsd-icon-btn' + (busy ? ' tsd-spinning' : ''),
      onClick: onRefresh,
      title: t('refresh'),
      'aria-label': t('refresh'),
    }, h(SvgIcon, { name: 'refresh' })))
}

/* ---------------------------------------------------------------------------
 * 自定义日期范围浮层
 * ------------------------------------------------------------------------- */
function CustomRangePopover(props) {
  const { custom, onApply, onClose } = props
  const t = useT()
  const [from, setFrom] = React.useState(custom.from)
  const [to, setTo] = React.useState(custom.to)
  const invalid = !from || !to || from > to
  // P2-11：dialog 以 Escape 关闭
  React.useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Esc') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return h('div', {
    className: 'tsd-popover tsd-range-popover',
    role: 'dialog',
    'aria-label': t('customRangeAria'),
  },
    h('div', { className: 'tsd-popover-title' }, t('customRangeTitle')),
    h('div', { className: 'tsd-range-fields' },
      h('label', { className: 'tsd-field' },
        h('span', { className: 'tsd-field-label' }, t('startTime')),
        h('input', {
          type: 'date', value: from, 'aria-label': t('startTime'),
          onChange: (e) => setFrom(e.target.value),
        })),
      h('label', { className: 'tsd-field' },
        h('span', { className: 'tsd-field-label' }, t('endTime')),
        h('input', {
          type: 'date', value: to, 'aria-label': t('endTime'),
          onChange: (e) => setTo(e.target.value),
        }))),
    invalid
      ? h('p', { className: 'tsd-field-error', role: 'alert' }, t('rangeInvalid'))
      : null,
    h('p', { className: 'tsd-field-hint' }, t('rangeHint')),
    h('div', { className: 'tsd-popover-actions' },
      h('button', { type: 'button', className: 'tsd-btn tsd-btn-ghost', onClick: onClose }, t('cancel')),
      h('button', {
        type: 'button', className: 'tsd-btn tsd-btn-primary',
        disabled: invalid,
        onClick: () => { if (!invalid) onApply({ from, to }) },
      }, t('confirm'))))
}

/* ---------------------------------------------------------------------------
 * 模型多选下拉
 * ------------------------------------------------------------------------- */
function ModelDropdown(props) {
  const { options, selected, onChange } = props
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const anchorRef = React.useRef(null)

  React.useEffect(() => {
    if (!open) return undefined
    function handler(e) {
      if (anchorRef.current && !anchorRef.current.contains(e.target)) setOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Esc') setOpen(false)
    }
    document.addEventListener('click', handler)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', handler)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // 只列出当前范围有数据的模型；已选但掉出候选列表的「补回」，保证可渲染、可清除
  const candidates = React.useMemo(() => {
    const set = new Set((options || []).map((m) => m.provider + '/' + m.model))
    ;(selected || []).forEach((m) => set.add(m))
    const list = Array.from(set)
    list.sort()
    return list
  }, [options, selected])

  const q = query.trim().toLocaleLowerCase()
  const filtered = q === '' ? candidates : candidates.filter((c) => c.toLocaleLowerCase().indexOf(q) >= 0)
  const label = selected.length === 0 ? t('allModels') : t('selectedModels', { count: selected.length })

  return h('div', { className: 'tsd-popover-anchor', ref: anchorRef },
    h('button', {
      type: 'button',
      className: 'tsd-select-btn' + (selected.length > 0 ? ' tsd-select-has' : ''),
      onClick: () => { setOpen((v) => !v); setQuery('') },
      'aria-expanded': open,
      'aria-haspopup': 'listbox',
      title: label,
    },
      h('span', { className: 'tsd-select-label' }, label),
      h(SvgIcon, { name: 'chevron', size: 14, className: 'tsd-chevron' + (open ? ' tsd-chevron-open' : '') })),
    open
      ? h('div', {
          className: 'tsd-popover tsd-model-popover',
          role: 'listbox',
          'aria-label': t('modelFilterGroup'),
          'aria-multiselectable': true,
        },
          h('div', { className: 'tsd-popover-tools' },
            h('button', { type: 'button', className: 'tsd-link-btn', onClick: () => onChange(candidates.slice()) }, t('selectAll')),
            h('button', { type: 'button', className: 'tsd-link-btn', onClick: () => onChange([]) }, t('clear'))),
          h('div', { className: 'tsd-search' },
            h(SvgIcon, { name: 'search', size: 14, className: 'tsd-search-icon' }),
            h('input', {
              type: 'search', value: query, placeholder: t('searchModels'),
              'aria-label': t('searchModels'),
              onChange: (e) => setQuery(e.target.value),
            })),
          h('div', { className: 'tsd-model-list' },
            filtered.length === 0
              ? h('p', { className: 'tsd-popover-empty' }, t('noMatchModels'))
              : null,
            filtered.map((key) =>
              h('label', { key, className: 'tsd-model-item' },
                h('input', {
                  type: 'checkbox',
                  checked: selected.indexOf(key) >= 0,
                  onChange: (e) => {
                    const next = selected.slice()
                    if (e.target.checked) {
                      if (next.indexOf(key) < 0) next.push(key)
                    } else {
                      const i = next.indexOf(key)
                      if (i >= 0) next.splice(i, 1)
                    }
                    onChange(next) // 勾选即时生效
                  },
                }),
                h('span', { className: 'tsd-model-name', title: key }, key)))),
          h('p', { className: 'tsd-popover-note' }, t('modelFilterHint')))
      : null)
}

/* ---------------------------------------------------------------------------
 * 筛选栏：日期预设（分段按钮）+ 自定义浮层 + 模型多选
 * ------------------------------------------------------------------------- */
function FilterBar(props) {
  const {
    range, custom, models, customOpen, modelOptions,
    onPreset, onCustomOpen, onCustomApply, onCustomClose, onModelsChange,
  } = props
  const t = useT()
  const segRef = React.useRef(null)
  useOutsideClick(customOpen, segRef, onCustomClose)

  const customLabel = fmtDateSlash(custom.from) + ' - ' + fmtDateSlash(custom.to)
  const presets = [
    { key: 'today', label: t('today') },
    { key: '7d', label: t('last7d') },
    { key: '30d', label: t('last30d') },
    { key: 'custom', label: t('custom') },
  ]

  return h('div', { className: 'tsd-filterbar' },
    h('div', { className: 'tsd-seg-wrap', ref: segRef },
      h('div', { className: 'tsd-seg', role: 'group', 'aria-label': t('dateRangeGroup') },
        presets.map((p) => {
          const active = range === p.key
          const isCustom = p.key === 'custom'
          const label = isCustom && active ? customLabel : p.label
          return h('button', {
            key: p.key,
            type: 'button',
            className: 'tsd-seg-btn' + (active ? ' tsd-seg-active' : '') + (isCustom ? ' tsd-seg-custom' : ''),
            'aria-pressed': active,
            title: isCustom && active ? customLabel : undefined,
            onClick: () => { if (isCustom) onCustomOpen(!customOpen); else onPreset(p.key) },
          },
            h('span', { className: 'tsd-seg-label' }, label))
        })),
      customOpen ? h(CustomRangePopover, { custom, onApply: onCustomApply, onClose: onCustomClose }) : null),
    h(ModelDropdown, { options: modelOptions, selected: models, onChange: onModelsChange }))
}

/* ---------------------------------------------------------------------------
 * 汇总指标卡 ×5
 * ------------------------------------------------------------------------- */
function SummaryCards(props) {
  const { total, currency, unpricedCalls } = props
  const tt = useT()
  const d = total || {}
  const inputTotal = (d.inputTokens || 0) + (d.cacheReadTokens || 0) + (d.cacheWriteTokens || 0)
  const cards = [
    {
      key: 'total', icon: 'layers', label: tt('totalTokens'),
      value: formatTokensShort(d.totalTokens), title: formatInt(d.totalTokens),
      sub: tt('approxIO'), color: 'var(--dsw-alias-brand-primary)',
    },
    {
      key: 'input', icon: 'down', label: tt('inputTokens'),
      value: formatTokensShort(inputTotal), title: formatInt(inputTotal),
      color: 'var(--dsw-static-deepseek-500)',
    },
    {
      key: 'output', icon: 'up', label: tt('outputTokens'),
      value: formatTokensShort(d.outputTokens), title: formatInt(d.outputTokens),
      color: 'var(--dsw-static-green-500)',
    },
    {
      key: 'calls', icon: 'activity', label: tt('calls'),
      value: formatInt(d.calls), title: formatInt(d.calls),
      color: 'var(--dsw-static-deepseek-500)',
    },
    {
      key: 'cost', icon: 'coins', label: tt('cost'),
      value: formatCost(d.cost, currency), title: formatCost(d.cost, currency),
      color: 'var(--dsw-static-green-500)',
    },
  ]
  return h('div', { className: 'tsd-cards' },
    cards.map((c) =>
      h('div', { key: c.key, className: 'tsd-card' },
        h('div', { className: 'tsd-card-head' },
          h('span', { className: 'tsd-card-icon', style: { color: c.color } },
            h(SvgIcon, { name: c.icon, size: 14 })),
          h('span', { className: 'tsd-card-label' }, c.label)),
        h('div', { className: 'tsd-card-value', title: c.title }, c.value),
        c.sub ? h('div', { className: 'tsd-card-sub' }, c.sub) : null,
        c.key === 'cost' && unpricedCalls > 0
          ? h('div', { className: 'tsd-card-note' }, tt('unpricedNote', { count: formatInt(unpricedCalls) }))
          : null)))
}

/* ---------------------------------------------------------------------------
 * 每日用量柱状图（手写 div 堆叠柱：下段输入蓝 / 上段输出绿）
 * ------------------------------------------------------------------------- */
function DailyChart(props) {
  const { daily, gran, stepDays, granLabel } = props
  const t = useT()
  const chartRef = React.useRef(null)
  const [tip, setTip] = React.useState(null) // { row, x }
  const [view, setView] = React.useState('bar') // bar | line
  const rows = daily || []

  const inOf = (r) => (r.inputTokens || 0) + (r.cacheReadTokens || 0) + (r.cacheWriteTokens || 0)
  const outOf = (r) => r.outputTokens || 0
  const totOf = (r) => r.totalTokens || 0

  if (rows.length === 0) {
    return h('div', { className: 'tsd-card tsd-chart-card' },
      h('div', { className: 'tsd-card-header' },
        h('h3', { className: 'tsd-card-title' }, t('dailyTrend')),
        h('span', { className: 'tsd-card-tag' }, t('noData'))),
      h('div', { className: 'tsd-empty-block' }, t('noData')))
  }

  const max = Math.max(1, ...rows.map((d) => d.totalTokens || 0))
  const labelEvery = rows.length > 28 ? 4 : rows.length > 14 ? 2 : 1
  const firstLabel = xLabel(rows[0].key, gran)
  const lastLabel = xLabel(rows[rows.length - 1].key, gran)
  const rangeLabel = firstLabel + ' - ' + lastLabel

  function showTip(e, row) {
    const chartRect = chartRef.current ? chartRef.current.getBoundingClientRect() : null
    if (!chartRect) return
    const elRect = e.currentTarget.getBoundingClientRect()
    const x = Math.min(Math.max(elRect.left + elRect.width / 2 - chartRect.left, 72), chartRect.width - 72)
    setTip({ row, x })
  }

  const viewSwitcher = h('div', { className: 'tsd-gran', role: 'group', 'aria-label': t('chartTypeGroup') },
    h('button', {
      type: 'button',
      className: 'tsd-gran-btn',
      'data-active': view === 'bar' ? 'true' : undefined,
      onClick: () => { setTip(null); setView('bar') },
    }, t('barView')),
    h('button', {
      type: 'button',
      className: 'tsd-gran-btn',
      'data-active': view === 'line' ? 'true' : undefined,
      onClick: () => { setTip(null); setView('line') },
    }, t('lineView')))

  const barTip = tip
    ? h('div', { className: 'tsd-tooltip', style: { left: tip.x + 'px' } },
        h('div', { className: 'tsd-tooltip-date' }, tip.row.key + ' ' + weekdayName(tip.row.key, t)),
        h('div', { className: 'tsd-tooltip-row' },
          h('span', { className: 'tsd-tooltip-dot tsd-legend-in' }),
          h('span', null, t('legendInput')),
          h('span', { className: 'tsd-tooltip-val' }, formatInt(inOf(tip.row)))),
        h('div', { className: 'tsd-tooltip-row' },
          h('span', { className: 'tsd-tooltip-dot tsd-legend-out' }),
          h('span', null, t('legendOutput')),
          h('span', { className: 'tsd-tooltip-val' }, formatInt(outOf(tip.row)))),
        h('div', { className: 'tsd-tooltip-total' },
          h('span', null, t('tooltipTotal')),
          h('span', null, formatInt(totOf(tip.row)))))
    : null

  const body = view === 'line'
    ? h(LineChart, { rows, gran, stepDays, showTip, tip, setTip, chartRef })
    : h('div', { className: 'tsd-chart', ref: chartRef },
        rows.map((row, i) => {
          const inT = inOf(row)
          const outT = outOf(row)
          const totT = totOf(row)
          const pctIn = (inT / max) * 100
          const pctOut = (outT / max) * 100
          const showLabel = i % labelEvery === 0 || i === rows.length - 1
          return h('div', {
            key: row.key,
            className: 'tsd-chart-col',
            tabIndex: 0,
            onMouseEnter: (e) => showTip(e, row),
            onMouseLeave: () => setTip(null),
            onFocus: (e) => showTip(e, row),
            onBlur: () => setTip(null),
            'aria-label': t('barAria', { key: row.key, in: formatInt(inT), out: formatInt(outT), tot: formatInt(totT) }),
          },
            h('div', { className: 'tsd-chart-plot' },
              h('div', { className: 'tsd-chart-stack' },
                h('div', { className: 'tsd-chart-seg tsd-seg-out', style: { height: pctOut + '%' } }),
                h('div', { className: 'tsd-chart-seg tsd-seg-in', style: { height: pctIn + '%' } }))),
            h('span', {
              className: 'tsd-chart-label' + (showLabel ? '' : ' tsd-chart-label-hidden'),
            }, xLabel(row.key, gran)))
        }),
        barTip)

  return h('div', { className: 'tsd-card tsd-chart-card' },
    h('div', { className: 'tsd-card-header' },
      h('h3', { className: 'tsd-card-title' }, t('dailyTrend')),
      h('span', { className: 'tsd-card-actions' },
        h('span', { className: 'tsd-card-tag' }, granLabel + ' · ' + rangeLabel),
        viewSwitcher)),
    h('div', { className: 'tsd-legend' },
      h('span', { className: 'tsd-legend-item' },
        h('span', { className: 'tsd-legend-dot tsd-legend-in' }), t('legendInput')),
      h('span', { className: 'tsd-legend-item' },
        h('span', { className: 'tsd-legend-dot tsd-legend-out' }), t('legendOutput')),
      h('span', { className: 'tsd-legend-item' },
        h('span', { className: 'tsd-legend-dot tsd-legend-total' }), t('legendTotal'))),
    body)
}

/* ---------------------------------------------------------------------------
 * 折线图（SVG：输入 / 输出 / 总 Token）
 * ------------------------------------------------------------------------- */
/** Catmull-Rom -> cubic bezier smooth path through the given points. */
function smoothPath(pts) {
  if (!pts || pts.length < 2) return ''
  const f = (v) => Math.round(v * 100) / 100
  let d = 'M ' + f(pts[0].x) + ' ' + f(pts[0].y)
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] || p2
    const c1x = p1.x + (p2.x - p0.x) / 6
    const c1y = p1.y + (p2.y - p0.y) / 6
    const c2x = p2.x - (p3.x - p1.x) / 6
    const c2y = p2.y - (p3.y - p1.y) / 6
    d += ' C ' + f(c1x) + ' ' + f(c1y) + ', ' + f(c2x) + ' ' + f(c2y) + ', ' + f(p2.x) + ' ' + f(p2.y)
  }
  return d
}

function LineChart(props) {
  const { rows, gran, stepDays, showTip, tip, setTip, chartRef } = props
  const t = useT()
  const W = 620
  const H = 240
  const PAD = { t: 14, r: 14, b: 26, l: 48 }
  const innerW = W - PAD.l - PAD.r
  const innerH = H - PAD.t - PAD.b
  const n = rows.length

  const inOf = (r) => (r.inputTokens || 0) + (r.cacheReadTokens || 0) + (r.cacheWriteTokens || 0)
  const outOf = (r) => r.outputTokens || 0
  const totOf = (r) => r.totalTokens || 0
  const max = Math.max(1, ...rows.map((d) => d.totalTokens || 0))
  const niceMax = niceCeil(max)

  const x = (i) => PAD.l + (n === 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v) => PAD.t + innerH - (v / niceMax) * innerH
  const colW = innerW / n

  // Hover state: pixel x for the tooltip, viewBox x for the cursor + dots.
  function showTipLine(e, row) {
    const rect = chartRef.current ? chartRef.current.getBoundingClientRect() : null
    if (!rect || rect.width === 0) return
    const elRect = e.currentTarget.getBoundingClientRect()
    const xPx = elRect.left + elRect.width / 2 - rect.left
    const svgX = (xPx / rect.width) * W
    const x = Math.min(Math.max(xPx, 72), rect.width - 72)
    setTip({ row, x, svgX })
  }
  const trow = tip ? tip.row : null
  const cursor = tip
    ? h('line', {
        key: 'cursor',
        className: 'tsd-line-cursor',
        x1: tip.svgX, y1: PAD.t, x2: tip.svgX, y2: H - PAD.b,
      })
    : null
  const dots = tip
    ? [
        h('circle', { key: 'hl-in', className: 'tsd-line-hl tsd-line-hl-in', cx: tip.svgX, cy: y(inOf(trow)), r: 3.5 }),
        h('circle', { key: 'hl-out', className: 'tsd-line-hl tsd-line-hl-out', cx: tip.svgX, cy: y(outOf(trow)), r: 3.5 }),
        h('circle', { key: 'hl-tot', className: 'tsd-line-hl tsd-line-hl-total', cx: tip.svgX, cy: y(totOf(trow)), r: 3.5 }),
      ]
    : null

  const inPts = smoothPath(rows.map((r, i) => ({ x: x(i), y: y(inOf(r)) })))
  const outPts = smoothPath(rows.map((r, i) => ({ x: x(i), y: y(outOf(r)) })))
  const totPts = smoothPath(rows.map((r, i) => ({ x: x(i), y: y(totOf(r)) })))
  const gridF = [0, 0.25, 0.5, 0.75, 1]
  const labelEvery = rows.length > 28 ? 4 : rows.length > 14 ? 2 : 1
  const showLabel = (i) => i % labelEvery === 0 || i === rows.length - 1

  return h('div', { className: 'tsd-linechart', ref: chartRef },
    h('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': t('lineChartAria') },
      // grid + axis
      gridF.map((f) =>
        h('line', {
          key: 'g' + f,
          className: 'tsd-line-grid',
          x1: PAD.l, y1: y(f * niceMax), x2: W - PAD.r, y2: y(f * niceMax),
        })),
      h('line', { className: 'tsd-line-axis', x1: PAD.l, y1: PAD.t, x2: PAD.l, y2: H - PAD.b }),
      h('line', { className: 'tsd-line-axis', x1: PAD.l, y1: H - PAD.b, x2: W - PAD.r, y2: H - PAD.b }),
      // y labels
      gridF.map((f) =>
        h('text', {
          key: 'yt' + f,
          className: 'tsd-line-text',
          x: PAD.l - 6,
          y: y(f * niceMax) + 3,
          textAnchor: 'end',
        }, formatTokensShort(f * niceMax))),
      // series (smooth curves)
      h('path', { className: 'tsd-line-total', d: totPts }),
      h('path', { className: 'tsd-line-in', d: inPts }),
      h('path', { className: 'tsd-line-out', d: outPts }),
      cursor,
      dots,
      // x labels
      rows.map((r, i) =>
        showLabel(i)
          ? h('text', {
              key: 'xl' + i,
              className: 'tsd-line-text',
              x: x(i),
              y: H - 8,
              textAnchor: i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
            }, xLabel(r.key, gran))
          : null),
      // hover targets: a full-height column per bucket, matching the bar chart feel
      rows.map((r, i) =>
        h('rect', {
          key: 'h' + i,
          className: 'tsd-line-hover',
          x: x(i) - colW / 2,
          y: PAD.t,
          width: colW,
          height: innerH,
          tabIndex: 0,
          onMouseEnter: (e) => showTipLine(e, r),
          onMouseLeave: () => setTip(null),
          onFocus: (e) => showTipLine(e, r),
          onBlur: () => setTip(null),
        })),
      // visible dots on sparse points
      rows.map((r, i) =>
        i % labelEvery === 0 || i === n - 1
          ? h('circle', {
              key: 'd' + i,
              className: 'tsd-line-dot',
              cx: x(i),
              cy: y(totOf(r)),
              r: 2.5,
            })
          : null)),
    tip
      ? h('div', { className: 'tsd-tooltip', style: { left: tip.x + 'px' } },
          h('div', { className: 'tsd-tooltip-date' }, tip.row.key + (stepDays > 1 ? ' ' + t('startNDays', { n: stepDays }) : '') + ' ' + weekdayName(tip.row.key, t)),
          h('div', { className: 'tsd-tooltip-row' },
            h('span', { className: 'tsd-tooltip-dot tsd-legend-in' }),
            h('span', null, t('legendInput')),
            h('span', { className: 'tsd-tooltip-val' }, formatInt(inOf(tip.row)))),
          h('div', { className: 'tsd-tooltip-row' },
            h('span', { className: 'tsd-tooltip-dot tsd-legend-out' }),
            h('span', null, t('legendOutput')),
            h('span', { className: 'tsd-tooltip-val' }, formatInt(outOf(tip.row)))),
          h('div', { className: 'tsd-tooltip-total' },
            h('span', null, t('tooltipTotal')),
            h('span', null, formatInt(totOf(tip.row)))))
      : null)
}

/* ---------------------------------------------------------------------------
 * 年度用量热力图（GitHub 风格）
 * ------------------------------------------------------------------------- */
function HeatmapCard(props) {
  const { days } = props
  const t = useT()
  const [htip, setHtip] = React.useState(null) // { cell, left, top } in viewport coords
  const grid = React.useMemo(() => {
    const list = days || []
    if (list.length === 0) return null
    const max = Math.max(1, ...list.map((d) => d.totalTokens || 0))
    const first = new Date(list[0].key + 'T00:00:00')
    const offset = first.getDay() // 0 = Sunday
    const weeks = []
    let cur = []
    for (let i = 0; i < offset; i++) cur.push(null)
    for (const d of list) {
      cur.push(d)
      if (cur.length === 7) {
        weeks.push(cur)
        cur = []
      }
    }
    if (cur.length > 0) {
      while (cur.length < 7) cur.push(null)
      weeks.push(cur)
    }
    // 月份标记：某月 1 日所在的列
    const monthMarks = []
    weeks.forEach((wk, col) => {
      for (const c of wk) {
        if (c && c.key.endsWith('-01')) {
          monthMarks.push({ col, name: t('monthLabel', { n: Number(c.key.slice(5, 7)) }) })
          break
        }
      }
    })
    return { weeks, max, monthMarks }
  }, [days])

  if (grid === null) return null

  function showCellTip(e, c) {
    const elRect = e.currentTarget.getBoundingClientRect()
    setHtip({ cell: c, left: elRect.left + elRect.width / 2, top: elRect.top })
  }

  const heatTip = htip
    ? h('div', {
        className: 'tsd-tooltip tsd-heat-tip',
        style: { position: 'fixed', left: htip.left + 'px', top: htip.top + 'px', transform: 'translate(-50%, -110%)' },
      },
        h('div', { className: 'tsd-tooltip-date' }, htip.cell.key + ' ' + weekdayName(htip.cell.key, t)),
        h('div', { className: 'tsd-tooltip-row' },
          h('span', { className: 'tsd-tooltip-dot', style: { background: 'var(--dsw-static-deepseek-500)' } }),
          h('span', null, t('totalTokens')),
          h('span', { className: 'tsd-tooltip-val' }, formatInt(htip.cell.totalTokens || 0))),
        htip.cell.calls > 0
          ? h('div', { className: 'tsd-tooltip-row' },
              h('span', { className: 'tsd-tooltip-dot', style: { background: 'var(--dsw-alias-label-tertiary)' } }),
              h('span', null, t('calls')),
              h('span', { className: 'tsd-tooltip-val' }, formatInt(htip.cell.calls)))
          : null)
    : null

  const dayNames = ['', t('weekdayMon'), '', t('weekdayWed'), '', t('weekdayFri'), '']
  const legendSteps = [0, 0.25, 0.5, 0.75, 1]

  return h('div', { className: 'tsd-card tsd-heatmap-card' },
    h('div', { className: 'tsd-card-header' },
      h('h3', { className: 'tsd-card-title' }, t('yearlyHeatmap')),
      h('span', { className: 'tsd-card-tag' }, t('yearDaily', { year: new Date().getFullYear() }))),
    h('div', { className: 'tsd-heatmap' },
      h('div', { className: 'tsd-heatmap-inner' },
        h('div', { className: 'tsd-heatmap-months' },
          grid.monthMarks.map((m) =>
            h('span', {
              key: m.col,
              className: 'tsd-heatmap-month',
              style: { left: (m.col * 12) + 'px' },
            }, m.name))),
        h('div', { className: 'tsd-heatmap-body' },
          h('div', { className: 'tsd-heatmap-days' },
            dayNames.map((n, i) =>
              h('span', { key: i, className: 'tsd-heatmap-day' }, n))),
          h('div', { className: 'tsd-heatmap-grid' },
            grid.weeks.map((wk, col) =>
              h('div', { key: col, className: 'tsd-heatmap-col' },
                wk.map((c, row) =>
                  c
                    ? h('span', {
                        key: c.key,
                        className: 'tsd-heatmap-cell',
                        style: { background: heatColor(c.totalTokens || 0, grid.max) },
                        title: t('hmTitle', { key: c.key, tokens: formatInt(c.totalTokens || 0), calls: c.calls ? t('hmCalls', { count: formatInt(c.calls) }) : '' }),
                        onMouseEnter: (e) => showCellTip(e, c),
                        onMouseLeave: () => setHtip(null),
                        onFocus: (e) => showCellTip(e, c),
                        onBlur: () => setHtip(null),
                        tabIndex: 0,
                      })
                    : h('span', { key: 'e' + col + '-' + row, className: 'tsd-heatmap-cell', style: { visibility: 'hidden' } }))))))),
    heatTip,
    h('div', { className: 'tsd-heatmap-legend' },
      h('span', null, t('less')),
      legendSteps.map((s) =>
        h('span', {
          key: s,
          className: 'tsd-heatmap-cell',
          style: { background: s === 0 ? 'var(--dsw-alias-interactive-bg-hover)' : heatColor(Math.max(1, s * 100), 100) },
        })),
      h('span', null, t('more')))))
}

/* ---------------------------------------------------------------------------
 * 按模型明细表
 * ------------------------------------------------------------------------- */
function ModelTable(props) {
  const { rows, currency } = props
  const t = useT()
  const all = rows || []
  const [sortKey, setSortKey] = React.useState('total')
  const [sortDir, setSortDir] = React.useState('desc')

  const view = React.useMemo(() => all.map((r) => ({
    key: r.key,
    calls: r.calls || 0,
    input: (r.inputTokens || 0) + (r.cacheReadTokens || 0) + (r.cacheWriteTokens || 0),
    output: r.outputTokens || 0,
    total: r.totalTokens || 0,
    cost: r.cost || 0,
    unpriced: (r.totalTokens || 0) > 0 && !(r.cost > 0),
  })), [all])

  const sumTotal = React.useMemo(() => view.reduce((s, r) => s + r.total, 0), [view])

  const sorted = React.useMemo(() => {
    const list = view.slice()
    const dir = sortDir === 'asc' ? 1 : -1
    list.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      if (av === bv) return 0
      return (av > bv ? 1 : -1) * dir
    })
    return list
  }, [view, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const cols = [
    { key: 'model', label: t('colModel'), sortable: false },
    { key: 'calls', label: t('colCalls'), sortable: true },
    { key: 'input', label: t('colInput'), sortable: true },
    { key: 'output', label: t('colOutput'), sortable: true },
    { key: 'total', label: t('colTotal'), sortable: true },
    { key: 'cost', label: t('colCost'), sortable: true },
    { key: 'ratio', label: t('colShare'), sortable: false },
  ]

  return h('div', { className: 'tsd-card tsd-table-card' },
    h('div', { className: 'tsd-card-header' },
      h('h3', { className: 'tsd-card-title' }, t('byModelTitle')),
      h('span', { className: 'tsd-card-tag' },
        t('modelCount', { n: view.length }) + ' · ' + t('colTotal') + ' ' + formatInt(sumTotal))),
    view.length === 0
      ? h('div', { className: 'tsd-empty-block' }, t('noData'))
      : h('div', { className: 'tsd-table-wrap' },
          h('table', { className: 'tsd-table' },
            h('caption', { className: 'tsd-visually-hidden' }, t('modelTableCaption')),
            h('thead', null,
              h('tr', null, cols.map((c) =>
                h('th', {
                  key: c.key,
                  className: 'tsd-th' + (c.key === 'model' ? '' : ' tsd-th-num'),
                },
                  c.sortable
                    ? h('button', {
                        type: 'button',
                        className: 'tsd-sort-btn' + (sortKey === c.key ? ' tsd-sort-active' : ''),
                        onClick: () => toggleSort(c.key),
                      },
                        c.label,
                        sortKey === c.key
                          ? h('span', { className: 'tsd-sort-arrow' }, sortDir === 'asc' ? '↑' : '↓')
                          : null)
                    : c.label)))),
            h('tbody', null, sorted.map((r) => {
              const ratio = sumTotal > 0 ? r.total / sumTotal : 0
              return h('tr', { key: r.key, className: 'tsd-tr' },
                h('td', { className: 'tsd-td tsd-td-model' },
                  h('span', { className: 'tsd-model-mono', title: r.key }, r.key)),
                h('td', { className: 'tsd-td tsd-num' }, formatInt(r.calls)),
                h('td', { className: 'tsd-td tsd-num' }, formatInt(r.input)),
                h('td', { className: 'tsd-td tsd-num' }, formatInt(r.output)),
                h('td', { className: 'tsd-td tsd-num tsd-total' }, formatInt(r.total)),
                h('td', { className: 'tsd-td tsd-num' },
                  r.unpriced
                    ? h('span', { className: 'tsd-unpriced', title: t('unpricedRowHint') }, t('unpriced'))
                    : formatCost(r.cost, currency)),
                h('td', { className: 'tsd-td tsd-td-ratio' },
                  h('div', { className: 'tsd-ratio' },
                    h('div', { className: 'tsd-ratio-bar' },
                      h('div', { className: 'tsd-ratio-fill', style: { width: ratio * 100 + '%' } })),
                    h('span', { className: 'tsd-ratio-pct' }, fmtPct(ratio)))))
            })))))
}

/* ---------------------------------------------------------------------------
 * 三态：加载 / 错误 / 空
 * ------------------------------------------------------------------------- */
function LoadingState() {
  const t = useT()
  return h('div', { className: 'tsd-loading' },
    h('div', { className: 'tsd-cards' },
      [0, 1, 2, 3, 4].map((i) =>
        h('div', { key: i, className: 'tsd-card tsd-card-skeleton' },
          h('div', { className: 'tsd-skeleton', style: { width: '40%', height: 12 } }),
          h('div', { className: 'tsd-skeleton', style: { width: '70%', height: 22, marginTop: 10 } })))),
    h('div', { className: 'tsd-card' },
      h('div', { className: 'tsd-skeleton', style: { width: '100%', height: 300 } })),
    h('div', { className: 'tsd-card' },
      [0, 1, 2, 3, 4, 5].map((i) =>
        h('div', { key: i, className: 'tsd-skeleton-row', style: { width: 96 - i * 8 + '%' } }))))
}

function ErrorState(props) {
  const { error, onRetry } = props
  const t = useT()
  return h('div', { className: 'tsd-card tsd-error', role: 'alert' },
    h(SvgIcon, { name: 'alert', size: 22, className: 'tsd-error-icon' }),
    h('div', { className: 'tsd-error-text' },
      h('p', { className: 'tsd-error-title' }, t('loadFailedTitle')),
      h('p', { className: 'tsd-error-detail' }, String((error && error.message) || error))),
    h('button', { type: 'button', className: 'tsd-btn tsd-btn-primary', onClick: onRetry }, t('retry')))
}

function EmptyState(props) {
  const { filtered, onReset } = props
  const t = useT()
  return h('div', { className: 'tsd-card tsd-empty' },
    h(SvgIcon, { name: 'inbox', size: 28, className: 'tsd-empty-icon' }),
    h('p', { className: 'tsd-empty-title' }, t('noData')),
    h('p', { className: 'tsd-empty-desc' },
      filtered ? t('emptyFiltered') : t('emptyDesc')),
    h('button', { type: 'button', className: 'tsd-btn tsd-btn-ghost', onClick: onReset }, t('resetFilters')))
}

/* ---------------------------------------------------------------------------
 * 页面级状态机 + 布局
 * ------------------------------------------------------------------------- */
function StatsDashboard(props) {
  const t = props.t || fallbackT
  const [range, setRange] = React.useState('today') // today | 7d | 30d | custom
  const [custom, setCustom] = React.useState(defaultCustom)
  const [models, setModels] = React.useState([]) // [] = 全部模型
  const [customOpen, setCustomOpen] = React.useState(false)
  const [retry, setRetry] = React.useState(0)
  const [status, setStatus] = React.useState('loading') // loading | refreshing | ready | error
  const [data, setData] = React.useState(null)
  const [error, setError] = React.useState(null)
  const [prices, setPrices] = React.useState({ prices: {}, currency: '¥' })
  // P1-6 backfill 轮询状态：queryKey 变化时重置，仅对同一查询串轮询
  const queryKeyRef = React.useRef(null)
  const backfillSeenRef = React.useRef(false)
  const finalRefreshRef = React.useRef(false)

  const eff = React.useMemo(() => rangeFor(range, custom), [range, custom])
  // Fixed step policy: today = hourly; 7d/30d/custom = daily, custom uses a
  // stable step (1/3/5/7 days) chosen by the range length.
  const effGran = effGranularity(range)
  const stepDays = range === 'custom' ? pickStepDays((eff.to || 0) - (eff.from || 0)) : 1
  const granLabel = stepLabel(t, range, stepDays)

  // 查询统计（首载骨架；刷新保留旧数据转 refreshing；fill 0 填充 + 年度热力图）
  // P1-6：backfill running 时每 3s 自动重查；done 后补一次收尾查询即停。
  React.useEffect(() => {
    let current = true
    let backfillTimer = null
    const queryKey = eff.from + '|' + eff.to + '|' + models.join(',') + '|' + effGran + '|' + stepDays
    if (queryKeyRef.current !== queryKey) {
      queryKeyRef.current = queryKey
      backfillSeenRef.current = false
      finalRefreshRef.current = false
    }
    const isFinalRun = finalRefreshRef.current
    finalRefreshRef.current = false
    setStatus((s) => (s === 'ready' && data !== null ? 'refreshing' : 'loading'))
    hostCall('usage/query', {
      from: eff.from,
      to: eff.to,
      models: models.slice(),
      fill: true,
      granularity: effGran,
      stepDays,
      heatmap: true,
    })
      .then((r) => {
        if (!current) return
        setData(r)
        setStatus('ready')
        setError(null)
        const bs = r && r.backfill ? r.backfill.status : null
        if (bs === 'running') {
          backfillSeenRef.current = true
          // 同一 effect 至多挂一个定时器；重查复用 retry 计数器触发 effect 重跑
          backfillTimer = setTimeout(() => {
            if (current) setRetry((v) => v + 1)
          }, 3000)
        } else if (bs === 'done' && backfillSeenRef.current && !isFinalRun) {
          // 回填收尾：恰好再查一次拿到完整数据后停止
          finalRefreshRef.current = true
          setRetry((v) => v + 1)
        }
      }, (e) => {
        if (!current) return
        setError(e)
        setStatus('error')
      })
    return () => {
      current = false
      if (backfillTimer !== null) clearTimeout(backfillTimer)
    }
  }, [eff.from, eff.to, models, effGran, stepDays, retry])

  // 价格表：进入页面拉一次 + 每次刷新同步。
  // P0-1：优先官方 settings scope（usage.prices 命名空间），不可用时回退 RPC。
  React.useEffect(() => {
    let current = true
    let scopeDispose = null
    const loadRpc = () => {
      hostCall('usage/prices').then((p) => {
        if (current && p && p.prices) setPrices(p)
      }, () => {})
    }
    try {
      const scope = getUsagePricesScope()
      if (scope && typeof scope.getSnapshot === 'function' && typeof scope.subscribe === 'function') {
        let adopted = false
        const adopt = () => {
          if (!current) return
          const snap = scope.getSnapshot()
          const v = snap && snap.value
          if (snap && snap.status === 'unavailable') return
          if (v && (v.prices || v.currency)) {
            adopted = true
            setPrices({ prices: v.prices || {}, currency: v.currency || '¥' })
          }
        }
        adopt()
        scopeDispose = scope.subscribe(adopt)
        if (!adopted) loadRpc() // scope 未就绪/无值：先走 RPC，订阅就绪后 scope 优先覆盖
      } else {
        loadRpc()
      }
    } catch (e) {
      loadRpc() // 探测/绑定异常：完整回退 RPC，绝不抛出
    }
    return () => {
      current = false
      if (scopeDispose) {
        try { scopeDispose() } catch (e) {}
      }
    }
  }, [retry])

  const reload = React.useCallback(() => setRetry((v) => v + 1), [])

  const resetFilters = React.useCallback(() => {
    setModels([])
    setCustom(defaultCustom())
    setRange('today')
  }, [])

  const busy = status === 'loading' || status === 'refreshing'
  const ready = data !== null
  const isError = status === 'error'
  const isEmpty = ready && data.daily.length === 0 && data.byModel.length === 0

  return h(T.Provider, { value: t },
    h('div', { className: 'tsd-section', 'aria-busy': busy || undefined },
    h(StatsHeader, { busy, onRefresh: reload }),
    h(FilterBar, {
      range,
      custom,
      models,
      customOpen,
      modelOptions: data ? data.models : [],
      onPreset: (p) => { setRange(p); setCustomOpen(false) },
      onCustomOpen: (open) => { setRange('custom'); setCustomOpen(open) },
      onCustomApply: (c) => { setCustom(c); setCustomOpen(false) },
      onCustomClose: () => setCustomOpen(false),
      onModelsChange: setModels,
    }),
    isError && !ready
      ? h(ErrorState, { error, onRetry: reload })
      : null,
    !ready && !isError
      ? h(LoadingState, null)
      : null,
    ready && isError
      ? h('div', { className: 'tsd-alert-banner', role: 'alert' },
          h('span', null, t('loadFailed', { message: String((error && error.message) || error) })),
          h('button', { type: 'button', className: 'tsd-btn tsd-btn-ghost', onClick: reload }, t('retry')))
      : null,
    ready && !isError && isEmpty
      ? h(EmptyState, { filtered: models.length > 0, onReset: resetFilters })
      : null,
    ready && !isError && !isEmpty
      ? h('div', { className: 'tsd-content', 'data-busy': busy ? 'true' : undefined },
          h(SummaryCards, {
            total: data.total,
            currency: prices.currency || '¥',
            unpricedCalls: data.unpricedCalls || 0,
          }),
          h(DailyChart, {
            daily: data.daily,
            gran: effGran,
            stepDays,
            granLabel,
          }),
          h(HeatmapCard, { days: data.heatmap || [] }),
          h(ModelTable, { rows: data.byModel, currency: prices.currency || '¥' }))
      : null))
}

/* ---------------------------------------------------------------------------
 * 注册：settings.section 页面
 * ------------------------------------------------------------------------- */
function apply(ctx) {
  usageCtx = ctx
  _usagePricesScope = null // 每次激活重绑，避免复用已释放的 scope
  ctx.effect(() => {
    if (typeof styles !== 'undefined' && styles && typeof styles.insert === 'function') {
      return styles.insert(CSS)
    }
    if (typeof document !== 'undefined') {
      const el = document.createElement('style')
      el.setAttribute('data-plugin', 'dsh-plugin-usage')
      el.textContent = CSS
      document.head.appendChild(el)
      return () => { el.remove() }
    }
  }, 'usage: styles')
  ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'usage: dictionaries')
  const t0 = ctx.locale ? ctx.locale.bind(NS) : fallbackT
  // cordis ctx is a strict proxy: DIRECT property access on an un-injected
  // service throws ("cannot get property X without inject"), so a bare
  // `ctx.slots ?? ...` would throw and skip the fallback. Probe via the safe
  // ctx.get() first; fall back to the injected property (available once
  // 'slots' is declared in the inject list below).
  let slots = null
  try {
    slots = typeof ctx.get === 'function' ? ctx.get('slots') : null
  } catch (e) {
    slots = null
  }
  if (!slots || typeof slots.inject !== 'function') {
    try {
      if (ctx.slots && typeof ctx.slots.inject === 'function') slots = ctx.slots
    } catch (e) {
      slots = null
    }
  }
  if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') {
    console.warn('[usage] settings.section slot unavailable')
    return
  }
  slots.inject('settings.section', () => slots.register(
    { name: 'settings.section', id: 'token-stats', order: 20, label: () => t0('nav'), locale: NS },
    (props) => h(StatsDashboard, props),
  ))
}

return { inject: ['locale', 'slots'], apply }
