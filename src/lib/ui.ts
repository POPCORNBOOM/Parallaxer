import type { ConfigurationRecord, MonitorMapping, MonitorRecord, PlaylistEntry, PlaylistRecord } from '../types';

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
      return 'Ready';
    case 'partial-missing':
      return 'Missing assets on some monitors';
    default:
      return 'Missing assets on all monitors';
  }
}

export function formatWorkspaceTitle(args: {
  playlist: PlaylistRecord | null;
  configuration: ConfigurationRecord | null;
}): string {
  const parts = [args.playlist?.name, args.configuration?.name].filter(Boolean);
  return parts.length > 0 ? parts.join(' / ') : 'Parallaxer';
}

export function formatCompactDisplayInfo(monitor: MonitorRecord): string {
  return `${formatMonitorTitle(monitor)} · ${formatMonitorTail(monitor)}`;
}

export function formatConnectedState(monitor: MonitorRecord): string {
  return monitor.connected ? 'Connected now' : `Seen before · ${monitor.lastSeenAt}`;
}

export function formatAppRootPath(): string {
  return '~/.parallaxer';
}

export function formatSettingsStorageHint(): string {
  return 'Settings and monitor labels are stored in ~/.parallaxer, while each playlist persists beside its source folder as playlist.json.';
}

export function buildMonitorTransform(
  mapping: MonitorMapping,
  options?: { offsetMultiplier?: number }
): string {
  const offsetMultiplier = options?.offsetMultiplier ?? 1;
  const scale = mapping.scale ?? 1;
  const offsetX = (mapping.offsetX ?? 0) * offsetMultiplier;
  const offsetY = (mapping.offsetY ?? 0) * offsetMultiplier;
  const scaleX =
    (mapping.mirror === 'horizontal' || mapping.mirror === 'both' ? -1 : 1) * scale;
  const scaleY =
    (mapping.mirror === 'vertical' || mapping.mirror === 'both' ? -1 : 1) * scale;

  return `translate(${offsetX}px, ${offsetY}px) scale(${scaleX}, ${scaleY})`;
}

export function isQuarterTurnRotation(rotation: number): boolean {
  return rotation === 90 || rotation === 270;
}
