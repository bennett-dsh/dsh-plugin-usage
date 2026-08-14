// Token 用量统计 — 全部样式（tsd- 前缀；颜色一律使用 DSW 主题变量，深浅色自适应）
export const CSS = `
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

/* ============ 定价配置 ============ */
.tsd-details {
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-3);
  border-radius: 12px;
  box-shadow: var(--dsw-shadow-lv1);
  overflow: hidden;
}
.tsd-details-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 16px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--dsw-alias-label-primary);
  list-style: none;
  user-select: none;
}
.tsd-details-summary::-webkit-details-marker { display: none; }
.tsd-details-summary:hover { background: var(--dsw-alias-interactive-bg-hover); }
.tsd-details-count {
  font-size: 12px;
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary);
}
.tsd-details-body {
  padding: 0 16px 14px;
  border-top: 1px solid var(--dsw-alias-border-l1);
  overflow-x: auto;
}
.tsd-price-head,
.tsd-price-row {
  display: grid;
  grid-template-columns: minmax(120px, 1.4fr) repeat(4, minmax(72px, 1fr)) minmax(64px, auto);
  gap: 8px;
  align-items: center;
  min-width: 560px;
}
.tsd-price-head {
  padding: 10px 0 6px;
}
.tsd-price-col {
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.tsd-price-row {
  padding: 6px 0;
  border-top: 1px solid var(--dsw-alias-border-l1);
}
.tsd-price-model-name {
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  color: var(--dsw-alias-label-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.tsd-price-row input {
  box-sizing: border-box;
  width: 100%;
  height: 28px;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  border-radius: 6px;
  font: inherit;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  outline: none;
}
.tsd-price-row input:focus {
  border-color: var(--dsw-alias-state-business-primary);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary) 18%, transparent);
}
.tsd-price-save {
  height: 28px;
  padding: 0 10px;
  font-size: 12px;
}
.tsd-price-saved,
.tsd-price-save[data-saved=true] {
  color: var(--dsw-alias-state-success-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 40%, transparent);
}
.tsd-price-err {
  grid-column: 1 / -1;
  margin: 2px 0 0;
  font-size: 11px;
  color: var(--dsw-alias-state-error-primary);
}
.tsd-price-note {
  margin: 10px 0 0;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
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
.tsd-sort-btn:focus-visible,
.tsd-details-summary:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}
`
