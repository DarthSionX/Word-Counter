// Shared text statistics utilities for popup, background, and content scripts

function countParagraphs(text) {
  if (!text || !text.trim()) return 0;
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const paragraphs = normalized
    .split(/\n[ \t]*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  return paragraphs.length;
}

function formatDuration(seconds) {
  return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`;
}

function calculateTextStats(text, { wpmRead = 200, wpmSpeak = 130 } = {}) {
  const charCount = text.length;
  const charCountNoSpace = text.replace(/\s/g, '').length;

  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const wordCount = words.length;

  const sentenceCount = text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  const paragraphCount = countParagraphs(text);

  const readTimeSec = Math.round((wordCount / wpmRead) * 60);
  const speakTimeSec = Math.round((wordCount / wpmSpeak) * 60);

  return {
    wordCount,
    charCount,
    charCountNoSpace,
    sentenceCount,
    paragraphCount,
    readTime: formatDuration(readTimeSec),
    speakTime: formatDuration(speakTimeSec)
  };
}

function formatStatsForClipboard(stats) {
  return [
    `Words: ${stats.wordCount.toLocaleString()}`,
    `Chars: ${stats.charCount.toLocaleString()} (no space: ${stats.charCountNoSpace.toLocaleString()})`,
    `Sentences: ${stats.sentenceCount.toLocaleString()}`,
    `Paragraphs: ${stats.paragraphCount.toLocaleString()}`,
    `Reading: ${stats.readTime}`,
    `Speaking: ${stats.speakTime}`
  ].join(' | ');
}