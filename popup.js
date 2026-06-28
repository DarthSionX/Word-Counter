document.addEventListener('DOMContentLoaded', () => {
  const tabLinks = document.querySelectorAll('.tab-link');
  const tabPanels = document.querySelectorAll('.tab-panel');

  const selectionPlaceholder = document.getElementById('selectionPlaceholder');
  const selectionContent = document.getElementById('selectionContent');
  const selectionDot = document.getElementById('selectionDot');
  const quickPasteArea = document.getElementById('quickPasteArea');
  const charCounter = document.getElementById('charCounter');
  const keywordsCard = document.getElementById('keywordsCard');
  const keywordsList = document.getElementById('keywordsList');
  const copyStatsBtn = document.getElementById('copyStatsBtn');

  const valWords = document.getElementById('valWords');
  const valChars = document.getElementById('valChars');
  const valSentences = document.getElementById('valSentences');
  const valParagraphs = document.getElementById('valParagraphs');
  const valReadTime = document.getElementById('valReadTime');
  const valSpeakTime = document.getElementById('valSpeakTime');

  const limitsEmpty = document.getElementById('limitsEmpty');
  const limitsList = document.getElementById('limitsList');

  const inputReadSpeed = document.getElementById('inputReadSpeed');
  const inputSpeakSpeed = document.getElementById('inputSpeakSpeed');
  const inputCustomLimit = document.getElementById('inputCustomLimit');
  const shortcutHint = document.getElementById('shortcutHint');

  let currentSettings = {};
  let lastAnalyzedText = '';
  let lastStats = null;
  let copyResetTimer = null;

  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'but', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from',
    'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be', 'been', 'am', 'it', 'its',
    'they', 'them', 'their', 'we', 'us', 'our', 'you', 'your', 'i', 'me', 'my', 'he', 'him', 'his',
    'she', 'her', 'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'shall', 'should',
    'can', 'could', 'may', 'might', 'must', 'about', 'as', 'into', 'there', 'their', 'then', 'so',
    'no', 'not', 'only', 'than', 'then', 'more', 'some', 'other'
  ]);

  tabLinks.forEach(link => {
    link.addEventListener('click', () => {
      const tabId = link.getAttribute('data-tab');
      tabLinks.forEach(l => l.classList.remove('active'));
      tabPanels.forEach(p => p.classList.remove('active'));
      link.classList.add('active');
      document.getElementById(`${tabId}Panel`).classList.add('active');

      if (tabId === 'limits') {
        updateLimitsUI();
      }
    });
  });

  function loadApp() {
    chrome.storage.local.get(['wpmRead', 'wpmSpeak', 'customCharLimit'], (data) => {
      currentSettings = data;
      inputReadSpeed.value = data.wpmRead || 200;
      inputSpeakSpeed.value = data.wpmSpeak || 130;
      inputCustomLimit.value = data.customCharLimit || 500;
      updateShortcutHint();
      queryPageSelection();
    });
  }

  function updateShortcutHint() {
    const isMac = navigator.platform.toUpperCase().includes('MAC');
    shortcutHint.textContent = `Count selection: ${isMac ? 'Cmd+Shift+W' : 'Ctrl+Shift+W'}`;
  }

  function getActiveText() {
    return quickPasteArea.value.trim() || selectionContent.textContent.trim();
  }

  function queryPageSelection() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0] || !tabs[0].id) return;

      chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_SELECTION' }, (response) => {
        if (chrome.runtime.lastError) {
          showSelectionPlaceholder('Cannot read selection on this system page.');
          clearMetrics();
          return;
        }

        if (response && response.text && response.text.trim().length > 0) {
          selectionPlaceholder.style.display = 'none';
          selectionContent.textContent = response.text;
          selectionContent.style.display = '-webkit-box';
          selectionDot.classList.add('active');
          processTextMetrics(response.text);
        } else {
          showSelectionPlaceholder();
          if (!quickPasteArea.value.trim()) {
            clearMetrics();
          }
        }
      });
    });
  }

  function showSelectionPlaceholder(msg) {
    selectionPlaceholder.style.display = 'block';
    selectionPlaceholder.textContent = msg || 'Highlight any text on the current page to analyze it here.';
    selectionContent.style.display = 'none';
    selectionDot.classList.remove('active');
  }

  function clearMetrics() {
    lastAnalyzedText = '';
    lastStats = null;
    valWords.textContent = '0';
    valChars.textContent = '0';
    valSentences.textContent = '0';
    valParagraphs.textContent = '0';
    valReadTime.textContent = '0s';
    valSpeakTime.textContent = '0s';
    charCounter.textContent = '0 characters';
    keywordsCard.style.display = 'none';
    copyStatsBtn.disabled = true;
    updateLimitsUI();
  }

  function processTextMetrics(text) {
    if (!text || !text.trim()) {
      clearMetrics();
      return;
    }

    lastAnalyzedText = text;
    lastStats = calculateTextStats(text, {
      wpmRead: currentSettings.wpmRead || 200,
      wpmSpeak: currentSettings.wpmSpeak || 130
    });

    const words = text.trim().split(/\s+/).filter(w => w.length > 0);

    valWords.textContent = lastStats.wordCount.toLocaleString();
    valChars.textContent = lastStats.charCountNoSpace.toLocaleString();
    valSentences.textContent = lastStats.sentenceCount.toLocaleString();
    valParagraphs.textContent = lastStats.paragraphCount.toLocaleString();
    valReadTime.textContent = lastStats.readTime;
    valSpeakTime.textContent = lastStats.speakTime;
    charCounter.textContent = `${lastStats.charCount.toLocaleString()} characters`;

    copyStatsBtn.disabled = lastStats.wordCount === 0;
    extractKeywords(words);
    updateLimitsUI();
  }

  function updateLimitsUI() {
    if (!lastStats || lastStats.wordCount === 0) {
      limitsEmpty.style.display = 'block';
      limitsList.innerHTML = '';
      return;
    }

    limitsEmpty.style.display = 'none';
    const results = getLimitResults(lastStats, {
      customLimit: currentSettings.customCharLimit || 500
    });

    limitsList.innerHTML = '';
    results.forEach(result => {
      const row = document.createElement('div');
      row.className = 'limit-row';

      const noteBadge = result.note
        ? `<span class="limit-note">${result.note}</span>`
        : '';

      row.innerHTML = `
        <div class="limit-row-header">
          <span class="limit-label-wrap">
            <span class="limit-label">${result.label}</span>${noteBadge}
          </span>
          <span class="limit-count">${result.current.toLocaleString()} / ${result.max.toLocaleString()}</span>
        </div>
        <div class="limit-bar-bg">
          <div class="limit-bar-fill status-${result.status}" style="width: ${result.percent}%"></div>
        </div>
        <span class="limit-detail status-${result.status}">${result.detail}</span>
      `;

      limitsList.appendChild(row);
    });
  }

  function extractKeywords(words) {
    if (words.length < 5) {
      keywordsCard.style.display = 'none';
      return;
    }

    const freqMap = {};
    words.forEach(word => {
      const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean.length > 3 && !stopWords.has(clean)) {
        freqMap[clean] = (freqMap[clean] || 0) + 1;
      }
    });

    const sorted = Object.entries(freqMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    if (sorted.length > 0) {
      keywordsCard.style.display = 'block';
      keywordsList.innerHTML = '';
      sorted.forEach(([word, freq]) => {
        const tag = document.createElement('span');
        tag.className = 'keyword-tag';
        tag.textContent = `${word} (${freq})`;
        keywordsList.appendChild(tag);
      });
    } else {
      keywordsCard.style.display = 'none';
    }
  }

  copyStatsBtn.addEventListener('click', async () => {
    if (!lastStats) return;

    try {
      await navigator.clipboard.writeText(formatStatsForClipboard(lastStats));
      copyStatsBtn.textContent = 'Copied!';
      copyStatsBtn.classList.add('copied');

      if (copyResetTimer) clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => {
        copyStatsBtn.textContent = 'Copy Stats';
        copyStatsBtn.classList.remove('copied');
      }, 1500);
    } catch (err) {
      copyStatsBtn.textContent = 'Copy failed';
      if (copyResetTimer) clearTimeout(copyResetTimer);
      copyResetTimer = setTimeout(() => {
        copyStatsBtn.textContent = 'Copy Stats';
      }, 1500);
    }
  });

  quickPasteArea.addEventListener('input', (e) => {
    const text = e.target.value;
    if (text.trim().length > 0) {
      selectionDot.classList.remove('active');
      processTextMetrics(text);
    } else {
      queryPageSelection();
    }
  });

  inputReadSpeed.addEventListener('change', (e) => {
    let speed = parseInt(e.target.value, 10);
    if (isNaN(speed) || speed < 50) speed = 50;
    chrome.storage.local.set({ wpmRead: speed }, () => {
      currentSettings.wpmRead = speed;
      const text = getActiveText();
      if (text) processTextMetrics(text);
    });
  });

  inputSpeakSpeed.addEventListener('change', (e) => {
    let speed = parseInt(e.target.value, 10);
    if (isNaN(speed) || speed < 50) speed = 50;
    chrome.storage.local.set({ wpmSpeak: speed }, () => {
      currentSettings.wpmSpeak = speed;
      const text = getActiveText();
      if (text) processTextMetrics(text);
    });
  });

  inputCustomLimit.addEventListener('change', (e) => {
    let limit = parseInt(e.target.value, 10);
    if (isNaN(limit) || limit < 10) limit = 10;
    chrome.storage.local.set({ customCharLimit: limit }, () => {
      currentSettings.customCharLimit = limit;
      inputCustomLimit.value = limit;
      updateLimitsUI();
    });
  });

  loadApp();
});