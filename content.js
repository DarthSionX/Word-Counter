// Content script — live selection panel and on-demand stats

const PANEL_HOST_ID = 'word-counter-live-panel-root';

let lastContextMenuCoords = null;
let selectionDebounce = null;
let panelHost = null;
let panelShadow = null;
let panelElement = null;
let hidePanelTimer = null;

let cachedSettings = {
  wpmRead: 200,
  wpmSpeak: 130,
  liveSelectionCounter: true
};

function loadSettings() {
  chrome.storage.local.get(['wpmRead', 'wpmSpeak', 'liveSelectionCounter'], (data) => {
    cachedSettings = {
      wpmRead: data.wpmRead || 200,
      wpmSpeak: data.wpmSpeak || 130,
      liveSelectionCounter: data.liveSelectionCounter !== false
    };
    if (!cachedSettings.liveSelectionCounter) {
      hideLivePanel();
    }
  });
}

loadSettings();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;

  if (changes.wpmRead) cachedSettings.wpmRead = changes.wpmRead.newValue || 200;
  if (changes.wpmSpeak) cachedSettings.wpmSpeak = changes.wpmSpeak.newValue || 130;
  if (changes.liveSelectionCounter) {
    cachedSettings.liveSelectionCounter = changes.liveSelectionCounter.newValue !== false;
    if (!cachedSettings.liveSelectionCounter) hideLivePanel();
    else handleSelectionChange();
  }
});

document.addEventListener('contextmenu', (e) => {
  lastContextMenuCoords = { x: e.clientX, y: e.clientY };
}, true);

document.addEventListener('selectionchange', () => {
  clearTimeout(selectionDebounce);
  selectionDebounce = setTimeout(handleSelectionChange, 60);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_SELECTION') {
    sendResponse({ text: window.getSelection().toString() });
    return;
  }

  if (message.type === 'SHOW_SELECTION_TOOLTIP') {
    try {
      showLivePanel(message.stats, message.anchorCoords || null, { persist: true });
      sendResponse({ success: true });
    } catch (err) {
      console.error('Error rendering selection panel:', err);
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
      showLivePanel(stats, lastContextMenuCoords, { persist: true });
      sendResponse({ success: true });
    });
    return true;
  }
});

function handleSelectionChange() {
  if (!cachedSettings.liveSelectionCounter) {
    hideLivePanel();
    return;
  }

  const text = window.getSelection().toString();
  if (!text || !text.trim()) {
    hideLivePanel();
    return;
  }

  const stats = calculateTextStats(text, cachedSettings);
  const rect = getSelectionRect();
  if (!rect) {
    hideLivePanel();
    return;
  }

  showLivePanel(stats, rect, { persist: false });
}

function getSelectionRect() {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    centerX: rect.left + rect.width / 2,
    centerY: rect.top
  };
}

function coordsToAnchor(coords) {
  if (!coords) return getSelectionRect();
  if (typeof coords.x === 'number') {
    return { centerX: coords.x, centerY: coords.y, top: coords.y, left: coords.x, width: 0, height: 0 };
  }
  return coords;
}

