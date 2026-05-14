import type {
  ConfigurationRecord,
  MonitorMapping,
  MonitorRecord,
  PlaylistEntry,
  PlaylistRecord
} from '../types';
import { getLocale, t } from '../i18n';
import { mapMonitorStripHeight } from './domain';

export function formatPathLeaf(path: string): string {
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/g, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

export function formatMonitorTitle(monitor: MonitorRecord): string {
  return monitor.friendlyName || monitor.systemName || monitor.deviceId;
}

export function formatMonitorTail(monitor: MonitorRecord): string {
  const parts = [
    `${monitor.size.width}x${monitor.size.height}`,
    `(${monitor.position.x}, ${monitor.position.y})`
  ];

  if (monitor.refreshRate) {
    parts.push(`${monitor.refreshRate}Hz`);
  }

  return parts.join(' · ');
}

export function formatPlaylistEntryMessage(entry: PlaylistEntry): string {
  if (entry.message.trim()) {
    return entry.message;
  }

  switch (entry.status) {
    case 'ready':
      return t('ui.playlistEntry.ready');
    case 'partial-missing':
      return t('ui.playlistEntry.partialMissing');
    default:
      return t('ui.playlistEntry.missingAll');
  }
}

export function formatWorkspaceTitle(args: {
  playlist: PlaylistRecord | null;
  configuration: ConfigurationRecord | null;
}): string {
  const parts = [args.playlist?.name, args.configuration?.name].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : t('shell.workspace.fallbackTitle');
}

export function formatCompactDisplayInfo(monitor: MonitorRecord): string {
  return `${formatMonitorTitle(monitor)} · ${formatMonitorTail(monitor)}`;
}

export function formatConnectedState(monitor: MonitorRecord): string {
  return monitor.connected
    ? t('monitor.connectedNow')
    : t('monitor.seenBefore', { time: formatLastSeenAt(monitor.lastSeenAt) });
}

export function formatLastSeenAt(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return t('common.unknown');
  }

  const numericValue = Number(trimmed);
  const timestamp =
    Number.isFinite(numericValue) && /^\d+$/.test(trimmed) ? numericValue : Date.parse(trimmed);

  if (!Number.isFinite(timestamp)) {
    return trimmed;
  }

  return new Intl.DateTimeFormat(getLocale(), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(timestamp);
}

export function formatAppRootPath(): string {
  return t('ui.appRootPath');
}

export function formatSettingsStorageHint(): string {
  return t('settings.storageHint');
}

export function buildMonitorTransform(
  mapping: MonitorMapping,
  options?: { offsetMultiplier?: number }
): string {
  const offsetMultiplier = options?.offsetMultiplier ?? 1;
  const offsetX = (mapping.offsetX ?? 0) * offsetMultiplier;
  const offsetY = (mapping.offsetY ?? 0) * offsetMultiplier;
  const baseScaleX = mapping.scaleX ?? 1;
  const baseScaleY = mapping.scaleY ?? 1;
  const scaleX = (mapping.mirror === 'horizontal' ? -1 : 1) * baseScaleX;
  const scaleY = (mapping.mirror === 'vertical' ? -1 : 1) * baseScaleY;

  return `translate(${offsetX}px, ${offsetY}px) scale(${scaleX}, ${scaleY})`;
}

export function buildMediaFrameDimensions(args: {
  viewportWidth: number;
  viewportHeight: number;
  mediaWidth: number;
  mediaHeight: number;
}): { width: number; height: number } {
  const { viewportWidth, viewportHeight, mediaWidth, mediaHeight } = args;
  const safeViewportWidth = Math.max(viewportWidth, 1);
  const safeViewportHeight = Math.max(viewportHeight, 1);
  const safeMediaWidth = Math.max(mediaWidth, 1);
  const safeMediaHeight = Math.max(mediaHeight, 1);
  const widthRatio = safeViewportWidth / safeMediaWidth;
  const heightRatio = safeViewportHeight / safeMediaHeight;
  const scale = Math.min(widthRatio, heightRatio);
  return {
    width: safeMediaWidth * scale,
    height: safeMediaHeight * scale
  };
}

export function buildMediaFrameStyle(args: {
  viewportWidth: number;
  viewportHeight: number;
  mediaWidth: number;
  mediaHeight: number;
}): Record<string, string> {
  const dimensions = buildMediaFrameDimensions(args);
  return {
    width: `${dimensions.width}px`,
    height: `${dimensions.height}px`
  };
}

export function buildSharedSliceTrackStyle(args: {
  frameWidth: number;
  total: number;
  index: number;
}): Record<string, string> {
  const frameWidth = Math.max(args.frameWidth, 0);
  const total = Math.max(args.total, 1);
  const index = Math.max(0, Math.min(args.index, total - 1));

  return {
    width: `${frameWidth * total}px`,
    height: '100%',
    transform: `translateX(-${frameWidth * index}px)`,
    transformOrigin: 'center'
  };
}

export function buildSharedSliceSourceRect(args: {
  intrinsicWidth: number;
  intrinsicHeight: number;
  total: number;
  index: number;
  frameWidth: number;
  devicePixelRatio: number;
}): { x: number; y: number; width: number; height: number } {
  const intrinsicWidth = Math.max(args.intrinsicWidth, 1);
  const intrinsicHeight = Math.max(args.intrinsicHeight, 1);
  const total = Math.max(args.total, 1);
  const index = Math.max(0, Math.min(args.index, total - 1));
  const frameWidth = Math.max(args.frameWidth, 1);
  const devicePixelRatio = Math.max(args.devicePixelRatio, 1);
  const sliceWidth = intrinsicWidth / total;
  const safetyTrim = sliceWidth / (frameWidth * devicePixelRatio);
  const trimLeft = index > 0 ? safetyTrim : 0;
  const trimRight = index < total - 1 ? safetyTrim : 0;

  return {
    x: sliceWidth * index + trimLeft,
    y: 0,
    width: Math.max(sliceWidth - trimLeft - trimRight, 1),
    height: intrinsicHeight
  };
}

export function isQuarterTurnRotation(rotation: number): boolean {
  return rotation === 90 || rotation === 270;
}

export {
  DEFAULT_MONITOR_STRIP_HEIGHT_GAMMA,
  MAX_MONITOR_STRIP_HEIGHT_GAMMA,
  MIN_MONITOR_STRIP_HEIGHT_GAMMA,
  MONITOR_STRIP_HEIGHT_GAMMA_STEP,
  MONITOR_STRIP_MINIMUM_MAPPED_HEIGHT,
  MONITOR_STRIP_REFERENCE_HEIGHT,
  mapMonitorStripHeight,
  normalizeMonitorStripHeightGamma
} from './domain';
