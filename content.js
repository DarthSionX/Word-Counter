// Content script — selection counting and on-page tooltip only

let lastContextMenuCoords = null;
let activeTooltipDismiss = null;

document.addEventListener('contextmenu', (e) => {
  lastContextMenuCoords = { x: e.clientX, y: e.clientY };
}, true);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SELECTION') {
    sendResponse({ text: window.getSelection().toString() });
    return;
  }

  if (message.type === 'SHOW_SELECTION_TOOLTIP') {
    try {
      showSelectionTooltip(message.stats, message.anchorCoords || null);
      sendResponse({ success: true });
    } catch (err) {
      console.error('Error rendering selection tooltip:', err);
      sendResponse({ success: false });
    }
    return true;
  }

  if (message.type === 'TRIGGER_CONTEXT_MENU_COUNT') {
    const selection = window.getSelection().toString();
    if (!selection || !selection.trim()) {
      sendResponse({ success: false });
      return true;
    }

    chrome.storage.local.get(['wpmRead', 'wpmSpeak'], (settings) => {
      const stats = calculateTextStats(selection, {
        wpmRead: settings.wpmRead || 200,
        wpmSpeak: settings.wpmSpeak || 130
      });
      showSelectionTooltip(stats, lastContextMenuCoords);
      sendResponse({ success: true });
    });
    return true;
  }
});

function dismissSelectionTooltip() {
  if (activeTooltipDismiss) {
    activeTooltipDismiss();
    activeTooltipDismiss = null;
  }
}

function showSelectionTooltip(stats, anchorCoords = null) {
  dismissSelectionTooltip();

  const host = document.createElement('div');
  host.id = 'word-counter-tooltip-root';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  let anchorX;
  let anchorY;

  if (anchorCoords) {
    anchorX = anchorCoords.x;
    anchorY = anchorCoords.y;
  } else {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) {
      host.remove();
      return;
    }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    anchorX = rect.left + rect.width / 2;
    anchorY = rect.top;
  }

  const tooltip = document.createElement('div');
  tooltip.className = 'selection-tooltip';

  tooltip.innerHTML = `
    <button class="tooltip-close" type="button" title="Close" aria-label="Close">&times;</button>
    <div class="tooltip-row">
      <span class="tooltip-val">${stats.wordCount.toLocaleString()}</span> <span class="tooltip-lbl">words</span>
      <span class="tooltip-divider">|</span>
      <span class="tooltip-val">${stats.charCount.toLocaleString()}</span> <span class="tooltip-lbl">chars</span>
      <span class="tooltip-divider">|</span>
      <span class="tooltip-val">${stats.charCountNoSpace.toLocaleString()}</span> <span class="tooltip-lbl">no space</span>
      <span class="tooltip-divider">|</span>
      <span class="tooltip-val">${stats.sentenceCount}</span> <span class="tooltip-lbl">sentences</span>
      <span class="tooltip-divider">|</span>
      <span class="tooltip-val">${stats.paragraphCount}</span> <span class="tooltip-lbl">paragraphs</span>
      <span class="tooltip-divider">|</span>
      <span class="tooltip-lbl">reading:</span> <span class="tooltip-val">${stats.readTime}</span>
    </div>
    <div class="tooltip-arrow"></div>
  `;

  const style = document.createElement('style');
  style.textContent = `
    .selection-tooltip {
      position: fixed;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 8px 28px 8px 12px;
      color: #f8fafc;
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 11px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      z-index: 2147483647;
      pointer-events: auto;
      opacity: 0;
      transform: translate(-50%, 10px);
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    .selection-tooltip.visible {
      opacity: 1;
      transform: translate(-50%, 0);
    }
    .tooltip-close {
      position: absolute;
      top: 4px;
      right: 6px;
      width: 18px;
      height: 18px;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: #94a3b8;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .tooltip-close:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.08);
    }
    .tooltip-row {
      display: flex;
      align-items: center;
      gap: 5px;
      white-space: nowrap;
    }
    .tooltip-val {
      font-weight: 700;
      color: #6366f1;
    }
    .tooltip-lbl {
      color: #94a3b8;
    }
    .tooltip-divider {
      color: rgba(255, 255, 255, 0.15);
      margin: 0 2px;
    }
    .tooltip-arrow {
      position: absolute;
      bottom: -5px;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-top: 5px solid rgba(15, 23, 42, 0.95);
    }
  `;

  shadow.appendChild(style);
  shadow.appendChild(tooltip);

  const margin = 8;
  const offsetY = 42;

  function clampPosition() {
    const rect = tooltip.getBoundingClientRect();
    let left = anchorX;
    let top = anchorY - offsetY;

    const halfWidth = rect.width / 2;
    if (left - halfWidth < margin) left = halfWidth + margin;
    if (left + halfWidth > window.innerWidth - margin) left = window.innerWidth - halfWidth - margin;
    if (top < margin) top = anchorY + 16;

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  clampPosition();

  requestAnimationFrame(() => {
    tooltip.classList.add('visible');
    clampPosition();
  });

  function hideTooltip() {
    tooltip.classList.remove('visible');
    setTimeout(() => host.remove(), 200);
    document.removeEventListener('mousedown', clickHandler);
    if (activeTooltipDismiss === hideTooltip) {
      activeTooltipDismiss = null;
    }
  }

  shadow.querySelector('.tooltip-close').addEventListener('click', (e) => {
    e.stopPropagation();
    hideTooltip();
  });

  const clickHandler = (e) => {
    if (e.composedPath().includes(host)) return;
    hideTooltip();
  };

  setTimeout(() => {
    document.addEventListener('mousedown', clickHandler);
  }, 100);

  activeTooltipDismiss = hideTooltip;
}