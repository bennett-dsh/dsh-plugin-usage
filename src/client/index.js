// ============================================================================
// Token 用量统计 — settings.section Client UI（纯 JS，动态插件沙箱）
// 可用全局：React / ctx / styles / host / console；浏览器全局 Date / Intl 等。
// 样式就是本文件里的 `const CSS`：沙箱没有 import，样式必须随这个 body 一起走，
// 所以它是**唯一**一份。原先并存的 src/client/styles.js 早已与它分叉（少了 104 个
// 选择器、还留着 9 个已删的），改它不生效，2026-11-01 删掉。
// ============================================================================
const CSS = `
/* ============ 布局 ============ */
.tsd-section {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
  color: var(--dsw-alias-label-primary);
  animation: tsd-fade-in 0.4s var(--ds-ease-in-out);
}
/* 刷新中的那条细进度条：贴在本节顶部，绝对定位所以不推动版面、不碰任何数字。
   用它而不是把整块内容压暗 —— 已有数字本来就是对的，压暗只让人以为在重算。 */
.tsd-progress {
  position: absolute;
  inset: -6px 0 auto 0;
  height: 2px;
  overflow: hidden;
  border-radius: 2px;
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent);
  pointer-events: none;
}
.tsd-progress::after {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 35%;
  border-radius: inherit;
  background: var(--dsw-alias-brand-primary);
  animation: tsd-indeterminate 1.2s var(--ds-ease-in-out) infinite;
}
/* 知道分母时改成确定进度：宽度就是 done/total，不再来回扫 —— 用户看到的
   "算到哪了"是真的，而不是一个装忙的动画。 */
.tsd-progress[data-determinate=true]::after {
  width: var(--tsd-progress, 0%);
  animation: none;
  transform: none;
  transition: width 240ms var(--ds-ease-in-out);
}
@keyframes tsd-indeterminate {
  from { transform: translateX(-40%); }
  to { transform: translateX(300%); }
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
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
}
.tsd-icon-btn:hover {
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.tsd-icon-btn:disabled {
  cursor: default;
  opacity: 0.6;
}
.tsd-icon-btn:disabled:hover {
  color: var(--dsw-alias-label-secondary);
  background: transparent;
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
  box-sizing: border-box;
  width: 320px;
  max-width: calc(100vw - 24px);
}
/* 浮层高度由 useFixedPanel 的 maxHeight 决定：只有列表可伸缩，其余部分不压缩 */
.tsd-model-popover > .tsd-popover-tools,
.tsd-model-popover > .tsd-search,
.tsd-model-popover > .tsd-popover-note,
.tsd-model-popover > .tsd-popover-empty { flex: none; }
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
  flex: 1 1 auto;
  min-height: 0;
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

/* ============ 币种切换（参考成本卡数值行内） ============ */
/* 数值行最前只放一个「符号 + 小箭头」的图标式触发器：符号本身就是读数的一部分，
   尺寸/字重/基线继承数值行，读起来像数字前缀而不是一个控件。
   符号只在这里画一次，formatCost 不再重复带符号。 */
.tsd-cur-anchor {
  position: relative;
  display: inline-flex;
}
.tsd-cur-btn {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  margin: 0 2px 0 0;
  padding: 0 2px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font: inherit;
  line-height: inherit;
  vertical-align: baseline;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}
.tsd-cur-btn:hover,
.tsd-cur-btn-open {
  color: var(--dsw-alias-brand-primary);
  background: var(--dsw-alias-interactive-bg-hover);
}
.tsd-cur-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.tsd-cur-chevron {
  flex: none;
  align-self: center;
  transition: transform 0.15s ease;
}
.tsd-cur-btn-open .tsd-cur-chevron { transform: rotate(180deg); }
.tsd-cur-popover {
  box-sizing: border-box;
  width: 180px;
  max-width: calc(100vw - 24px);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* 浮层挂在 .tsd-card-value 里，那边为了数值行写了 nowrap；
     浮层里的菜单项与说明必须恢复换行，否则长文案会横着溢出浮层。 */
  white-space: normal;
}
.tsd-cur-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}
.tsd-cur-option:hover { background: var(--dsw-alias-interactive-bg-hover); }
.tsd-cur-option:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.tsd-cur-symbol {
  flex: none;
  width: 20px;
  text-align: center;
  font-weight: 600;
}
.tsd-cur-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
}
.tsd-cur-option-active { background: var(--dsw-alias-interactive-bg-hover); }
.tsd-cur-check {
  margin-left: auto;
  color: var(--dsw-alias-brand-primary);
}

/* ============ 模型占比（KPI 卡第 6 格） ============ */
/* 主体是占比条，下方模型名与百分比压成脚注（11px tertiary），
   与其它卡的大数字形成层级差，不抢 KPI 的读数位置。 */
.tsd-card-share-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  /* 对齐 .tsd-card-value 的上边距，六张卡保持同一基线 */
  margin-top: 8px;
}
.tsd-share-track {
  display: flex;
  align-items: stretch;
  width: 100%;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--dsw-alias-interactive-bg-hover);
}
.tsd-share-seg {
  height: 100%;
  min-width: 2px;
  outline: none;
  opacity: 0.9;
  transition: opacity 0.12s ease;
}
.tsd-share-seg:hover,
.tsd-share-seg:focus-visible,
.tsd-share-seg[data-active='true'] { opacity: 1; }
.tsd-share-caption {
  display: flex;
  align-items: baseline;
  gap: 6px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-tertiary);
}
.tsd-share-cap-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tsd-share-cap-pct {
  flex: none;
  font-variant-numeric: tabular-nums;
}
.tsd-share-empty {
  font-size: 14px;
  font-weight: 400;
  color: var(--dsw-alias-label-tertiary);
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
/* 标题带提示时给一个可发现的记号：虚线底边 + 感叹号按钮（见 HintTip）。
   悬浮用原生 title，点击展开浮层；两段规则都在这一个组件里，别处不再各画一份。 */
.tsd-card-label[title] {
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 2px;
}
.tsd-hint {
  display: inline-flex;
  align-items: center;
}
.tsd-hint-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: help;
}
.tsd-hint-btn:hover,
.tsd-hint-btn-open {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.tsd-hint-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
/* 浮层里两段规则分段读；行的左右内边距由 .tsd-popover 给，这里只补段间距 */
.tsd-hint-line {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
}
.tsd-hint-line + .tsd-hint-line {
  margin-top: 6px;
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
  color: var(--dsw-alias-label-tertiary);
  line-height: 1.35;
}
/* 未定价是「少算了钱」，不是普通提示：其余脚注用三级灰，这一行用警示色 */
.tsd-card-note-warn {
  color: var(--dsw-alias-state-warn-primary);
}
.tsd-card-notes {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
/* 参考成本卡的入口按钮：跟着标题走，不抢数值行的位置 */
.tsd-card-action {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.tsd-card-action:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.tsd-card-action:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
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
/* 不再 opacity: .55：那会让每次轮询都闪一下，且暗示"数字正在重算" ——
   事实上数字是上一轮的正确答案。刷新的信号交给顶部那条 2px 进度条与按钮转圈。 */
.tsd-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ============ 减少动态效果 ============ */
/* 官方客户端同样这么写（spinner / skeletonFill 都在 prefers-reduced-motion 下关动画），
   我们这两个无限动画（呼吸、旋转）此前一条都没关。 */
@media (prefers-reduced-motion: reduce) {
  .tsd-section { animation: none; }
  .tsd-spinning svg { animation: none; }
  .tsd-skeleton, .tsd-skeleton-row { animation: none; }
  .tsd-progress::after { animation: none; width: 100%; opacity: 0.55; }
}

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

/* ============ 输入区成本 pill（composer dock）============ */
.tsd-dock {
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 0.5px solid var(--dsw-alias-border-l1);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  cursor: default;
}
.tsd-dock-label {
  color: var(--dsw-alias-label-tertiary);
}
.tsd-dock-value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-primary);
}
/* ============ 定价匹配弹窗 ============ */
/* 遮罩铺满视口：设置面板是 overflow:hidden 的裁剪容器，弹窗不能挂在面板内部，
   否则宽屏下左右各被切掉一块。层级压过 popover(40)，低于任何系统级浮窗。 */
.tsd-price-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: var(--dsw-alias-bg-mask, rgba(0, 0, 0, 0.4));
}
.tsd-price-dialog {
  display: flex;
  flex-direction: column;
  width: min(760px, 100%);
  max-height: 100%;
  padding: 16px 18px 14px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 14px;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-shadow-lv3);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
}
.tsd-price-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tsd-price-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.tsd-price-close {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.tsd-price-close:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.tsd-price-desc {
  margin: 6px 0 10px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--dsw-alias-label-secondary);
}
/* 只有中段滚动：标题与底部按钮必须常驻，否则长表里够不到「确定」 */
.tsd-price-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.tsd-price-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  margin-bottom: 8px;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
}
.tsd-price-counts { color: var(--dsw-alias-label-secondary); }
.tsd-price-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.tsd-price-table-sub {
  margin-top: 10px;
}
.tsd-price-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 6px 8px;
  background: var(--dsw-alias-bg-layer-1);
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  font-weight: 500;
  font-size: 11px;
  color: var(--dsw-alias-label-tertiary);
  text-align: left;
  white-space: nowrap;
}
.tsd-price-table td {
  padding: 6px 8px;
  border-bottom: 1px solid var(--dsw-alias-border-l2);
  vertical-align: middle;
}
.tsd-price-row[data-dirty='true'] td {
  background: var(--dsw-alias-interactive-bg-hover);
}
.tsd-price-model {
  max-width: 240px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tsd-price-model-name {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 11.5px;
  font-weight: 500;
}
.tsd-price-model-provider {
  margin-left: 6px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 10.5px;
  color: var(--dsw-alias-label-tertiary);
}
/* 匹配目标格：整格是一颗紧凑的「选择」按钮（未匹配时虚线、文案是提示语），
   比每行摊两颗文字按钮安静得多；可搜索的下拉挂在它下面展开。 */
.tsd-price-target { max-width: 230px; }
.tsd-price-target-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 3px 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.tsd-price-target-btn:hover {
  border-color: var(--dsw-alias-label-tertiary);
  color: var(--dsw-alias-label-primary);
}
.tsd-price-target-btn:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.tsd-price-target-btn[data-empty='true'] {
  border-style: dashed;
  color: var(--dsw-alias-label-tertiary);
}
.tsd-price-target-id {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tsd-price-target-chev { flex: none; opacity: 0.7; }
/* 参考模型的来源标签：DeepSeek / Zen / 自定义。10px、无边框、只在格尾占一点点，
   免得把 id 挤掉 —— id 自己已经会 ellipsis。 */
.tsd-price-src {
  margin-left: 4px;
  padding: 0 3px;
  border-radius: 4px;
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-tertiary);
  font-size: 10px;
  white-space: nowrap;
}
.tsd-price-src[data-source='deepseek'] { color: var(--dsw-static-blue-500); }
.tsd-price-src[data-source='custom'] { color: var(--dsw-static-green-500); }
/* 候选列表里的分组表头：粘在滚动容器顶部，滚到哪都知道自己在看哪一类。 */
.tsd-price-pick-group {
  position: sticky;
  top: 0;
  padding: 4px 4px 2px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-tertiary);
  font-size: 10.5px;
  letter-spacing: 0.02em;
}
/* 空组（目前只有「自定义」）给一行说明，别让这一类隐形。 */
.tsd-price-pick-sep {
  margin: 4px 0;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
/* 「自定义」选项：顶部固定的一条，带一行说明。 */
.tsd-price-pick-custom {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  border: 1px dashed var(--dsw-alias-border-l2);
}
.tsd-price-pick-custom-label { font-weight: 500; color: var(--dsw-alias-label-primary); }
.tsd-price-pick-custom-hint { font-size: 11px; color: var(--dsw-alias-label-tertiary); }
/* 手填单价的三格：一行一个字段，输入框占满剩余宽度。 */
.tsd-price-custom-box { gap: 8px; }
.tsd-price-custom-title { font-weight: 500; }
.tsd-price-custom-field {
  display: flex;
  align-items: center;
  gap: 8px;
}
.tsd-price-custom-field > span {
  flex: none;
  width: 52px;
  color: var(--dsw-alias-label-secondary);
}
.tsd-price-custom-input {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
}
.tsd-price-custom-hint { color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.tsd-price-stale {
  margin-left: 6px;
  font-size: 11px;
  color: var(--dsw-alias-state-warn-primary);
}
.tsd-price-rate {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--dsw-alias-label-secondary);
}
/* 操作格：默认空着，只有「自定义 / 有改动」的行才给一颗还原图标。
   注意别给 td 设 display:flex —— 那会把单元格块级化，整列失去对齐。 */
.tsd-price-ops {
  width: 34px;
  text-align: right;
  white-space: nowrap;
}
.tsd-price-reset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 6px;
  background: none;
  color: var(--dsw-alias-label-tertiary);
  cursor: pointer;
}
.tsd-price-reset:hover {
  border-color: var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
}
.tsd-price-reset:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.tsd-btn-xs {
  height: 24px;
  padding: 0 8px;
  font-size: 12px;
  border-radius: 6px;
}
/* 带图标的按钮：图标与文字同一行，间距由 gap 给，别在文案里塞空格 */
.tsd-btn-icon-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
/* 参考模型候选是一座浮层（DSH 自己的模型选择器就是这种交互），不再塞进表格里：
   内联面板会把所在行撑高、把下面的行整体推走，看起来像表格坏了。 */
.tsd-price-pick-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
  padding: 6px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  box-shadow: var(--dsw-shadow-lv3);
}
/* 四态徽标：精确(蓝) / 模糊(琥珀) / 未匹配(灰) / 自定义(绿)，颜色族都用真实 token */
.tsd-price-badge {
  display: inline-block;
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 11px;
  line-height: 16px;
  white-space: nowrap;
  background: var(--dsw-static-neutral-200, rgba(128, 128, 128, 0.14));
  color: var(--dsw-alias-label-secondary);
}
.tsd-price-badge[data-state='exact'] {
  background: color-mix(in oklab, var(--dsw-static-deepseek-500) 16%, transparent);
  color: var(--dsw-static-deepseek-500);
}
.tsd-price-badge[data-state='fuzzy'] {
  background: color-mix(in oklab, var(--dsw-static-amber-500) 18%, transparent);
  color: var(--dsw-static-amber-500);
}
.tsd-price-badge[data-state='custom'] {
  background: color-mix(in oklab, var(--dsw-static-green-500) 16%, transparent);
  color: var(--dsw-static-green-500);
}
/* 未匹配态没有主题色可用：容器那层 background: none 把徽标底色抹掉了，只剩
   白字压在白底上。这里给它自己的底与字色，四态才都能看见。 */
.tsd-price-row[data-state='none'] .tsd-price-badge {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-secondary);
}
.tsd-price-pick-input {
  box-sizing: border-box;
  width: 100%;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 6px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
}
/* 候选列表自己滚，且必须自己封顶：useFixedPanel 只给位置和宽度，不给高度，
   89 个 id 摊开有近 2000px，不封顶就是一个超出视口的浮层。 */
.tsd-price-pick-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  max-height: 260px;
  overflow: auto;
}
.tsd-price-pick-item {
  padding: 4px 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.tsd-price-pick-item:hover { background: var(--dsw-alias-interactive-bg-hover); }
.tsd-price-pick-item-active { color: var(--dsw-static-deepseek-500); font-weight: 600; }
.tsd-price-history {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.tsd-price-history-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.tsd-price-history-chev { transition: transform 0.15s ease; }
.tsd-price-history-chev-open { transform: rotate(180deg); }
.tsd-price-empty,
.tsd-price-loading {
  padding: 18px 0;
  font-size: 12px;
  color: var(--dsw-alias-label-tertiary);
  text-align: center;
}
.tsd-price-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--dsw-alias-border-l2);
}
.tsd-price-hint {
  margin-left: auto;
  font-size: 11px;
  color: var(--dsw-alias-state-warn-primary);
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
      throw rpcError(body && body.error, 'RPC ' + endpoint + ' failed')
    })
  })
}

/**
 * 把宿主返回的 `{code, message}` 变成可显示的错误。
 *
 * 宿主对未处理的异常只发稳定的 `internal`，细节写在宿主日志里；界面上显示本插件的
 * 一句话，而不是原始堆栈（原始错误不上页面）。
 */
function rpcError(error, fallback) {
  const code = error && error.code
  const message = code === 'internal' ? fallbackT('rpcInternalError') : ((error && error.message) || fallback)
  const wrapped = new Error(message)
  if (code) wrapped.code = code
  return wrapped
}

// RPC bridge: dynamic-plugin runs provide a `host` global; static (bundle)
// installs provide ctx.get('connection'). Keep one UI source for both.
//
// Channel preference, native first: the plugin's own typert Remote namespace
// (`remote['dsh-plugin-usage']`, registered by src/host/typert.js), then the
// Fetch routes on Connection's shared /api channel, then the legacy /usage
// prefix channel. A Remote namespace that exists but fails (host restarted
// mid-flight, receiver gone) must fall through instead of bricking the page.
const USAGE_REMOTE_NAMESPACE = 'dsh-plugin-usage'

/**
 * Descriptors for the client-side mount.
 *
 * The gateway's browser half wants a `src-json` result (a direct invocation is
 * not result-decoded), while the host contribution declares a strict codec.
 * Everything else must match the host field for field.
 */
function remoteDescriptors(packageName, names) {
  const argsCodec = () => ({
    mode: 'strict',
    typeSymbol: packageName + '/typert#EndpointArgs',
    create: () => ({ parse: (value) => value }),
  })
  return names.map((name) => ({
    id: packageName + '#' + packageName + '/' + name,
    service: packageName,
    namespace: packageName,
    method: name,
    invocation: { kind: 'direct' },
    parameters: [{ name: 'args', wire: 'args', source: 'json', codec: argsCodec() }],
    result: { mode: 'src-json' },
  }))
}

/**
 * Join the native Remote channel on the browser side.
 *
 * A face registered at runtime on the host is invisible to the client's `remote`
 * proxy until the consumer mounts it. Until the mount lands — or if it never
 * does — hostCall keeps using the Fetch routes, so this is an optimization,
 * never a hard dependency.
 */
function mountRemoteChannel(scope) {
  let remote = null
  try {
    remote = scope.get('remote')
  } catch (e) {
    return
  }
  if (!remote || typeof remote.$mount !== 'function') return
  fetchCall('usage/contract', {}).then((contract) => {
    const names = contract && Array.isArray(contract.names) ? contract.names : []
    if (names.length === 0) return null
    const packageName = contract.package || USAGE_REMOTE_NAMESPACE
    return Promise.resolve(remote.$mount({ package: packageName, descriptors: remoteDescriptors(packageName, names) }))
  }).catch(() => {
    // Stay on the Fetch routes; the host reports which channel it opened.
  })
}

function remoteCall(scope, method, args) {
  const name = String(method)
  const slash = name.indexOf('/')
  const endpoint = slash === -1 ? name : name.slice(slash + 1)
  const camel = endpoint.replace(/-([a-z])/g, (m, c) => c.toUpperCase())
  for (const service of [USAGE_REMOTE_NAMESPACE, 'usage']) {
    // `ctx.get('remote.<namespace>')` is the service key the gateway creates per
    // face (dsh-api-gateway client: remoteServiceKey). The `remote[namespace]`
    // property is the older shape and throws on the strict proxy, so it is a
    // guarded second choice.
    let namespace = null
    try {
      namespace = scope.get('remote.' + service)
    } catch (e) {
      namespace = null
    }
    if (!namespace) {
      try {
        const remote = scope.get('remote')
        namespace = remote ? remote[service] : null
      } catch (e) {
        namespace = null
      }
    }
    if (!namespace) continue
    const fn = (typeof namespace[camel] === 'function' && namespace[camel])
      || (typeof namespace[endpoint] === 'function' && namespace[endpoint])
    if (!fn) continue
    return Promise.resolve()
      .then(() => fn(args))
      .then((res) => {
        if (res && res.ok) return res.value
        throw rpcError(res && res.error, 'RPC ' + method + ' failed')
      })
  }
  return null
}

function hostCall(method, args) {
  const remoteScope = (typeof ctx !== 'undefined' && ctx && typeof ctx.get === 'function')
    ? ctx
    : (typeof _usageCtx !== 'undefined' && _usageCtx && typeof _usageCtx.get === 'function' ? _usageCtx : null)
  if (remoteScope && typeof remoteScope.get === 'function') {
    let pending = null
    try {
      pending = remoteCall(remoteScope, method, args)
    } catch (e) {
      pending = null
    }
    if (pending !== null) {
      // Fall through to the Fetch routes when the Remote namespace turns out to
      // be unreachable — the two channels answer the same question.
      return pending.catch(() => fetchCall(method, args))
    }
  }
  if (typeof host !== 'undefined' && host && typeof host.call === 'function') {
    return Promise.resolve(host.call(method, args))
  }
  return fetchCall(method, args)
}

function fetchCall(method, args) {
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
      throw rpcError(res && res.error, 'RPC ' + method + ' failed')
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
/**
 * 原生日志通道：宿主有 logger 就写它（官方插件都走 ctx.logger），否则退回 console。
 * ctx 是严格代理，未注入的属性能抛，所以整段包在 try 里。
 */
function logWarn(message, detail) {
  try {
    const scope = (typeof _usageCtx !== 'undefined' && _usageCtx) ? _usageCtx : null
    const logger = scope && typeof scope.get === 'function' ? scope.get('logger') : null
    if (logger && typeof logger.warn === 'function') { logger.warn(message, detail); return }
    if (scope && scope.logger && typeof scope.logger.warn === 'function') { scope.logger.warn(message, detail); return }
  } catch (e) { /* no logger on this composition */ }
  console.warn(message, detail)
}

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
  currencyHint: '参考成本币种（固定汇率 1 USD = 7 CNY）',
  currencyCNY: '人民币',
  currencyUSD: '美元',
  today: '今日',
  dockHint: '今日 {cost} · {calls} 次调用 · {tokens} Token',
  dockUnpriced: '未定价',
  last7d: '近7天',
  last30d: '近30天',
  custom: '自定义',
  all: '全部',
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
  rangeHint: '支持选择任意日期范围，不限跨度',
  cancel: '取消',
  confirm: '确定',
  dateRangeGroup: '日期范围',
  modelFilterGroup: '模型筛选',
  chartTypeGroup: '图表类型',
  totalTokens: '总 Token',
  inputTokens: '输入 Token',
  outputTokens: '输出 Token',
  calls: '调用次数',
  cost: '参考成本',
  approxIO: '≈ 输入+输出',
  unpricedNote: '{count} 次调用未定价',
  // 参考成本卡上的常驻脚注：口径（卡片是估算而不是账单）+ 高峰规则（单价按
  // 北京时间分峰谷，不说清楚就等于藏了一条计价条件）。
  costSourceNote: '按 opencode Zen 和 DeepSeek 最新定价口径估算',
  peakRuleShort: '北京时间周一至周五 9:00-12:00、14:00-18:00 为高峰，法定节假日除外',
  holidayNote: '节假日数据：{range}',
  holidayNoteUnpublished: '节假日数据：{range}；{years} 尚未公布，该年按周末判定（落在高峰窗口的节假日可能被算高）',
  pricingOpen: '拉取最新定价匹配',
  pricingTitle: '定价匹配',
  pricingDesc: '本会话出现过的模型会按名称逐级匹配到定价表；未匹配的按 0 计价，计入「未定价」。',
  pricingPull: '更新匹配表',
  pricingHistory: '历史匹配（{n}）',
  pricingHistoryEmpty: '还没有确认过的匹配',
  pricingColModel: '模型',
  pricingColMatch: '匹配到',
  pricingColState: '状态',
  pricingColPrice: '单价（{unit} / 1M）',
  pricingSave: '确定',
  pricingClear: '恢复自动匹配',
  pricingApplyHint: '改完点「确定」才生效',
  pricingHowAlias: '按别名',
  // 模糊态的徽标：别名、孪生、变体后缀（-fast / -1017 / -free）都落在这一态，
  // 所以文案说「推测」而不是某一种推断的名字；具体依据看徽标的 tooltip。
  pricingHowTwin: '按名称推测',
  pricingHowLiteral: '按名称精确',
  pricingHowCustom: '用户指定',
  // 未匹配态的徽标文案。原来 MATCH_STATE_LABEL 指向一个不存在的键
  // 'unmatched'，t() 缺键时原样返回 key，于是徽标上印着英文 "unmatched"。
  pricingHowNone: '未匹配',
  pricingStale: '定价表里已没有这个模型',
  pricingTableMeta: '数据源 {source} · 读取于 {date}',
  pricingCounts: '精确 {exact} · 模糊 {fuzzy} · 未匹配 {none} · 自定义 {custom}',
  pricingBothTiers: '高峰 {peak} · 空闲 {off}',
  pricingSourceDeepseek: 'DeepSeek',
  pricingSourceZen: 'Zen',
  pricingSourceCustom: '自定义',
  // 「自定义」是选择器顶部的一个选项，不是一组参考模型：选它就直接给这一行填三个单价。
  pricingCustomOption: '自定义',
  pricingCustomHint: '直接填每百万 Token 的单价',
  pricingCustomInput: '输入',
  pricingCustomOutput: '输出',
  pricingCustomCacheRead: '缓存读',
  pricingCustomUnit: '单位：{unit} / 1M Token',
  pricingCustomPending: '待填写',
  rpcInternalError: '统计服务出错了，细节已写进宿主日志',
  done: '完成',
  pricingCardNoteTip: '参考成本的算法、匹配范围与高峰时段规则',
  askEmpty: '暂无待匹配的模型',
  askPick: '选择参考模型',
  pricingFailed: '定价表拉取失败：{message}',
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
  colCost: '参考成本',
  colShare: '占比',
  modelShare: '模型占比',
  shareOther: '其它',
  unpriced: '未定价',
  unpricedRowHint: '该模型未配置定价，按 0 计价',
  noData: '暂无数据',
  loading: '正在加载用量数据…',
  computing: '正在统计 {done}/{total} 个会话…',
  emptyDesc: '该时间段内没有调用记录',
  emptyFiltered: '当前筛选条件下没有数据，试试调整时间范围或模型',
  resetFilters: '重置筛选',
  loadFailed: '数据加载失败：{message}',
  loadFailedTitle: '数据加载失败',
  retry: '重试',
  barAria: '{key}，输入 {in} Token，输出 {out} Token，合计 {tot} Token，参考成本 {cost}',
  hmTitle: '{key}：{tokens} Token{calls}，参考成本 {cost}',
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
  currencyHint: 'Reference-cost currency (fixed rate: 1 USD = 7 CNY)',
  currencyCNY: 'CNY',
  currencyUSD: 'USD',
  today: 'Today',
  dockHint: 'Today {cost} · {calls} calls · {tokens} tokens',
  dockUnpriced: 'unpriced',
  last7d: 'Last 7 days',
  last30d: 'Last 30 days',
  custom: 'Custom',
  all: 'All',
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
  rangeHint: 'Any date range — no length limit',
  cancel: 'Cancel',
  confirm: 'OK',
  dateRangeGroup: 'Date range',
  modelFilterGroup: 'Model filter',
  chartTypeGroup: 'Chart type',
  totalTokens: 'Total Tokens',
  inputTokens: 'Input Tokens',
  outputTokens: 'Output Tokens',
  calls: 'Calls',
  cost: 'Est. cost',
  approxIO: '≈ input+output',
  unpricedNote: '{count} calls unpriced',
  costSourceNote: 'Estimated from the current opencode Zen and DeepSeek price lists',
  peakRuleShort: 'Peak: Mon-Fri 09:00-12:00 and 14:00-18:00 Beijing time, excluding public holidays',
  holidayNote: 'Holiday calendar: {range}',
  holidayNoteUnpublished: 'Holiday calendar: {range}; {years} is not published yet, so that year falls back to the weekend rule (a holiday inside a peak window may be billed high)',
  pricingOpen: 'Pull the latest price matching',
  pricingTitle: 'Price matching',
  pricingDesc: 'Models seen in this session are matched to the price list by name, one level at a time. Anything unmatched is billed at 0 and listed under unpriced.',
  pricingPull: 'Update matches',
  pricingHistory: 'Confirmed matches ({n})',
  pricingHistoryEmpty: 'No match has been confirmed yet',
  pricingColModel: 'Model',
  pricingColMatch: 'Matched to',
  pricingColState: 'State',
  pricingColPrice: 'Rate ({unit} / 1M)',
  pricingSave: 'Apply',
  pricingClear: 'Back to automatic',
  pricingApplyHint: 'Nothing changes until you press Apply',
  pricingHowAlias: 'by alias',
  pricingHowTwin: 'inferred from the name',
  pricingHowLiteral: 'by exact name',
  pricingHowCustom: 'set by you',
  pricingHowNone: 'unmatched',
  pricingStale: 'This model is no longer in the price list',
  pricingTableMeta: 'Sources {source} · read {date}',
  pricingCounts: 'exact {exact} · fuzzy {fuzzy} · unmatched {none} · custom {custom}',
  pricingBothTiers: 'Peak {peak} · off-peak {off}',
  pricingSourceDeepseek: 'DeepSeek',
  pricingSourceZen: 'Zen',
  pricingSourceCustom: 'Custom',
  pricingCustomOption: 'Custom',
  pricingCustomHint: 'Type the per-million rates by hand',
  pricingCustomInput: 'Input',
  pricingCustomOutput: 'Output',
  pricingCustomCacheRead: 'Cache read',
  pricingCustomUnit: 'Unit: {unit} per 1M tokens',
  pricingCustomPending: 'not set',
  rpcInternalError: 'The usage service failed — details are in the host log',
  done: 'Done',
  pricingCardNoteTip: 'How the reference cost is estimated, which models it covers, and the peak-hour rule',
  askEmpty: 'No model is waiting to be matched',
  askPick: 'Choose a reference model',
  pricingFailed: 'Could not load the price lists: {message}',
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
  colCost: 'Est. cost',
  colShare: 'Share',
  modelShare: 'Model share',
  shareOther: 'Others',
  unpriced: 'Unpriced',
  unpricedRowHint: 'No pricing configured; counted as 0',
  noData: 'No data',
  loading: 'Loading usage data…',
  computing: 'Computing {done}/{total} sessions…',
  emptyDesc: 'No calls in this period',
  emptyFiltered: 'No data for the current filters, try adjusting the range or models',
  resetFilters: 'Reset filters',
  loadFailed: 'Failed to load data: {message}',
  loadFailedTitle: 'Failed to load data',
  retry: 'Retry',
  barAria: '{key}, input {in} tokens, output {out} tokens, total {tot} tokens, {cost} reference cost',
  hmTitle: '{key}: {tokens} tokens{calls}, {cost} reference cost',
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
/** 只要数字部分：成本卡的符号由币种切换器自己画，再带一次就成了「¥ ¥14.78」。 */
function costDigits(n) {
  if (!Number.isFinite(n)) return '--'
  // Below half a cent there is nothing to show at 2 decimals; say so instead of
  // printing a misleading 0.00 (a $0.03 CNY cost becomes $0.004).
  if (n > 0 && n < 0.005) return '<0.01'
  return n.toFixed(2)
}
function formatCost(n, cur) {
  return (cur || '¥') + costDigits(n)
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
// 今日 = 当天 00:00 至今；近7/30天 = 含今天往前 N 个自然日 00:00 起；全部 = 不限起点；
// 自定义 = 起日 00:00 ~ 止日 23:59:59.999
function rangeFor(preset, custom) {
  const now = new Date()
  const today = startOfDay(now)
  if (preset === 'today') return { from: today.getTime(), to: now.getTime() }
  if (preset === '7d') return { from: addDays(today, -6).getTime(), to: now.getTime() }
  if (preset === '30d') return { from: addDays(today, -29).getTime(), to: now.getTime() }
  // 全量：0 是有限值，宿主的 fill 判定认它；调用方必须同时传 fill:false，
  // 否则会去零填充 1970 年至今、撞上 MAX_BUCKETS 退化成只看有数据的桶。
  if (preset === 'all') return { from: 0, to: now.getTime() }
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
  // 刷新图标取自 DSH 原生图形（16 网格、stroke 1.5），与设置页其它图标同一观感；
  // 其余图标仍是 24 网格（stroke 2），SvgIcon 两种定义都吃。
  refresh: {
    viewBox: '0 0 16 16',
    strokeWidth: 1.5,
    paths: [
      'M14.5001 8C14.5 9.28552 14.1188 10.5422 13.4045 11.611C12.6903 12.6799 11.6752 13.5129 10.4875 14.0049C9.29982 14.4968 7.99295 14.6255 6.73212 14.3747C5.4713 14.124 4.31314 13.505 3.4041 12.596C2.49514 11.687 1.87614 10.5288 1.62537 9.26798C1.37459 8.00716 1.50331 6.70028 1.99525 5.51261C2.48719 4.32494 3.32025 3.30981 4.3891 2.59557C5.45795 1.88134 6.71458 1.50008 8.0001 1.5C9.9001 1.5 11.7001 2.3 13.0001 3.6L14.5001 5.1',
      'M14.4999 1.5V5.1H10.8999',
    ],
  },
  chevron: 'M6 9l6 6 6-6',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2m3.5-6.5L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.5-6.5A2 2 0 0016.76 5H7.24a2 2 0 00-1.74 1.5z',
  alert: 'M12 9v4m0 4h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.7 3.86a2 2 0 00-3.4 0z',
  search: 'M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z',
  // 饼图（占比）：外圈 + 楔形，与卡片标题的「占比」语义一致
  share: 'M21.21 15.89A10 10 0 118 2.83M22 12A10 10 0 0012 2v10z',
  check: 'M20 6L9 17l-5-5',
  x: 'M6 6l12 12M18 6L6 18',
  // 拉取匹配表按钮的图标：DSH 原生 icon-context-injection-outline。16 网格、
  // 线宽 1.5；图形是「剪贴板 + 从顶部穿入的下载箭头 + 一条内容线」，描边沿用
  // 外层的 currentColor，所以每条 path 只给 d。
  contextInjection: {
    viewBox: '0 0 16 16',
    strokeWidth: 1.5,
    paths: [
      'M5 2.5H3.5C3.23478 2.5 2.98043 2.60536 2.79289 2.79289C2.60536 2.98043 2.5 3.23478 2.5 3.5V13.5C2.5 13.7652 2.60536 14.0196 2.79289 14.2071C2.98043 14.3946 3.23478 14.5 3.5 14.5H12.5C12.7652 14.5 13.0196 14.3946 13.2071 14.2071C13.3946 14.0196 13.5 13.7652 13.5 13.5V3.5C13.5 3.23478 13.3946 2.98043 13.2071 2.79289C13.0196 2.60536 12.7652 2.5 12.5 2.5H11',
      'M8 0.5V7.5',
      'M5.5 5L8 7.5L10.5 5',
      'M5.5 11H10.5',
    ],
  },
  // 提示记号：圆圈 + 感叹号（16 网格、线宽 1.5）。原来用一个 CSS 伪元素画「?」，
  // 字重太小、缩到 10px 后几乎看不见，也不能点；换成真图标后可以当按钮用。
  hint: {
    viewBox: '0 0 16 16',
    strokeWidth: 1.5,
    paths: [
      'M8 1.75a6.25 6.25 0 1 1 0 12.5a6.25 6.25 0 1 1 0-12.5Z',
      'M8 4.9v3.5',
      'M8 11.15h.01',
    ],
  },
}
function SvgIcon(props) {
  const { name, size, className } = props
  // 一个名字对应「一串 path + 自己的 viewBox/线宽」；字符串是 24 网格的简写，
  // 调用方（31 处）无需关心差别。
  const spec = ICON_PATHS[name] || ICON_PATHS.activity
  const icon = typeof spec === 'string'
    ? { viewBox: '0 0 24 24', strokeWidth: 2, paths: [spec] }
    : spec
  return h('svg', {
    className: className || 'tsd-icon',
    width: size || 16,
    height: size || 16,
    viewBox: icon.viewBox || '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: icon.strokeWidth || 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }, icon.paths.map((d, i) => h('path', { key: i, d })))
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
 * 通用 Hook：浮层定位（viewport 定位 + 空间不足上翻 + 高度封顶）
 *
 * 设置面板本身是 `overflow: hidden` 的裁剪容器，贴着过滤栏右端的 absolute
 * 浮层会被整条裁掉（右侧的「清空」看不见）。CSS 无法感知祖先裁剪，只能量一次
 * 视口再定位；滚动或缩放时重算，避免浮层留在原地。
 * ------------------------------------------------------------------------- */
const PANEL_MIN_ROOM = 240 // 下方空间小于它且上方更宽裕时上翻
const PANEL_MIN_HEIGHT = 160

function useFixedPanel(anchorRef, open, width, gap = 6, margin = 12) {
  const [style, setStyle] = React.useState(null)
  React.useEffect(() => {
    if (!open) {
      setStyle(null)
      return undefined
    }
    function measure() {
      const el = anchorRef.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const boxW = Math.min(width, window.innerWidth - margin * 2)
      const left = Math.max(margin, Math.min(r.left, window.innerWidth - margin - boxW))
      const below = window.innerHeight - r.bottom - gap - margin
      const above = r.top - gap - margin
      const flip = below < PANEL_MIN_ROOM && above > below
      setStyle({
        position: 'fixed',
        left,
        width: boxW,
        maxHeight: Math.max(PANEL_MIN_HEIGHT, flip ? above : below),
        ...(flip
          ? { bottom: window.innerHeight - r.top + gap }
          : { top: r.bottom + gap }),
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [open, anchorRef, width, gap, margin])
  if (!open) return null
  // 首帧还没量到尺寸：先藏起来，否则会闪到左上角
  return style || { position: 'fixed', top: 0, left: 0, visibility: 'hidden' }
}

/* ---------------------------------------------------------------------------
 * Header：标题 + 副标题 + 刷新按钮
 * ------------------------------------------------------------------------- */
function StatsHeader(props) {
  // `computing` 表示"统计还没算完"（宿主 backfill.status === 'running'），
  // 和 `busy`（这一轮请求在飞）不是一回事：请求几十毫秒就结束，而全量统计要几秒。
  // 只在请求在飞时转圈，用户就会看到"页面明明没算完却什么都不动"。
  const { busy, onRefresh, computing, computeDone, computeTotal } = props
  const t = useT()
  const subtitle = computing
    ? t('computing', { done: formatInt(computeDone || 0), total: formatInt(computeTotal || 0) })
    : t('subtitle')
  return h('div', { className: 'tsd-header' },
    h('div', { className: 'tsd-header-text' },
      h('h2', { className: 'tsd-title' }, t('nav')),
      // 副标题这一句直接换成进度句：同一个位置、同样的行高，所以不算完→算完不跳版。
      h('p', { className: 'tsd-subtitle', role: computing ? 'status' : null }, subtitle)),
    h('button', {
      type: 'button',
      className: 'tsd-icon-btn' + (busy || computing ? ' tsd-spinning' : ''),
      onClick: onRefresh,
      disabled: busy,
      'aria-busy': busy || computing || undefined,
      title: t('refresh'),
      'aria-label': t('refresh'),
    }, h(SvgIcon, { name: 'refresh' })))
}

/* ---------------------------------------------------------------------------
 * 自定义日期范围浮层
 * ------------------------------------------------------------------------- */
function CustomRangePopover(props) {
  const { custom, onApply, onClose, anchorRef } = props
  const t = useT()
  const panelStyle = useFixedPanel(anchorRef, true, 300)
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
    style: panelStyle,
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
  const panelStyle = useFixedPanel(anchorRef, open, 320)

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
  // 候选键直接用宿主给好的 `key`（compositeModelKey 的结果）：客户端不再自己拼
  // `provider + '/' + model`，provider 为空时那种拼法会得到 `/model` 而永远选不中。
  const candidates = React.useMemo(() => {
    const set = new Set((options || []).map((m) => m.key || (m.provider ? m.provider + '/' + m.model : m.model)))
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
          style: panelStyle,
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
  const customBtnRef = React.useRef(null)
  useOutsideClick(customOpen, segRef, onCustomClose)

  const customLabel = fmtDateSlash(custom.from) + ' - ' + fmtDateSlash(custom.to)
  const presets = [
    { key: 'today', label: t('today') },
    { key: '7d', label: t('last7d') },
    { key: '30d', label: t('last30d') },
    { key: 'all', label: t('all') },
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
            ref: isCustom ? customBtnRef : undefined,
            className: 'tsd-seg-btn' + (active ? ' tsd-seg-active' : '') + (isCustom ? ' tsd-seg-custom' : ''),
            'aria-pressed': active,
            title: isCustom && active ? customLabel : undefined,
            onClick: () => { if (isCustom) onCustomOpen(!customOpen); else onPreset(p.key) },
          },
            h('span', { className: 'tsd-seg-label' }, label))
        })),
      customOpen
        ? h(CustomRangePopover, { custom, onApply: onCustomApply, onClose: onCustomClose, anchorRef: customBtnRef })
        : null),
    h(ModelDropdown, { options: modelOptions, selected: models, onChange: onModelsChange }))
}

/* ---------------------------------------------------------------------------
 * 参考成本币种切换（人民币 / 美元，固定 1 USD = 7 CNY）
 *
 * 换算在宿主侧完成（价目表是美元价，绝不回写），所以这里只负责选择与持久化：
 * 换币种即换查询，不重查数字不会变。
 * ------------------------------------------------------------------------- */
const CURRENCY_SYMBOLS = { CNY: '¥', USD: '$' }
const CURRENCY_STORE_KEY = 'dsh-plugin-usage:display-currency'

function readStoredCurrency() {
  try {
    return window.localStorage.getItem(CURRENCY_STORE_KEY) === 'USD' ? 'USD' : 'CNY'
  } catch (e) {
    return 'CNY' // 无痕模式 / 存储被禁：退回默认
  }
}
function storeCurrency(code) {
  try {
    window.localStorage.setItem(CURRENCY_STORE_KEY, code)
  } catch (e) {
    // 存不下就只影响下次打开，不影响本次显示
  }
}

function CurrencyPicker(props) {
  const { code, onChange } = props
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef(null)
  const panelStyle = useFixedPanel(ref, open, 180)
  useOutsideClick(open, ref, () => setOpen(false))
  const active = CURRENCY_SYMBOLS[code] ? code : 'CNY'
  const options = ['CNY', 'USD']
  // 收起时 ↑↓ 直接换值（像原生 select），展开时在两项间移动；Esc 关菜单。
  const move = (step) => {
    const i = options.indexOf(active)
    onChange(options[(i + step + options.length) % options.length])
  }
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); return }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true) }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
  }
  return h('span', { className: 'tsd-cur-anchor', ref },
    h('button', {
      type: 'button',
      className: 'tsd-cur-btn' + (open ? ' tsd-cur-btn-open' : ''),
      title: t('currencyHint'),
      'aria-label': t('currencyHint'),
      'aria-haspopup': 'listbox',
      'aria-expanded': open,
      onClick: () => setOpen((v) => !v),
      onKeyDown,
    },
      h('span', null, CURRENCY_SYMBOLS[active]),
      h(SvgIcon, { name: 'chevron', size: 10, className: 'tsd-cur-chevron' })),
    open
      ? h('div', {
          className: 'tsd-popover tsd-cur-popover',
          style: panelStyle,
          role: 'listbox',
          'aria-label': t('currencyHint'),
          onKeyDown,
        },
        options.map((c) => h('button', {
          key: c,
          type: 'button',
          role: 'option',
          'aria-selected': c === active,
          className: 'tsd-cur-option' + (c === active ? ' tsd-cur-option-active' : ''),
          onClick: () => { onChange(c); setOpen(false) },
        },
          h('span', { className: 'tsd-cur-symbol' }, CURRENCY_SYMBOLS[c]),
          h('span', { className: 'tsd-cur-name' }, t(c === 'CNY' ? 'currencyCNY' : 'currencyUSD')),
          c === active ? h(SvgIcon, { name: 'check', size: 12, className: 'tsd-cur-check' }) : null)),
        h('div', { className: 'tsd-popover-note' }, t('currencyHint')))
      : null)
}

/* ---------------------------------------------------------------------------
 * 模型占比（KPI 网格里的第 6 格）
 *
 * 数据直接吃宿主 `byModel` 的行（与「按模型明细」表同一份），不另算一遍。
 * 明细放在各段的原生 title 上而不是浮层：KPI 卡贴着设置面板的裁剪边界，
 * 再叠一层浮层只会把之前修好的裁剪问题带回来。
 * ------------------------------------------------------------------------- */
const SHARE_COLORS = [
  // 只用主题里真实存在、且彼此分得开的彩色族：深蓝、绿、琥珀、红。
  // 不用 neutral / 白 / 黑 —— 它们在深浅两套主题里一边会糊进背景，一边会被读成禁用态。
  'var(--dsw-static-deepseek-500)',
  'var(--dsw-static-green-500)',
  'var(--dsw-static-amber-500)',
  'var(--dsw-static-red-400)',
]
const SHARE_TOP = 4
const SHARE_REST_KEY = '__rest__'

/** `provider/model` → 裸模型名；色带格位放不下全名，全名留给 title 与 aria。 */
function shortModelName(key) {
  const s = String(key == null ? '' : key)
  const i = s.lastIndexOf('/')
  return i === -1 ? s : s.slice(i + 1)
}
/**
 * 「读取于」要的是真实时刻，不是日期。
 *
 * 价目表里存的是抓取那一刻的 ISO 时间（带秒、UTC）；这里换成浏览器本地时区
 * 显示，精确到秒。早期只有日期（`2026-10-19`）的表也认得，补 00:00:00。
 */
function stampText(v) {
  if (!v) return '—'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  const p = (n) => (n < 10 ? '0' + n : String(n))
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
}
/** 宿主行是 `totalTokens`；兼容已映射成 `total` 的形状，空行也不能抛。 */
function rowTotal(r) {
  return r ? (r.totalTokens || r.total || 0) : 0
}
/** 降序取前 4 段，其余并成「其它」；无数据时返回空段。 */
function shareSegments(rows) {
  const list = (rows || []).slice().sort((a, b) => rowTotal(b) - rowTotal(a))
  const total = list.reduce((s, r) => s + rowTotal(r), 0)
  if (total <= 0) return { total: 0, segs: [] }
  const numbers = (r) => ({
    tokens: rowTotal(r),
    calls: r.calls || 0,
    // 与明细表同一口径：输入含缓存读写
    input: (r.inputTokens || 0) + (r.cacheReadTokens || 0) + (r.cacheWriteTokens || 0),
    output: r.outputTokens || 0,
    cost: r.cost || 0,
  })
  const segs = list.slice(0, SHARE_TOP).map((r, i) => Object.assign({
    key: String(r.key),
    label: shortModelName(r.key),
    pct: rowTotal(r) / total,
    color: SHARE_COLORS[i % SHARE_COLORS.length],
  }, numbers(r)))
  const restRows = list.slice(SHARE_TOP)
  const restTokens = restRows.reduce((s, r) => s + rowTotal(r), 0)
  if (restTokens > 0) {
    const agg = restRows.reduce((a, r) => {
      const n = numbers(r)
      return {
        tokens: a.tokens + n.tokens,
        calls: a.calls + n.calls,
        input: a.input + n.input,
        output: a.output + n.output,
        cost: a.cost + n.cost,
      }
    }, { tokens: 0, calls: 0, input: 0, output: 0, cost: 0 })
    segs.push(Object.assign({
      key: SHARE_REST_KEY,
      label: null, // 「其它」的文案由渲染层取词典
      pct: restTokens / total,
      // 「其它」用同色系的淡色（浅蓝），不用灰/白：那两种在深色卡片上会被读成禁用
      color: 'var(--dsw-static-deepseek-300)',
    }, agg))
  }
  return { total, segs }
}

function ModelShareBar(props) {
  const { rows, currency } = props
  const t = useT()
  const [tip, setTip] = React.useState(null) // { key, left, top } in viewport coords
  const occ = shareSegments(rows)
  if (occ.total <= 0) return h('div', { className: 'tsd-card-value tsd-share-empty' }, t('noData'))
  const find = (key) => occ.segs.filter((s) => s.key === key)[0] || null
  const shown = (tip && find(tip.key)) || occ.segs[0]
  const labelOf = (s) => (s.key === SHARE_REST_KEY ? t('shareOther') : s.label)
  const fullOf = (s) => (s.key === SHARE_REST_KEY ? t('shareOther') : s.key)
  const costOf = (s) => (s.unpriced === true ? t('unpriced') : formatCost(s.cost, currency))
  // 悬停/聚焦：从段的视口矩形推开，fixed 定位不受设置面板 overflow 裁剪
  const showTip = (e, s) => {
    const r = e.currentTarget.getBoundingClientRect()
    setTip({ key: s.key, left: r.left + r.width / 2, top: r.top })
  }
  const hideTip = () => setTip(null)
  const tipBox = shown && tip
    ? h('div', {
        className: 'tsd-tooltip tsd-share-tip',
        style: { position: 'fixed', left: tip.left + 'px', top: tip.top + 'px', transform: 'translate(-50%, -110%)' },
      },
        h('div', { className: 'tsd-tooltip-date' }, fullOf(shown)),
        h('div', { className: 'tsd-tooltip-row' },
          h('span', { className: 'tsd-tooltip-dot', style: { background: shown.color } }),
          h('span', null, t('totalTokens')),
          h('span', { className: 'tsd-tooltip-val' }, formatInt(shown.tokens))),
        h('div', { className: 'tsd-tooltip-row' },
          h('span', null, t('legendInput')),
          h('span', { className: 'tsd-tooltip-val' }, formatInt(shown.input))),
        h('div', { className: 'tsd-tooltip-row' },
          h('span', null, t('legendOutput')),
          h('span', { className: 'tsd-tooltip-val' }, formatInt(shown.output))),
        h('div', { className: 'tsd-tooltip-row' },
          h('span', null, t('cost')),
          h('span', { className: 'tsd-tooltip-val' }, costOf(shown))))
    : null
  return h('div', { className: 'tsd-card-share-body' },
    h('div', { className: 'tsd-share-track', onMouseLeave: hideTip },
      occ.segs.map((s) => h('div', {
        key: s.key,
        className: 'tsd-share-seg',
        'data-share-key': s.key,
        'data-active': shown && shown.key === s.key ? 'true' : undefined,
        style: { width: s.pct * 100 + '%', background: s.color },
        role: 'img',
        tabIndex: 0,
        'aria-label': fullOf(s) + ' · ' + fmtPct(s.pct) + ' · ' + formatInt(s.tokens) + ' ' + t('totalTokens'),
        onMouseEnter: (e) => showTip(e, s),
        onFocus: (e) => showTip(e, s),
        onBlur: hideTip,
      }))),
    // 条下只留一行低调脚注（当前悬浮的那段，否则最大的那段）；
    // 全名与明细都在悬浮卡片里，所以这里不挂 title。
    h('div', { className: 'tsd-share-caption' },
      h('span', { className: 'tsd-share-cap-name' }, labelOf(shown)),
      h('span', { className: 'tsd-share-cap-pct' }, fmtPct(shown.pct))),
    tipBox)
}

/* ---------------------------------------------------------------------------
 * 标题旁的提示记号
 *
 * 「点击 / 悬浮双显示」是硬要求：
 *  - 悬浮走原生 title（浏览器自己弹，不依赖脚本，也不会被设置面板的 overflow 裁掉）；
 *  - 点击展开同一个浮层 —— 触屏没有 hover，键盘也要能读到，且浮层里两段规则换行
 *    读起来比一整行 tooltip 清楚得多。
 * 原生 title 与浮层共用同一份文本（宿主/调用方只传一次），不维护第二份文案。
 * ------------------------------------------------------------------------- */
function HintTip(props) {
  const { text, label } = props
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef(null)
  const panelStyle = useFixedPanel(ref, open, 260)
  useOutsideClick(open, ref, () => setOpen(false))
  const lines = String(text == null ? '' : text).split('\n').filter((s) => s.trim().length > 0)
  return h('span', { className: 'tsd-hint', ref },
    h('button', {
      type: 'button',
      className: 'tsd-hint-btn' + (open ? ' tsd-hint-btn-open' : ''),
      title: text || null,
      'aria-label': label || text || '',
      'aria-expanded': open,
      onClick: () => setOpen((v) => !v),
      onKeyDown: (e) => {
        if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false) }
      },
    }, h(SvgIcon, { name: 'hint', size: 12 })),
    open
      ? h('div', {
          className: 'tsd-popover tsd-hint-popover',
          style: panelStyle,
          role: 'note',
        }, lines.map((s, i) => h('p', { key: i, className: 'tsd-hint-line' }, s)))
      : null)
}

/* ---------------------------------------------------------------------------
 * 汇总指标卡 ×6
 * ------------------------------------------------------------------------- */

/**
 * 节假日覆盖说明：哪些年份在手、哪一年还没公布。
 *
 * 峰谷价依赖中国法定节假日表；未公布的年份只能按「周末 + 时段」判定，节假日
 * 落在高峰窗口内的调用会被算高。与其让这个误差隐身，不如在「参考成本」的提示
 * 里把覆盖范围写清楚。
 */
function holidayNote(pricing, t) {
  const years = pricing && pricing.holidays && typeof pricing.holidays === 'object'
    ? Object.keys(pricing.holidays).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
    : []
  if (years.length === 0) return null
  const range = years.length === 1 ? String(years[0]) : years[0] + '–' + years[years.length - 1]
  const missing = years.filter((year) => pricing.holidays[year] && pricing.holidays[year].unpublished === true)
  if (missing.length === 0) return t('holidayNote', { range })
  return t('holidayNoteUnpublished', { range, years: missing.join('、') })
}

/* 统计卡的槽位表：骨架屏按它画占位块。
 *
 * 这张表存在的唯一理由是**别再漂**：骨架屏曾经写死 5 个占位块，而真实卡片已经
 * 6 张（补了「模型占比」），结果加载态少一格、数据到达时整行重排。
 * 槽位顺序必须与 `SummaryCards` 里的 `cards` 数组一致 —— `tests/client-slots.test.js`
 * 会逐字比对两边的 key 列表，改一处漏另一处直接变红。
 */
const SUMMARY_CARD_SLOTS = ['total', 'input', 'output', 'calls', 'cost', 'share']

function SummaryCards(props) {
  const { total, currency, unpricedCalls, currencyCode, onCurrencyChange, byModel, pricing, onOpenPricing } = props
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
      key: 'cost', icon: 'coins', label: tt('cost'), action: true,
      // 符号由 prefix 的币种切换器画（它显示当前币种符号），这里只给数字
      value: costDigits(d.cost), title: formatCost(d.cost, currency),
      color: 'var(--dsw-static-green-500)',
      prefix: h(CurrencyPicker, { code: currencyCode, onChange: onCurrencyChange }),
      // 「这个数怎么来的」：口径句与高峰规则原本是两行常驻小字，把小卡挤满了，
      // 改成标题的悬浮提示 —— 不在视野里占位，指一下就能读到全文。
      // 未定价条数仍然留在卡面上：它是一条待办，不是解释。
      tip: [tt('costSourceNote'), tt('peakRuleShort'), holidayNote(pricing, tt)].filter(Boolean).join('\n'),
    },
    {
      key: 'share', icon: 'share', label: tt('modelShare'),
      color: 'var(--dsw-alias-brand-primary)',
      content: h(ModelShareBar, { rows: byModel, currency }),
    },
  ]
  return h('div', { className: 'tsd-cards' },
    cards.map((c) =>
      h('div', { key: c.key, className: 'tsd-card' },
        h('div', { className: 'tsd-card-head' },
          h('span', { className: 'tsd-card-icon', style: { color: c.color } },
            h(SvgIcon, { name: c.icon, size: 14 })),
          h('span', { className: 'tsd-card-label', title: c.tip || null }, c.label),
          // 提示记号是独立按钮：悬浮有原生 title，点击展开浮层。
          c.tip ? h(HintTip, { text: c.tip, label: tt('pricingCardNoteTip') }) : null,
          // 参考成本卡的「怎么算出来的」入口：打开匹配弹窗。图标与弹窗里的
          // 「更新匹配表」同款（剪贴板），一眼看出两者是同一件事。
          c.action
            ? h('button', {
                type: 'button',
                className: 'tsd-card-action',
                title: tt('pricingOpen'),
                'aria-label': tt('pricingOpen'),
                onClick: onOpenPricing,
              }, h(SvgIcon, { name: 'contextInjection', size: 12 }))
            : null),
        c.content
          ? c.content
          : h('div', { className: 'tsd-card-value', title: c.title }, c.prefix || null, c.value),
        // 参考成本卡的脚注：口径与高峰规则已移到标题的悬浮提示，这里只剩
        // 「还有几次调用没定价」这条待办（有事才出现）。
        c.key === 'cost' && unpricedCalls > 0
          ? h('div', { className: 'tsd-card-notes' },
              h('div', { className: 'tsd-card-note tsd-card-note-warn' }, tt('unpricedNote', { count: formatInt(unpricedCalls) })))
          : null,
        c.sub ? h('div', { className: 'tsd-card-sub' }, c.sub) : null)))
}

/* ---------------------------------------------------------------------------
 * 定价匹配弹窗
 *
 * 解决的是「参考成本为什么是这个数」：每个模型按名称逐级匹配到定价表，匹配
 * 结果分四态（精确 / 模糊 / 未匹配 / 自定义），四态都能改、都能收回。
 *
 * 两条硬规则写在这里，别处不要各写一份：
 *  1. 打开弹窗、拉取匹配表都**不落盘**。只有「确定」才写，写入的是脏行和被
 *     收回的 key —— 没动过的行不写，免得把别人刚确认的匹配覆盖掉。
 *  2. 候选来自当前定价表的 id（宿主 propose 一并带回），不在前端另存一份名单。
 * ------------------------------------------------------------------------- */
const MATCH_STATE_LABEL = { exact: 'pricingHowLiteral', fuzzy: 'pricingHowTwin', none: 'pricingHowNone', custom: 'pricingHowCustom' }

/*
 * 四态由宿主给（priceRow.state），前端不再解释 how。
 * 这里曾经有一份 matchStateOf(row)，把 how 映射成四态；它写死了一个阶梯里不存在
 * 的值（'literal'），于是所有精确命中都显示成「未匹配」——两个词表，两处维护，
 * 一处错就全错。现在只有一处：pricing.js 的 resolvePrice。
 */

/** 弹窗里改动的草稿：key → { target, cleared, dirty }。 */
function mergeDraft(prev, key, patch) {
  const next = { ...prev }
  const cur = next[key] || { target: null, cleared: false, dirty: false }
  next[key] = { ...cur, ...patch, dirty: true }
  return next
}

/** 一行提交时会带什么：`undefined` = 没动过，不提交。 */
function decisionOf(draft) {
  if (!draft || !draft.dirty) return undefined
  if (draft.cleared) return { key: draft.key, clear: true }
  if (typeof draft.target === 'string' && draft.target !== '') return { key: draft.key, target: draft.target }
  return undefined
}

function PricingDialog(props) {
  const { onClose, onApplied, currency } = props
  const t = useT()
  const [rows, setRows] = React.useState([])
  const [table, setTable] = React.useState(null)
  const [saved, setSaved] = React.useState({})
  const [draft, setDraft] = React.useState({})
  const [status, setStatus] = React.useState('loading') // loading | ready | error
  const [error, setError] = React.useState(null)
  const [saving, setSaving] = React.useState(false)
  const [pickFor, setPickFor] = React.useState(null) // 正在选参考模型的 key
  const [pickText, setPickText] = React.useState('')
  const [editFor, setEditFor] = React.useState(null) // 正在手填单价的 key（自定义选项）
  const [historyOpen, setHistoryOpen] = React.useState(false)
  // 候选列表挂在行内「匹配到」那一格上：浮层是 position: fixed，撑不开表格；
  // 但 DOM 上仍留在那一格里 —— useOutsideClick 用 contains 判内外，必须这样挂。
  const pickAnchor = React.useRef(null)
  const closePick = React.useCallback(() => {
    setPickFor(null)
    setPickText('')
  }, [])
  const pickStyle = useFixedPanel(pickAnchor, pickFor !== null, 300, 4, 12)
  const customStyle = useFixedPanel(pickAnchor, editFor !== null, 280, 4, 12)
  useOutsideClick(pickFor !== null, pickAnchor, closePick)

  const pull = React.useCallback(() => {
    setStatus('loading')
    setError(null)
    hostCall('usage/query', { fill: false, models: [], heatmap: false, backfill: false })
      .then((r) => {
        const seen = Array.isArray(r && r.models) ? r.models : []
        return hostCall('usage/pricing', { action: 'propose', models: seen })
      })
      .then((v) => {
        setRows(Array.isArray(v && v.rows) ? v.rows : [])
        setTable(v && v.table ? v.table : null)
        setSaved(v && v.matchMap ? v.matchMap : {})
        setDraft({})
        setStatus('ready')
      }, (e) => {
        setError(e)
        setStatus('error')
      })
  }, [])

  React.useEffect(() => { pull() }, [pull])

  const counts = React.useMemo(() => {
    const n = { exact: 0, fuzzy: 0, none: 0, custom: 0 }
    // 每一行都自带 state（宿主 priceRow 给的），前端不再从 how 反推 —— 反推过
    // 一次，写死的 'literal' 阶梯里根本不存在，所有精确命中都显示成「未匹配」。
    for (const r of rows) n[r.state] += 1
    return n
  }, [rows])

  // 单价本身是美元价（价目表就是美元），显示时套用当前展示币种，和卡片同一个数。
  const moneyPerUsd = React.useCallback(() => (currency && currency.code === 'USD' ? 1 : 7), [currency])
  const moneyOf = React.useCallback((usd) => {
    const code = currency && currency.code === 'USD' ? 'USD' : 'CNY'
    const symbol = currency && currency.symbol ? currency.symbol : (CURRENCY_SYMBOLS[code] || '¥')
    return typeof usd === 'number' ? formatCost(usd * (code === 'USD' ? 1 : 7), symbol) : '—'
  }, [currency])
  // 表头单位必须和单元格用的是同一个符号，否则会出现「单价（$ / 1M）」配「¥2.10」。
  const priceUnit = (currency && currency.symbol) || '¥'

  // 待选 = 阶梯没找到价的行。判据用 state 而不是 unpriced：`unpriced` 是查询那边
  // 「某条记录没价」的字段，propose 的行从来没有它 —— 拿它当过滤条件的后果是待选
  // 表永远是空的，未匹配的模型一行都露不出来。
  const pending = rows.filter((r) => r.state === 'none')
  // 历史表 = 已经写进 matchMap 的 confirmed 记录。判据只看 matchMap：目标若已从
  // 价目表下线，这一行仍然留在这里（还能收回），主表里则按「未匹配」显示并标 stale。
  const historyRows = rows.filter((r) => saved[r.key] !== undefined)
  const pendingRows = pending.filter((r) => !historyRows.includes(r))
  const matchedRows = rows.filter((r) => r.state !== 'none' && !historyRows.includes(r))
  // 空状态判的是主表有没有行。此前判的是 `pending.length` —— 只要有模型按阶梯
  // 命中了价，第一张表就整块消失，于是「精确 / 模糊」两种状态永远没机会露面。
  const hasMainRows = pendingRows.length > 0 || matchedRows.length > 0

  // 注意：组件里的 `setDraft` 是 useState 的 setter，不是上面那个纯函数。
  // 写成 setDraft((prev) => setDraft(prev, ...)) 会递归调自己（初值 undefined），
  // 所以这里用纯函数的名字 `mergeDraft` 区分开。
  const choose = (key, target) => {
    setDraft((prev) => mergeDraft(prev, key, { target, cleared: false, custom: null, key }))
    setEditFor(null)
    closePick()
  }
  const clearRow = (key) => {
    setDraft((prev) => mergeDraft(prev, key, { target: null, cleared: true, custom: null, key }))
    setEditFor((k) => (k === key ? null : k))
  }

  /** 手填单价：三格，都是「每百万 Token」的展示币种金额。 */
  const CUSTOM_FIELDS = [['input', 'pricingCustomInput'], ['output', 'pricingCustomOutput'], ['cacheRead', 'pricingCustomCacheRead']]
  /** 某个 key 当前的手填值（草稿优先，其次宿主已有的自定义价）。 */
  const customOf = (r) => {
    const d = draft[r.key]
    if (d && d.custom) return d.custom
    // 宿主已按自定义价计过账：用它当前的费率回填，方便改。
    if (r.how === 'custom' && r.rates) {
      const per = moneyPerUsd()
      const at = r.rates.peak || r.rates.offPeak
      return {
        input: String(Number((at.input * per).toFixed(4))),
        output: String(Number((at.output * per).toFixed(4))),
        cacheRead: String(Number((at.cacheRead * per).toFixed(4))),
      }
    }
    return { input: '', output: '', cacheRead: '' }
  }
  /** 开始手填：把这一行切成编辑态，草稿里先放一份可编辑的值。 */
  const startCustom = (key) => {
    const row = rows.find((x) => x.key === key)
    const seed = row ? customOf(row) : { input: '', output: '', cacheRead: '' }
    setDraft((prev) => mergeDraft(prev, key, { target: null, cleared: false, custom: seed, key }))
    setEditFor(key)
    closePick()
  }
  const setCustomField = (key, field, value) => {
    setDraft((prev) => {
      const cur = (prev[key] && prev[key].custom) || { input: '', output: '', cacheRead: '' }
      return mergeDraft(prev, key, { target: null, cleared: false, custom: { ...cur, [field]: value }, key })
    })
  }

  const dirtyKeys = Object.keys(draft).filter((k) => draft[k].dirty)
  /** 三格都能读成非负数字才算一条手填价，否则不发出去（避免把空串写成 0）。 */
  const customOfDraft = (d) => {
    if (!d || !d.custom) return null
    const out = {}
    for (const [field] of CUSTOM_FIELDS) {
      const raw = String(d.custom[field] == null ? '' : d.custom[field]).trim()
      if (raw === '') return null
      const v = Number(raw)
      if (!Number.isFinite(v) || v < 0) return null
      out[field] = v
    }
    return out
  }
  const submit = () => {
    if (dirtyKeys.length === 0 || saving) { if (dirtyKeys.length === 0) onClose(); return }
    const decisions = []
    const cleared = []
    const customs = []
    for (const k of dirtyKeys) {
      const d = draft[k]
      if (d.cleared) cleared.push(k)
      else if (d.custom) {
        const rate = customOfDraft(d)
        if (rate !== null) customs.push({ key: k, ...rate })
      } else if (typeof d.target === 'string' && d.target !== '') decisions.push({ key: k, target: d.target })
    }
    setSaving(true)
    hostCall('usage/pricing', { action: 'commit', decisions, cleared, customs, currency: currency && currency.code ? currency.code : 'CNY' })
      .then((v) => {
        setSaving(false)
        setDraft({})
        setEditFor(null)
        if (onApplied) onApplied(v)
        onClose()
      }, (e) => {
        setSaving(false)
        setError(e)
        setStatus('error')
      })
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      // 一路退出：先收候选列表，再关弹窗
      if (pickFor !== null) { closePick(); return }
      onClose()
    }
  }

  // 单价：宿主给的是两档费率（rates），tier 是它自己算的「现在按哪档显示」。
  // 前端只查表、不猜档 —— 之前宿主把档折成一行再发过来，另一档就凭空消失了。
  const rateLine = (rates) => [rates.input, rates.output, rates.cacheRead].map(moneyOf).join(' / ')
  const priceLine = (r) => {
    // 手填价：三格都填好就照填的印（它们本来就是展示币种），否则提示还没填完。
    const d = r ? draft[r.key] : null
    if (d && d.custom) {
      const vals = CUSTOM_FIELDS.map(([field]) => String(d.custom[field] == null ? '' : d.custom[field]).trim())
      if (vals.every((v) => v !== '' && Number.isFinite(Number(v)))) {
        return vals.map((v) => priceUnit + Number(v).toFixed(2)).join(' / ')
      }
      return t('pricingCustomPending')
    }
    return r && r.rates ? rateLine(r.rates[r.tier] || r.rates.peak) : t('unpriced')
  }
  /** 悬停时把两档都列出来：同一格只印一档，但不能让另一半价格看不见。 */
  const priceTitle = (r) => {
    if (!r || !r.rates) return null
    return t('pricingBothTiers', { peak: rateLine(r.rates.peak), off: rateLine(r.rates.offPeak) })
  }

  // 参考模型候选按来源分组：DeepSeek 官方、opencode Zen。「自定义」不是一个组，
  // 而是列表顶部的一个单独选项 —— 选它不是挑一个参考模型，而是直接给这一行填
  // 三个单价（输入 / 输出 / 缓存读），存进 `prices`。
  const SOURCE_LABEL = { deepseek: 'pricingSourceDeepseek', zen: 'pricingSourceZen', custom: 'pricingSourceCustom' }
  const candidateGroups = () => {
    if (!table || !Array.isArray(table.groups)) return []
    const q = pickText.trim().toLowerCase()
    let budget = 80
    const out = []
    for (const group of table.groups) {
      const all = Array.isArray(group.ids) ? group.ids : []
      const ids = all.filter((id) => (q === '' ? true : id.toLowerCase().includes(q)))
      if (ids.length === 0) continue
      const kept = ids.slice(0, Math.max(0, budget))
      budget -= kept.length
      out.push({ source: group.source, ids: kept })
      if (budget <= 0) break
    }
    return out
  }

  /** 某组里的 id 属于哪个来源（草稿刚选的目标也查得到）。 */
  const sourceOf = (id) => {
    if (!id || !table || !Array.isArray(table.groups)) return null
    for (const group of table.groups) {
      if (Array.isArray(group.ids) && group.ids.includes(id)) return group.source
    }
    return null
  }

  /**
   * 当前行要显示的匹配目标：草稿优先于宿主的答案。
   *
   * 用户刚选完目标就要立刻看见，否则读起来像「点了没反应」；已收回的显示为空。
   */
  const shownOf = (r) => {
    const d = draft[r.key]
    if (!d) return r.target
    if (d.cleared) return null
    if (d.custom) return null // 手填价没有参考模型 id，格子显示「自定义」
    return d.target
  }

  /** 一行的四态：收回即未匹配，选了目标或手填价即自定义，其余用宿主给的 state。 */
  const stateOf = (r) => {
    const d = draft[r.key]
    if (d && d.cleared) return 'none'
    if (d && (d.target || d.custom)) return 'custom'
    return r.state
  }

  /**
   * 选择器本体。
   *
   * 未匹配的行不再要求先点一次「选择参考模型」：展开的那一刻输入框就带焦点，
   * 选完直接落进草稿（仍然要按「确定」才写盘）。
   */
  const pickerFor = (key) => {
    const row = rows.find((x) => x.key === key)
    const cur = row ? shownOf(row) : null
    return [
      h('input', {
        key: 'q',
        type: 'text',
        className: 'tsd-price-pick-input',
        value: pickText,
        placeholder: t('askPick'),
        autoFocus: true,
        onChange: (e) => setPickText(e.target.value),
      }),
      h('div', { key: 'l', className: 'tsd-price-pick-list', role: 'listbox' },
        // 顶部固定一条「自定义」：选它不是挑参考模型，而是给这一行手填三个单价。
        h('button', {
          key: 'custom',
          type: 'button',
          role: 'option',
          'aria-selected': 'false',
          className: 'tsd-price-pick-item tsd-price-pick-custom',
          onClick: () => startCustom(key),
        },
          h('span', { className: 'tsd-price-pick-custom-label' }, t('pricingCustomOption')),
          h('span', { className: 'tsd-price-pick-custom-hint' }, t('pricingCustomHint'))),
        h('div', { key: 'sep', className: 'tsd-price-pick-sep', role: 'presentation' }),
        // 一组一个表头 + 若干选项。role 保持 listbox/option，表头只是分组标签。
        candidateGroups().map((group) => [
          h('div', {
            key: 'g:' + group.source,
            className: 'tsd-price-pick-group',
            role: 'presentation',
          }, t(SOURCE_LABEL[group.source] || group.source)),
          ...group.ids.map((id) => h('button', {
            key: id,
            type: 'button',
            role: 'option',
            'aria-selected': id === (cur || ''),
            className: 'tsd-price-pick-item' + (id === cur ? ' tsd-price-pick-item-active' : ''),
            onClick: () => choose(key, id),
          }, id)),
        ])),
    ]
  }

  const bindPickAnchor = (el) => { if (el) pickAnchor.current = el }

  const renderRow = (r) => {
    const d = draft[r.key]
    const state = stateOf(r)
    const shown = shownOf(r)
    const picking = pickFor === r.key
    const editing = editFor === r.key
    const openPick = () => { if (picking) { closePick(); return } setEditFor(null); setPickFor(r.key); setPickText('') }
    // 还原只在真的改过（或历史确认过）的行上出现：精确/模糊命中的行本来就没有
    // 可还原的东西，每行都挂一颗按钮只会把表格挤成表单。
    const canReset = state === 'custom' || (d && d.dirty)
    // 弹窗遮罩是 z-index 60，浮层必须压在它上面；其余定位（上翻、封高）交给 hook。
    const pickPanel = picking
      ? h('div', {
          className: 'tsd-price-pick-box',
          style: Object.assign({}, pickStyle, { zIndex: 70 }),
          onKeyDown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePick() } },
        }, pickerFor(r.key))
      : null
    // 手填单价的浮层：三格（输入 / 输出 / 缓存读），单位就是表格的展示币种。
    const cur = editing ? customOf(r) : null
    const customPanel = editing
      ? h('div', {
          className: 'tsd-price-pick-box tsd-price-custom-box',
          style: Object.assign({}, customStyle, { zIndex: 70 }),
          onKeyDown: (e) => { if (e.key === 'Escape') { e.stopPropagation(); setEditFor(null) } },
        },
          h('div', { className: 'tsd-price-custom-title' }, t('pricingCustomOption')),
          ...CUSTOM_FIELDS.map(([field, label]) => h('label', { key: field, className: 'tsd-price-custom-field' },
            h('span', null, t(label)),
            h('input', {
              type: 'number',
              min: '0',
              step: '0.001',
              className: 'tsd-price-custom-input',
              'data-field': field,
              value: cur[field],
              autoFocus: field === 'input',
              onChange: (e) => setCustomField(r.key, field, e.target.value),
            }))),
          h('div', { className: 'tsd-price-custom-hint' }, t('pricingCustomUnit', { unit: priceUnit })),
          h('button', {
            type: 'button',
            className: 'tsd-btn tsd-btn-ghost tsd-btn-xs',
            onClick: () => setEditFor(null),
          }, t('done')))
      : null
    // 这一行匹配到的参考模型属于哪一类（DeepSeek / Zen / 自定义）。草稿里刚选的
    // 目标也查得到：候选名单本来就按来源分好了组，不用再问宿主一次。
    // 「自定义」不仅指草稿：从 `prices` 计价的行也没有参考模型 id（target 为空），
    // 它的目标格要写「自定义」，不然会显示成待选。
    const isCustom = Boolean(d && d.custom) || (r.how === 'custom' && !r.target)
    const src = shown ? (sourceOf(shown) || r.source) : (isCustom ? 'custom' : null)
    return h('tr', { key: r.key, className: 'tsd-price-row', 'data-state': state, 'data-model': r.key, 'data-dirty': d && d.dirty ? 'true' : undefined },
      h('td', { className: 'tsd-price-model', title: r.key },
        h('span', { className: 'tsd-price-model-name' }, shortModelName(r.key)),
        r.provider ? h('span', { className: 'tsd-price-model-provider' }, r.provider) : null),
      // 匹配目标格本身就是选择器入口：一颗紧凑按钮，未匹配时虚线 + 提示语。
      h('td', { className: 'tsd-price-target', ref: picking || editing ? bindPickAnchor : undefined },
        h('button', {
          type: 'button',
          className: 'tsd-price-target-btn',
          'data-empty': shown || isCustom ? undefined : 'true',
          'aria-expanded': picking || editing ? 'true' : 'false',
          'aria-haspopup': 'listbox',
          title: shown ? shown + (src ? ' · ' + t(SOURCE_LABEL[src] || src) : '') : null,
          onClick: openPick,
        },
          h('span', { className: 'tsd-price-target-id' }, shown || (isCustom ? t('pricingCustomOption') : t('askPick'))),
          h(SvgIcon, { name: 'chevron', size: 12, className: 'tsd-price-target-chev' })),
        src
          ? h('span', { className: 'tsd-price-src', 'data-source': src }, t(SOURCE_LABEL[src] || src))
          : null,
        state !== 'none' && !r.rates && !isCustom
          ? h('span', { className: 'tsd-price-stale' }, t('pricingStale'))
          : null,
        pickPanel,
        customPanel),
      h('td', null, h('span', { className: 'tsd-price-badge', 'data-state': state, title: r.why || null }, t(MATCH_STATE_LABEL[state]))),
      h('td', { className: 'tsd-price-rate', title: priceTitle(r) }, priceLine(r)),
      h('td', { className: 'tsd-price-ops' },
        canReset
          ? h('button', {
              type: 'button',
              className: 'tsd-price-reset',
              title: t('pricingClear'),
              'aria-label': t('pricingClear'),
              onClick: () => clearRow(r.key),
            }, h(SvgIcon, { name: 'refresh', size: 12 }))
          : null))
  }

  const body = status === 'loading'
    ? h('div', { className: 'tsd-price-loading' }, t('loading'))
    : status === 'error'
      ? h('div', { className: 'tsd-alert-banner', role: 'alert' },
          h('span', null, t('pricingFailed', { message: String((error && error.message) || error) })),
          h('button', { type: 'button', className: 'tsd-btn tsd-btn-ghost', onClick: pull }, t('retry')))
      : h('div', { className: 'tsd-price-body' },
          h('div', { className: 'tsd-price-meta' },
            table && table.source
              ? t('pricingTableMeta', { source: table.source, date: stampText(table.capturedAt) })
              : null,
            h('span', { className: 'tsd-price-counts' }, t('pricingCounts', {
              exact: counts.exact, fuzzy: counts.fuzzy, none: counts.none, custom: counts.custom,
            }))),
          // 一张表装两段行：待选的未定价行在前，已按阶梯命中的行在后。
          // 分成两张表会出现两行表头，看起来像两份数据。
          !hasMainRows
            ? h('div', { className: 'tsd-price-empty' }, t('askEmpty'))
            : h('table', { className: 'tsd-price-table' },
                h('thead', null, h('tr', null,
                  h('th', null, t('pricingColModel')),
                  h('th', null, t('pricingColMatch')),
                  h('th', null, t('pricingColState')),
                  h('th', null, t('pricingColPrice', { unit: priceUnit })),
                  h('th', null, ''))),
                h('tbody', null,
                  pendingRows.map((r) => renderRow(r)),
                  matchedRows.map((r) => renderRow(r)))),
          h('div', { className: 'tsd-price-history' },
            h('button', {
              type: 'button',
              className: 'tsd-price-history-toggle',
              'aria-expanded': historyOpen,
              onClick: () => setHistoryOpen((v) => !v),
            },
              h(SvgIcon, { name: 'chevron', size: 12, className: 'tsd-price-history-chev' + (historyOpen ? ' tsd-price-history-chev-open' : '') }),
              h('span', null, t('pricingHistory', { n: historyRows.length }))),
            historyOpen
              ? historyRows.length === 0
                ? h('div', { className: 'tsd-price-empty' }, t('pricingHistoryEmpty'))
                : h('div', null,
                    h('table', { className: 'tsd-price-table tsd-price-table-sub' },
                      h('thead', null, h('tr', null,
                        h('th', null, t('pricingColModel')),
                        h('th', null, t('pricingColMatch')),
                        h('th', null, t('pricingColState')),
                        h('th', null, t('pricingColPrice', { unit: priceUnit })),
                        h('th', null, ''))),
                      h('tbody', null, historyRows.map((r) => renderRow(r)))))
              : null))

  return h('div', { className: 'tsd-price-overlay', role: 'presentation', onMouseDown: (e) => { if (e.target === e.currentTarget) onClose() } },
    h('div', {
      className: 'tsd-price-dialog',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': t('pricingTitle'),
      onKeyDown,
    },
      h('div', { className: 'tsd-price-head' },
        h('h3', { className: 'tsd-price-title' }, t('pricingTitle')),
        h('button', {
          type: 'button',
          className: 'tsd-price-close',
          title: t('cancel'),
          'aria-label': t('cancel'),
          onClick: onClose,
        }, h(SvgIcon, { name: 'x', size: 14 }))),
      h('p', { className: 'tsd-price-desc' }, t('pricingDesc')),
      body,
      h('div', { className: 'tsd-price-foot' },
        h('button', {
          type: 'button',
          className: 'tsd-btn tsd-btn-ghost tsd-btn-icon-label',
          onClick: pull,
          disabled: status === 'loading' || saving,
        },
          h(SvgIcon, { name: 'contextInjection', size: 14 }),
          h('span', null, t('pricingPull'))),
        h('span', { className: 'tsd-price-hint' }, dirtyKeys.length > 0 ? t('pricingApplyHint') : ''),
        h('button', { type: 'button', className: 'tsd-btn tsd-btn-ghost', onClick: onClose, disabled: saving }, t('cancel')),
        h('button', {
          type: 'button',
          className: 'tsd-btn tsd-btn-primary',
          onClick: submit,
          disabled: saving,
        }, saving ? t('loading') : t('pricingSave')))))
}

/* ---------------------------------------------------------------------------
 * 每日用量柱状图（手写 div 堆叠柱：下段输入蓝 / 上段输出绿）
 * ------------------------------------------------------------------------- */
/**
 * One hover-tip content block, shared by the trend chart (bar + line) and the
 * yearly heatmap: date, input, output, total, reference cost.
 *
 * Cost comes from the host bucket (`cost`, already converted to the display
 * currency), so all three tips show the same number as the summary card and the
 * model table. A zero is printed as ¥0.00 — "0" is a price, "unpriced" is a
 * different verdict, and it is the host's to give.
 */
function TipRows(props) {
  const { row, t, currency, withSplit } = props
  const inT = row.inputTokens || 0
  const outT = row.outputTokens || 0
  const totT = row.totalTokens || 0
  return [
    withSplit
      ? h('div', { key: 'in', className: 'tsd-tooltip-row' },
          h('span', { className: 'tsd-tooltip-dot tsd-legend-in' }),
          h('span', null, t('legendInput')),
          h('span', { className: 'tsd-tooltip-val' }, formatInt(inT)))
      : h('div', { key: 'in', className: 'tsd-tooltip-row' },
          h('span', { className: 'tsd-tooltip-dot', style: { background: 'var(--dsw-static-deepseek-500)' } }),
          h('span', null, t('totalTokens')),
          h('span', { className: 'tsd-tooltip-val' }, formatInt(totT))),
    withSplit
      ? h('div', { key: 'out', className: 'tsd-tooltip-row' },
          h('span', { className: 'tsd-tooltip-dot tsd-legend-out' }),
          h('span', null, t('legendOutput')),
          h('span', { className: 'tsd-tooltip-val' }, formatInt(outT)))
      : null,
    // 成本与调用次数没有对应图例，所以只留 10px 的空白占位（.tsd-tooltip-dot 本身无底色），
    // 不画色块：色块的含义是「这一行对应图例里的哪个颜色」。
    h('div', { key: 'cost', className: 'tsd-tooltip-row' },
      h('span', { className: 'tsd-tooltip-dot', 'aria-hidden': 'true' }),
      h('span', null, t('cost')),
      h('span', { className: 'tsd-tooltip-val' }, formatCost(row.cost || 0, currency))),
    row.calls > 0
      ? h('div', { key: 'calls', className: 'tsd-tooltip-row' },
          h('span', { className: 'tsd-tooltip-dot', 'aria-hidden': 'true' }),
          h('span', null, t('calls')),
          h('span', { className: 'tsd-tooltip-val' }, formatInt(row.calls)))
      : null,
    withSplit
      ? h('div', { key: 'total', className: 'tsd-tooltip-total' },
          h('span', null, t('tooltipTotal')),
          h('span', null, formatInt(totT)))
      : null,
  ]
}

function DailyChart(props) {
  const { daily, gran, stepDays, granLabel, currency } = props
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
        h(TipRows, { row: tip.row, t, currency, withSplit: true }))
    : null

  const body = view === 'line'
    ? h(LineChart, { rows, gran, stepDays, showTip, tip, setTip, chartRef, currency })
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
            'aria-label': t('barAria', { key: row.key, in: formatInt(inT), out: formatInt(outT), tot: formatInt(totT), cost: formatCost(row.cost || 0, currency) }),
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
  const { rows, gran, stepDays, showTip, tip, setTip, chartRef, currency } = props
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
          h(TipRows, { row: tip.row, t, currency, withSplit: true }))
      : null)
}

/* ---------------------------------------------------------------------------
 * 年度用量热力图（GitHub 风格）
 * ------------------------------------------------------------------------- */
function HeatmapCard(props) {
  const { days, currency } = props
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
        h(TipRows, { row: htip.cell, t, currency, withSplit: false }))
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
                        title: t('hmTitle', { key: c.key, tokens: formatInt(c.totalTokens || 0), calls: c.calls ? t('hmCalls', { count: formatInt(c.calls) }) : '', cost: formatCost(c.cost || 0, currency) }),
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
    // The verdict comes from the host, which knows whether a price was found.
    // This used to be re-derived here as `tokens > 0 && !(cost > 0)`, which
    // labels every 0-cost row 未定价 — including a model the user explicitly
    // priced at 0 (a real price, cost 0, so ¥0.00 is the honest answer).
    unpriced: r.unpriced === true,
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
function LoadingState(props) {
  const t = useT()
  // 统计中（computing）时头部副标题已经在播报进度，这里就不再做第二个 live 区域，
  // 否则屏幕阅读器会把「正在加载」和「正在统计 12/258」各念一遍。
  const announce = !props || props.announce !== false
  return h('div', { className: 'tsd-loading', role: 'status', 'aria-live': announce ? 'polite' : 'off' },
    // 骨架屏对眼睛是"正在来"，对屏幕阅读器什么都不是：给它一句可读的状态。
    announce ? h('span', { className: 'tsd-visually-hidden' }, t('loading')) : null,
    h('div', { className: 'tsd-cards' },
      // 一张卡一个占位块，张数取自 SUMMARY_CARD_SLOTS —— 与真实卡片同一份顺序表，
      // 所以补卡片时骨架自动跟上（这里曾经写死 5 个，真实是 6 个）。
      SUMMARY_CARD_SLOTS.map((slot) =>
        h('div', { key: slot, className: 'tsd-card tsd-card-skeleton' },
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
  // 展示币种：宿主按它换算成本，所以换币种必须重查；选择记在本地（展示偏好，
  // 不写插件设置，免得每次取数都在改写用户配置）。
  const [displayCurrency, setDisplayCurrency] = React.useState(readStoredCurrency)
  // 定价匹配弹窗：只在这里开着，关掉即卸载（它的内部状态随之丢弃，
  // 所以「不确定就不生效」不需要额外清理逻辑）。
  const [pricingOpen, setPricingOpen] = React.useState(false)
  // P1-6 backfill 轮询状态：queryKey 变化时重置，仅对同一查询串轮询
  const queryKeyRef = React.useRef(null)
  const backfillSeenRef = React.useRef(false)
  const finalRefreshRef = React.useRef(false)
  // 轮询节奏：统计窗口短则快问、长则慢问。固定 3 s 时，暖缓存 ~0.8 s 就跑完，
  // 客户端要等 3 s 才更新 —— 进度条先躺着再跳一格，比没有更糟。
  const pollStepRef = React.useRef(0)
  const POLL_DELAYS = [600, 1500, 3000]

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
    const queryKey = eff.from + '|' + eff.to + '|' + models.join(',') + '|' + effGran + '|' + stepDays + '|' + displayCurrency
    if (queryKeyRef.current !== queryKey) {
      queryKeyRef.current = queryKey
      backfillSeenRef.current = false
      finalRefreshRef.current = false
      pollStepRef.current = 0
    }
    const isFinalRun = finalRefreshRef.current
    finalRefreshRef.current = false
    setStatus((s) => (s === 'ready' && data !== null ? 'refreshing' : 'loading'))
    hostCall('usage/query', {
      from: eff.from,
      to: eff.to,
      models: models.slice(),
      // 「全部」不做零填充：真实边界是输出桶数（宿主 MAX_BUCKETS），不是天数。
      fill: range !== 'all',
      granularity: effGran,
      stepDays,
      heatmap: true,
      currency: displayCurrency,
    })
      .then((r) => {
        if (!current) return
        setData(r)
        setStatus('ready')
        setError(null)
        const bs = r && r.backfill ? r.backfill.status : null
        if (bs === 'running') {
          backfillSeenRef.current = true
          // 同一 effect 至多挂一个定时器；重查复用 retry 计数器触发 effect 重跑。
          // 先快后慢：600 ms 起步能跟上 0.8 s 的暖缓存窗口，长任务再退到 3 s，
          // 不至于把宿主问成压力测试。
          const delay = POLL_DELAYS[Math.min(pollStepRef.current, POLL_DELAYS.length - 1)]
          pollStepRef.current += 1
          backfillTimer = setTimeout(() => {
            if (current) setRetry((v) => v + 1)
          }, delay)
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
  }, [eff.from, eff.to, models, effGran, stepDays, displayCurrency, retry])

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

  const changeCurrency = React.useCallback((code) => {
    storeCurrency(code)
    setDisplayCurrency(code)
  }, [])
  // 符号以宿主回传的实际币种为准（切换后立刻重查，不会出现「换了标志没换数字」）；
  // 老宿主没有该字段时按本地选择兜底。
  const currencySymbol = (data && data.currency && data.currency.symbol)
    || CURRENCY_SYMBOLS[displayCurrency] || prices.currency || '¥'

  const busy = status === 'loading' || status === 'refreshing'
  const ready = data !== null
  const isError = status === 'error'
  const isEmpty = ready && data.daily.length === 0 && data.byModel.length === 0
  // "统计没算完"：宿主还在回填历史（backfill.status === 'running'）。
  // 它比 busy 长得多（全量 258 个会话要几秒），所以进度条与文案都以它为准；
  // 请求在飞（busy）只是刷新，不该被当成"在算"。
  const backfill = (data && data.backfill) || null
  const computing = Boolean(backfill && backfill.status === 'running')
  const computeTotal = (backfill && backfill.total) || 0
  const computeDone = (backfill && backfill.done) || 0
  const computePct = computing && computeTotal > 0
    ? Math.min(100, Math.round((computeDone / computeTotal) * 100))
    : null
  const showProgress = computing || (busy && ready && !isError)

  return h(T.Provider, { value: t },
    h('div', { className: 'tsd-section', 'aria-busy': busy || computing || undefined },
    // 首屏走后骨架屏（见 LoadingState）；这里管"有数据但没算完"与"正在刷新"：
    // 一条 2px 的细进度条，绝对定位，不推动版面也不碰任何数字。
    // 算得完的时候它是确定进度（宽度 = done/total），否则是不确定扫动。
    showProgress
      ? h('div', {
          className: 'tsd-progress',
          'aria-hidden': 'true',
          'data-determinate': computePct === null ? undefined : 'true',
          style: computePct === null ? undefined : { '--tsd-progress': computePct + '%' },
        })
      : null,
    h(StatsHeader, {
      busy,
      computing,
      computeDone,
      computeTotal,
      onRefresh: reload,
    }),
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
    // **从 DSH 启动到统计算完，整段都是加载态。**
    // 覆盖两种"还没东西可看"：
    //  ① 首屏请求还没回来（!ready）；
    //  ② 宿主还在回填历史（computing）—— 哪怕是第二次进来、手里已经有半份数据。
    // 半份数字比骨架更误导：它看起来像"你只有这么多用量"，而且会一格一格往上爬。
    // 这也正是「数字一点点往上爬」那个抱怨的来源，所以宁可等，也不要给残缺的答案。
    (!ready || computing) && !isError
      ? h(LoadingState, { announce: !computing })
      : null,
    ready && isError
      ? h('div', { className: 'tsd-alert-banner', role: 'alert' },
          h('span', null, t('loadFailed', { message: String((error && error.message) || error) })),
          h('button', { type: 'button', className: 'tsd-btn tsd-btn-ghost', onClick: reload }, t('retry')))
      : null,
    // 空态只在"确实算完了还没有记录"时出现。统计中不落到空态。
    ready && !isError && isEmpty && !computing
      ? h(EmptyState, { filtered: models.length > 0, onReset: resetFilters })
      : null,
    // 数据区同理：算完之前不渲染，免得残缺数字先出现再跳变。
    ready && !isError && !isEmpty && !computing
      ? h('div', { className: 'tsd-content' },
          h(SummaryCards, {
            total: data.total,
            currency: currencySymbol,
            unpricedCalls: data.unpricedCalls || 0,
            currencyCode: displayCurrency,
            onCurrencyChange: changeCurrency,
            byModel: data.byModel,
            pricing: data.pricing,
            onOpenPricing: () => setPricingOpen(true),
          }),
          h(DailyChart, {
            daily: data.daily,
            gran: effGran,
            stepDays,
            granLabel,
            currency: currencySymbol,
          }),
          h(HeatmapCard, { days: data.heatmap || [], currency: currencySymbol }),
          h(ModelTable, { rows: data.byModel, currency: currencySymbol }))
      : null,
    pricingOpen
      ? h(PricingDialog, {
          currency: { code: displayCurrency, symbol: currencySymbol },
          onClose: () => setPricingOpen(false),
          // 确定后重查一次：匹配改了，卡片上的数字必须跟着变，否则用户会以为没保存成功。
          onApplied: reload,
        })
      : null))
}

/* ---------------------------------------------------------------------------
 * 设置页导航图标
 *
 * 原生确实没有这个插口 —— 取证过的，不是"我觉得"：
 *   · 官方设置页把 `settings.section` 的条目投影成 `{id, order, label}` 三字段，
 *     没有 icon（`@deepseek-ai/dsh-client-ui-settings-general` 的 nav rows
 *     getSnapshot：`ctx.slots.entries("settings.section").map(e => ({id, order,
 *     label: resolveSlotLabel(e.options.label)}))`）；
 *   · 图标由该包自己的 `navIcon(id)` 按 id 白名单选，未列出的 id 回落到设置齿轮
 *     （同包 `function navIcon(id)`，其注释原文 "unknown ids fall back to the
 *     settings gear"）。
 * 所以第三方只能给自己的那一行打属性标记、用 CSS mask 换字形：不替换节点、不碰
 * React 管的 svg（替换会让 React 卸载时抛 NotFoundError），只加属性、只用 ::before
 * 画字形。官方一旦给 `settings.section` 加上 icon 字段，这个模块应整体删除 ——
 * 那时它是可引用的 L0，不该再留 L2 补缺。
 *
 * 认行只能按可见文本：类名是 CSS Modules 哈希，账号行还会条件出现。
 * 官方一旦给 settings.section 加上 icon 字段，这个模块应整体删除。
 * ------------------------------------------------------------------------- */
const NAV_ICON_MASK = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">'
  + '<rect x="2.5" y="9" width="2.5" height="5" rx="1"/>'
  + '<rect x="6.75" y="5.5" width="2.5" height="8.5" rx="1"/>'
  + '<rect x="11" y="2.5" width="2.5" height="11.5" rx="1"/></svg>',
)
// mask 只读 alpha 通道，所以字形必须是纯色实心（icon.svg 的渐变与半透明在这里会丢）
const NAV_ICON_CSS = [
  '[data-tsd-nav] > svg { display: none; }',
  '[data-tsd-nav]::before {',
  "  content: '';",
  '  flex: none;',
  '  width: 16px;',
  '  height: 16px;',
  '  background: currentColor;',
  '  -webkit-mask-image: url("' + NAV_ICON_MASK + '");',
  '  mask-image: url("' + NAV_ICON_MASK + '");',
  '  -webkit-mask-size: 16px 16px;',
  '  mask-size: 16px 16px;',
  '  -webkit-mask-repeat: no-repeat;',
  '  mask-repeat: no-repeat;',
  '}',
].join('\n')

/** 认不出行、拿不到 DOM，都只是退化成齿轮，绝不抛出。返回 disposer。 */
function installSettingsNavIcon(label) {
  if (typeof document === 'undefined' || typeof MutationObserver !== 'function') return null
  let styleEl = null
  try {
    styleEl = document.createElement('style')
    styleEl.setAttribute('data-plugin', 'dsh-plugin-usage')
    styleEl.textContent = NAV_ICON_CSS
    document.head.appendChild(styleEl)
  } catch (e) {
    logWarn('[usage] settings nav icon: styles unavailable')
    return null
  }
  const mark = () => {
    const rows = document.querySelectorAll('[role="dialog"] button')
    const want = label()
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (row.getAttribute('data-tsd-nav') !== null) continue
      if (!row.querySelector('svg')) continue // 只标带图标的导航行，别误标普通按钮
      if ((row.textContent || '').trim() !== want) continue
      row.setAttribute('data-tsd-nav', '')
    }
  }
  let observer = null
  try {
    mark()
    observer = new MutationObserver(() => { try { mark() } catch (e) {} })
    observer.observe(document.body, { childList: true, subtree: true })
  } catch (e) {
    logWarn('[usage] settings nav icon: observer unavailable', e)
  }
  return () => {
    if (observer) observer.disconnect()
    if (styleEl) styleEl.remove()
    const marked = document.querySelectorAll('[data-tsd-nav]')
    for (let i = 0; i < marked.length; i++) marked[i].removeAttribute('data-tsd-nav')
  }
}

/* ---------------------------------------------------------------------------
 * 输入区成本 pill（composer dock）
 *
 * DSH 0.2.1-rc.1 把输入区统计拆成 `activity` / `usage` 两个 composer dock 条目，
 * 宿主自己的 `usage` pill 显示 token 数（读官方 `tokenUsage` 投影）。官方投影只有
 * 会话内合计、**不带模型归因**，而成本必须按模型单价算（本插件自 v0.3 起坚持
 * 不混价），所以这里不走投影，改走本插件自己的 `query`：记录里带 provider/model，
 * 宿主侧按模型精确计价。
 *
 * 口径取「今日」而不是「本会话」：dock 条目拿不到会话标识（宿主渲染这个 slot 时
 * 是 `renderSlot("conversation.composer.dock", {})`，不传 props），而今日成本与
 * 宿主的 token pill 正好互补。
 * ------------------------------------------------------------------------- */
const DOCK_REFRESH_MS = 30000
/** 回填（backfill）进行中的快重试间隔，与设置页一致。 */
const DOCK_BACKFILL_RETRY_MS = 3000

function CostPill(props) {
  const tr = props && typeof props.t === 'function' ? props.t : fallbackT
  const [state, setState] = React.useState({ status: 'loading' })
  React.useEffect(() => {
    let alive = true
    let timer = null
    const schedule = (ms) => {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(load, ms)
    }
    const load = () => {
      if (!alive) return
      const now = new Date()
      hostCall('usage/query', {
        from: startOfDay(now).getTime(),
        to: now.getTime(),
        // 「今日」是有限区间，但不需零填充：空桶对成本没意义。
        fill: false,
        granularity: 'day',
        currency: readStoredCurrency(),
      })
        .then((r) => {
          if (!alive) return
          const total = (r && r.total) || null
          setState({
            status: 'ready',
            calls: total ? total.calls : 0,
            tokens: total ? total.totalTokens : 0,
            cost: total ? total.cost : 0,
            symbol: (r && r.currency && r.currency.symbol)
              || CURRENCY_SYMBOLS[readStoredCurrency()]
              || '¥',
          })
          const backfilling = Boolean(r && r.backfill && r.backfill.status === 'running')
          schedule(backfilling ? DOCK_BACKFILL_RETRY_MS : DOCK_REFRESH_MS)
        })
        .catch(() => {
          // 路由不可用 / 宿主未就绪：不猜数字，也不报错弹窗（dock 常驻，不能刷屏）。
          if (alive) {
            setState({ status: 'error' })
            schedule(DOCK_REFRESH_MS)
          }
        })
    }
    load()
    const onVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') load()
    }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      if (timer !== null) clearTimeout(timer)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  // 今日无调用（或还没查到）就不占位：dock 是常驻区，空 pill 比没有更吵。
  if (state.status !== 'ready' || !state.calls) return null
  const priced = state.cost > 0
  const value = priced ? state.symbol + costDigits(state.cost) : tr('dockUnpriced')
  const hint = tr('dockHint', {
    cost: value,
    calls: formatInt(state.calls),
    tokens: formatInt(state.tokens),
  })
  return h('span', {
    className: 'tsd-dock',
    title: hint,
    'aria-label': hint,
    'data-usage-cost': true,
  },
    h('span', { className: 'tsd-dock-label' }, tr('today')),
    h('span', { className: 'tsd-dock-value' }, value))
}

/* ---------------------------------------------------------------------------
 * 注册：settings.section 页面
 * ------------------------------------------------------------------------- */
function apply(ctx) {
  usageCtx = ctx
  // Mount the native Remote face once the page is up; the Fetch routes carry
  // every call until it lands.
  mountRemoteChannel(ctx)
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
  ctx.effect(() => installSettingsNavIcon(() => t0('nav')), 'usage: nav-icon')
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
    logWarn('[usage] settings.section slot unavailable')
    return
  }
  slots.inject('settings.section', () => slots.register(
    { name: 'settings.section', id: 'token-stats', order: 20, label: () => t0('nav'), locale: NS },
    (props) => h(StatsDashboard, props),
  ))

  // 输入区成本 pill。0.2.1 的 composer dock 是 list slot，宿主自己占了 activity(0)
  // 与 usage(1)，插件排在它们之后；0.2.0 没有这个 slot，注入失败不能拖垮设置页。
  try {
    slots.inject('conversation.composer.dock', () => slots.register(
      { name: 'conversation.composer.dock', id: 'usage-cost', order: 2, locale: NS },
      (props) => h(CostPill, props),
    ))
  } catch (e) {
    console.warn('[usage] composer dock slot unavailable', e)
  }
}

return { inject: ['locale', 'slots'], apply }
