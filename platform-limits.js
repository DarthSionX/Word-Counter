const PLATFORM_LIMITS = [
  { id: 'sms', label: 'SMS', max: 160 },
  { id: 'meta', label: 'Meta description', max: 160 },
  { id: 'twitter', label: 'X / Twitter', max: 280, note: 'Free tier' },
  { id: 'threads', label: 'Threads', max: 500 },
  { id: 'pinterest', label: 'Pinterest', max: 500 },
  { id: 'instagram', label: 'Instagram caption', max: 2200 },
  { id: 'tiktok', label: 'TikTok caption', max: 2200 },
  { id: 'linkedin', label: 'LinkedIn post', max: 3000 },
  { id: 'facebook', label: 'Facebook post', max: 5000 }
];

function getLimitStatus(percent) {
  if (percent > 100) return 'over';
  if (percent >= 85) return 'warn';
  return 'ok';
}

function getLimitResults(stats, { customLimit = 500 } = {}) {
  if (!stats || stats.charCount === undefined) return [];

  const current = stats.charCount;
  const platforms = [
    ...PLATFORM_LIMITS,
    { id: 'custom', label: 'Custom limit', max: customLimit }
  ];

  return platforms.map(platform => {
    const max = Math.max(1, platform.max);
    const percent = Math.round((current / max) * 100);
    const remaining = max - current;

    return {
      id: platform.id,
      label: platform.label,
      note: platform.note || null,
      current,
      max,
      percent: Math.min(percent, 100),
      displayPercent: percent,
      remaining,
      status: getLimitStatus(percent),
      detail: remaining >= 0
        ? `${remaining.toLocaleString()} remaining`
        : `${Math.abs(remaining).toLocaleString()} over`
    };
  });
}