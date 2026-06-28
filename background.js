importScripts('text-stats.js');

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['wpmRead', 'wpmSpeak', 'customCharLimit'], (result) => {
    const defaults = {
      wpmRead: 200,
      wpmSpeak: 130,
      customCharLimit: 500
    };

    const updates = {};
    for (const key in defaults) {
      if (result[key] === undefined) {
        updates[key] = defaults[key];
      }
    }

    if (Object.keys(updates).length > 0) {
      chrome.storage.local.set(updates);
    }
  });

  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'count-words-selection',
      title: 'Count Selected Words',
      contexts: ['selection']
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== 'count-words-selection') return;

  if (tab && tab.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_CONTEXT_MENU_COUNT' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        const text = info.selectionText;
        if (!text || text.trim() === '') return;

        chrome.storage.local.get(['wpmRead', 'wpmSpeak'], (settings) => {
          const stats = calculateTextStats(text, {
            wpmRead: settings.wpmRead || 200,
            wpmSpeak: settings.wpmSpeak || 130
          });
          showNativeNotification(stats);
        });
      }
    });
  }
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'count-selection') return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'TRIGGER_CONTEXT_MENU_COUNT' });
    }
  });
});

function showNativeNotification(stats) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: 'Selection Metrics',
    message: `Words: ${stats.wordCount.toLocaleString()} | Chars: ${stats.charCount.toLocaleString()} | No space: ${stats.charCountNoSpace.toLocaleString()}\nReading: ${stats.readTime} | Speaking: ${stats.speakTime}\nSentences: ${stats.sentenceCount} | Paragraphs: ${stats.paragraphCount}`,
    priority: 2
  });
}