function ensurePanel() {
  if (panelHost && panelElement) return;

  panelHost = document.createElement('div');
  panelHost.id = PANEL_HOST_ID;
  document.body.appendChild(panelHost);

  panelShadow = panelHost.attachShadow({ mode: 'open' });

  const style = document.createElement('style');
  style.textContent = `
    .live-panel {
      position: fixed;
      width: 228px;
      background: rgba(15, 23, 42, 0.96);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      padding: 8px 10px 10px;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
      z-index: 2147483647;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease;
    }
    .live-panel.visible {
      opacity: 1;
    }
    .live-metrics-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px 4px;
    }
    .live-metric {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      min-width: 0;
    }
    .live-metric-value {
      font-size: 11px;
      font-weight: 700;
      color: #6366f1;
      line-height: 1.2;
    }
    .live-metric-value.time-read {
      color: #a5b4fc;
    }
    .live-metric-value.time-speak {
      color: #c084fc;
    }
    .live-metric-label {
      font-size: 7px;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.3px;
      margin-top: 2px;
      line-height: 1.2;
    }
    .live-panel-arrow {
      position: absolute;
      bottom: -5px;
      left: 50%;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-top: 5px solid rgba(15, 23, 42, 0.96);
    }
  `;

  panelElement = document.createElement('div');
  panelElement.className = 'live-panel';
  panelElement.innerHTML = `
    <div class="live-metrics-grid">
      <div class="live-metric">
        <span class="live-metric-value" data-stat="wordCount">0</span>
        <span class="live-metric-label">Words</span>
      </div>
      <div class="live-metric">
        <span class="live-metric-value" data-stat="charCountNoSpace">0</span>
        <span class="live-metric-label">Chars</span>
      </div>
      <div class="live-metric">
        <span class="live-metric-value" data-stat="sentenceCount">0</span>
        <span class="live-metric-label">Sentences</span>
      </div>
      <div class="live-metric">
        <span class="live-metric-value" data-stat="paragraphCount">0</span>
        <span class="live-metric-label">Paragraphs</span>
      </div>
      <div class="live-metric">
        <span class="live-metric-value time-read" data-stat="readTime">0s</span>
        <span class="live-metric-label">Reading</span>
      </div>
      <div class="live-metric">
        <span class="live-metric-value time-speak" data-stat="speakTime">0s</span>
        <span class="live-metric-label">Speaking</span>
      </div>
    </div>
    <div class="live-panel-arrow"></div>
  `;

  panelShadow.appendChild(style);
  panelShadow.appendChild(panelElement);
}

function updatePanelValues(stats) {
  const formatters = {
    wordCount: (v) => v.toLocaleString(),
    charCountNoSpace: (v) => v.toLocaleString(),
    sentenceCount: (v) => v.toLocaleString(),
    paragraphCount: (v) => v.toLocaleString(),
    readTime: (v) => v,
    speakTime: (v) => v
  };

  panelShadow.querySelectorAll('[data-stat]').forEach((el) => {
    const key = el.getAttribute('data-stat');
    if (stats[key] !== undefined && formatters[key]) {
      el.textContent = formatters[key](stats[key]);
    }
  });
}

function positionLivePanel(anchor) {
  if (!panelElement || !anchor) return;

  const margin = 8;
  const offsetY = 12;
  let left = anchor.centerX;
  let top = anchor.top - offsetY;

  panelElement.style.left = `${left}px`;
  panelElement.style.top = `${top}px`;
  panelElement.style.transform = 'translate(-50%, -100%)';

  const rect = panelElement.getBoundingClientRect();
  const halfWidth = rect.width / 2;

  if (left - halfWidth < margin) left = halfWidth + margin;
  if (left + halfWidth > window.innerWidth - margin) left = window.innerWidth - halfWidth - margin;

  if (top - rect.height < margin) {
    top = anchor.top + (anchor.height || 16) + offsetY;
    panelElement.style.transform = 'translate(-50%, 0)';
  } else {
    panelElement.style.transform = 'translate(-50%, -100%)';
  }

  panelElement.style.left = `${left}px`;
  panelElement.style.top = `${top}px`;
}

function showLivePanel(stats, anchorCoords = null, { persist = false } = {}) {
  clearTimeout(hidePanelTimer);

  const anchor = coordsToAnchor(anchorCoords);
  if (!anchor) return;

  ensurePanel();
  updatePanelValues(stats);
  positionLivePanel(anchor);

  requestAnimationFrame(() => {
    panelElement.classList.add('visible');
    positionLivePanel(anchor);
  });
}

function hideLivePanel() {
  if (!panelHost || !panelElement) return;

  clearTimeout(hidePanelTimer);
  panelElement.classList.remove('visible');

  hidePanelTimer = setTimeout(() => {
    if (panelHost) {
      panelHost.remove();
      panelHost = null;
      panelShadow = null;
      panelElement = null;
    }
  }, 150);
}