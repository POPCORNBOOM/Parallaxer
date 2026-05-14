import type {
  AppSettings,
  ConfigurationMonitor,
  ConfigurationRecord,
  MonitorRecord,
  MonitorMapping,
  PlaylistEntry,
  PlaylistRecord,
  PresentationDisplayPayload,
  PresentationPayload
} from '../types';

export const CONFIGURATION_PREVIEW_RELATIVE_PATH = '__configuration_preview__';
export const PLAYLIST_SIDEBAR_CACHE_KEY = 'playlistSidebar';

export interface PlaylistSidebarCacheEntry {
  favorite?: boolean;
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/g, '');
}

export function normalizePlaylistFolder(value: string): string {
  return normalizePath(value.trim());
}

function joinPath(base: string, relativePath: string): string {
  const normalizedBase = normalizePath(base.trim());
  const normalizedRelative = relativePath.replace(/\\/g, '/').replace(/^\/+/g, '');

  if (!normalizedBase) {
    return normalizedRelative;
  }

  if (!normalizedRelative) {
    return normalizedBase;
  }

  return `${normalizedBase}/${normalizedRelative}`;
}

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeShortName(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeWindowLabelSegment(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

function createStableFolderHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

export function createPlaylistKey(sourceFolder: string): string {
  return normalizePlaylistFolder(sourceFolder);
}

function getPathLeaf(path: string): string {
  const normalized = normalizePath(path);
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) ?? '';
}

function isPlayableEntry(entry: PlaylistEntry): boolean {
  return entry.visibility && entry.status === 'ready';
}

function resolvePresentationSlice(
  relativePath: string,
  perMonitorEntry: PlaylistEntry['perMonitor'][string] | undefined,
  order: number,
  total: number
): PresentationDisplayPayload['slice'] | undefined {
  if (!perMonitorEntry?.sharedSlice || !relativePath.trim() || total <= 1) {
    return undefined;
  }

  return {
    axis: 'horizontal',
    index: order,
    total
  };
}

export function createEmptySettings(): AppSettings {
  return {
    monitorOverrides: {},
    monitorHistory: [],
    recentPlaylistFolders: [],
    cache: {}
  };
}

function normalizeMonitorRecord(monitor: MonitorRecord): MonitorRecord {
  return {
    ...monitor,
    friendlyName: monitor.friendlyName.trim(),
    systemName: monitor.systemName.trim(),
    manufacturer: monitor.manufacturer?.trim() || undefined,
    productCode: monitor.productCode?.trim() || undefined,
    serialNumber: monitor.serialNumber?.trim() || undefined,
    edid: monitor.edid?.trim() || undefined
  };
}

export function mergeMonitorHistory(args: {
  currentMonitors: MonitorRecord[];
  historyMonitors: MonitorRecord[];
  monitorOverrides: AppSettings['monitorOverrides'];
}): MonitorRecord[] {
  const historyByDeviceId = new Map(
    args.historyMonitors
      .filter((monitor) => monitor.deviceId.trim())
      .map((monitor) => [monitor.deviceId, normalizeMonitorRecord(monitor)])
  );

  for (const currentMonitor of args.currentMonitors) {
    const normalizedMonitor = normalizeMonitorRecord(currentMonitor);
    const historyMonitor = historyByDeviceId.get(normalizedMonitor.deviceId);
    const friendlyName =
      args.monitorOverrides[normalizedMonitor.deviceId]?.friendlyName ||
      normalizedMonitor.friendlyName ||
      historyMonitor?.friendlyName ||
      normalizedMonitor.systemName;

    historyByDeviceId.set(normalizedMonitor.deviceId, {
      ...(historyMonitor ?? normalizedMonitor),
      ...normalizedMonitor,
      friendlyName,
      connected: true,
      lastSeenAt: normalizedMonitor.lastSeenAt || historyMonitor?.lastSeenAt || ''
    });
  }

  return [...historyByDeviceId.values()].map((monitor) => ({
    ...monitor,
    friendlyName:
      args.monitorOverrides[monitor.deviceId]?.friendlyName || monitor.friendlyName || monitor.systemName,
    connected: args.currentMonitors.some((current) => current.deviceId === monitor.deviceId)
  }));
}

export function createDefaultMonitorMapping(): MonitorMapping {
  return {
    rotation: 0,
    mirror: 'none',
    fit: 'contain',
    scale: 1,
    offsetX: 0,
    offsetY: 0
  };
}

export function createConfigurationDraft(): ConfigurationRecord {
  return {
    id: createId('configuration'),
    name: '',
    description: '',
    favorite: false,
    monitors: []
  };
}

export function duplicateConfigurationRecord(
  configuration: ConfigurationRecord,
  options?: { nameSuffix?: string }
): ConfigurationRecord {
  const suffix = options?.nameSuffix ?? ' Copy';
  return {
    ...configuration,
    id: createId('configuration'),
    name: `${configuration.name || 'Configuration'}${suffix}`,
    monitors: configuration.monitors.map((monitor) => ({
      ...monitor,
      mapping: {
        ...monitor.mapping
      }
    }))
  };
}

export function createPlaylistDraft(): PlaylistRecord {
  return {
    id: createId('playlist'),
    name: '',
    sourceFolder: '',
    configurationId: '',
    mappingMode: 'same-name-separated-by-shortname',
    entries: [],
    playlistFilePath: ''
  };
}

export function createCachedPlaylistRecord(sourceFolder: string): PlaylistRecord {
  const normalizedFolder = normalizePlaylistFolder(sourceFolder);
  const leaf = getPathLeaf(normalizedFolder);
  return {
    id: createPlaylistKey(normalizedFolder) || `playlist-cache-${createStableFolderHash(normalizedFolder.toLowerCase())}`,
    name: leaf || 'Untitled playlist',
    sourceFolder: normalizedFolder,
    configurationId: '',
    mappingMode: 'same-name-separated-by-shortname',
    entries: [],
    playlistFilePath: normalizedFolder ? `${normalizedFolder}/playlist.json` : ''
  };
}

export function findPlaylistBySourceFolder(
  playlists: PlaylistRecord[],
  sourceFolder: string
): PlaylistRecord | null {
  const normalizedFolder = createPlaylistKey(sourceFolder);
  return (
    playlists.find((playlist) => createPlaylistKey(playlist.sourceFolder) === normalizedFolder) ?? null
  );
}

export function upsertPlaylistRecord(
  playlists: PlaylistRecord[],
  playlist: PlaylistRecord
): PlaylistRecord[] {
  const normalizedFolder = createPlaylistKey(playlist.sourceFolder);
  return [
    playlist,
    ...playlists.filter(
      (item) =>
        item.id !== playlist.id &&
        createPlaylistKey(item.sourceFolder) !== normalizedFolder
    )
  ];
}

export function sortConfigurationMonitors(monitors: ConfigurationMonitor[]): ConfigurationMonitor[] {
  return [...monitors].sort((left, right) => {
    if (left.order !== right.order) {
      return left.order - right.order;
    }

    return left.shortName.localeCompare(right.shortName);
  });
}

export function validateConfiguration(config: ConfigurationRecord): string[] {
  const errors: string[] = [];
  const orders = new Set<number>();
  const deviceIds = new Set<string>();

  if (!config.name.trim()) {
    errors.push('Configuration name is required');
  }

  if (config.monitors.length === 0) {
    errors.push('At least one monitor is required');
  }

  for (const monitor of config.monitors) {
    if (!monitor.deviceId.trim()) {
      errors.push('deviceId is required');
    }

    if (monitor.deviceId.trim()) {
      if (deviceIds.has(monitor.deviceId)) {
        errors.push('deviceId must be unique');
      } else {
        deviceIds.add(monitor.deviceId);
      }
    }

    if (!monitor.shortName.trim()) {
      errors.push('shortName is required');
    }

    if (orders.has(monitor.order)) {
      errors.push('order must be unique');
    } else {
      orders.add(monitor.order);
    }
  }

  return errors;
}

export function validatePlaylist(
  playlist: PlaylistRecord,
  configuration: ConfigurationRecord | null,
  connectedMonitorIds: Set<string>
): string[] {
  const errors: string[] = [];

  if (!playlist.name.trim()) {
    errors.push('Playlist name is required');
  }

  if (!playlist.sourceFolder.trim()) {
    errors.push('Playlist sourceFolder is required');
  }

  if (!playlist.configurationId.trim()) {
    errors.push('Playlist configurationId is required');
  }

  if (!configuration) {
    errors.push('Playlist configuration was not found');
    return errors;
  }

  if (playlist.configurationId !== configuration.id) {
    errors.push('Playlist configurationId does not match the selected configuration');
  }

  if (configuration.monitors.length === 0) {
    errors.push('Playlist configuration must include at least one monitor');
  }

  for (const monitor of configuration.monitors) {
    if (!connectedMonitorIds.has(monitor.deviceId)) {
      errors.push(`Configuration monitor ${monitor.shortName} is not connected`);
    }
  }

  for (const entry of playlist.entries) {
    for (const monitor of configuration.monitors) {
      const perMonitor = entry.perMonitor[monitor.deviceId];
      if (!perMonitor) {
        errors.push(`Entry ${entry.fileName} is missing monitor ${monitor.shortName}`);
        continue;
      }

      if (entry.status === 'ready' && (!perMonitor.exists || !perMonitor.relativePath.trim())) {
        errors.push(`Entry ${entry.fileName} is not ready for monitor ${monitor.shortName}`);
      }
    }
  }

  if (!playlist.entries.some((entry) => isPlayableEntry(entry))) {
    errors.push('Playlist must include at least one visible ready entry');
  }

  return errors;
}

export function createConfigurationMonitor(deviceId: string, order: number): ConfigurationMonitor {
  return {
    deviceId,
    shortName: `display-${order + 1}`,
    order,
    mapping: createDefaultMonitorMapping()
  };
}

export function normalizeConfigurationMonitorShortName(
  value: string,
  fallback = 'display'
): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

export function renumberConfigurationMonitors(
  monitors: ConfigurationMonitor[]
): ConfigurationMonitor[] {
  return sortConfigurationMonitors(monitors).map((monitor, index) => ({
    ...monitor,
    order: index
  }));
}

export function upsertRecentPlaylistFolder(
  recentFolders: string[],
  folder: string,
  limit = 8
): string[] {
  const normalizedFolder = normalizePath(folder.trim());
  if (!normalizedFolder) {
    return recentFolders;
  }

  return [normalizedFolder, ...recentFolders.filter((item) => normalizePath(item) !== normalizedFolder)].slice(
    0,
    limit
  );
}

export function removeRecentPlaylistFolder(recentFolders: string[], folder: string): string[] {
  const normalizedFolder = normalizePath(folder.trim());
  return recentFolders.filter((item) => normalizePath(item) !== normalizedFolder);
}

export function getPlaylistSidebarCache(settings: AppSettings): Record<string, PlaylistSidebarCacheEntry> {
  const rawValue = settings.cache[PLAYLIST_SIDEBAR_CACHE_KEY];
  if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawValue as Record<string, unknown>).flatMap(([folder, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return [];
      }

      const favorite = (value as { favorite?: unknown }).favorite;
      return [[normalizePath(folder), { favorite: favorite === true } satisfies PlaylistSidebarCacheEntry]];
    })
  );
}

export function setPlaylistSidebarCache(
  settings: AppSettings,
  cache: Record<string, PlaylistSidebarCacheEntry>
): void {
  settings.cache[PLAYLIST_SIDEBAR_CACHE_KEY] = cache;
}

export function getPlayableEntryIndices(entries: PlaylistEntry[]): number[] {
  return entries.flatMap((entry, index) => (isPlayableEntry(entry) ? [index] : []));
}

export function resolvePlayableIndex(entries: PlaylistEntry[], preferred: number): number {
  const playableIndices = getPlayableEntryIndices(entries);
  if (playableIndices.length === 0) {
    return preferred;
  }

  return playableIndices.includes(preferred) ? preferred : playableIndices[0];
}

export function stepPlayableIndex(entries: PlaylistEntry[], current: number, delta: number): number {
  const playableIndices = getPlayableEntryIndices(entries);
  if (playableIndices.length === 0) {
    return current;
  }

  const currentPlayableIndex = playableIndices.indexOf(current);
  const baseIndex = currentPlayableIndex >= 0 ? currentPlayableIndex : 0;
  const nextIndex = (baseIndex + delta) % playableIndices.length;
  return playableIndices[nextIndex < 0 ? nextIndex + playableIndices.length : nextIndex];
}

export function buildPresentationPayload(args: {
  playlist: PlaylistRecord;
  configuration: ConfigurationRecord;
  index: number;
  selectedMonitorDeviceId?: string | null;
  monitorFramesByDeviceId?: Record<string, { width: number; height: number; scaleFactor?: number }>;
}): PresentationPayload {
  const { playlist, configuration, index, selectedMonitorDeviceId, monitorFramesByDeviceId } = args;
  const resolvedIndex = resolvePlayableIndex(playlist.entries, index);
  const entry = playlist.entries[resolvedIndex] ?? {
    fileName: '',
    visibility: false,
    status: 'missing-all' as const,
    message: '',
    perMonitor: {}
  };

  const displays: PresentationDisplayPayload[] = sortConfigurationMonitors(configuration.monitors).map(
    (monitor) => {
      const perMonitor = entry.perMonitor[monitor.deviceId];
      const relativePath = perMonitor?.relativePath ?? '';
      const safeLabelSegment = normalizeWindowLabelSegment(monitor.shortName, `display-${monitor.order + 1}`);

      return {
        shortName: monitor.shortName,
        windowLabel: `presentation-${safeLabelSegment}-${monitor.order + 1}`,
        deviceId: monitor.deviceId,
        assetPath: relativePath ? joinPath(playlist.sourceFolder, relativePath) : '',
        relativePath,
        slice: resolvePresentationSlice(
          relativePath,
          perMonitor,
          monitor.order,
          configuration.monitors.length
        ),
        frame: monitorFramesByDeviceId?.[monitor.deviceId],
        mapping: monitor.mapping,
        selected: monitor.deviceId === selectedMonitorDeviceId
      };
    }
  );

  return {
    active: true,
    playlistId: playlist.id,
    configurationId: configuration.id,
    index: resolvedIndex,
    total: getPlayableEntryIndices(playlist.entries).length,
    fileName: entry.fileName,
    displays
  };
}

export function buildConfigurationPreviewPayload(
  configuration: ConfigurationRecord,
  selectedMonitorDeviceId?: string | null,
  monitorFramesByDeviceId?: Record<string, { width: number; height: number; scaleFactor?: number }>
): PresentationPayload {
  const displays: PresentationDisplayPayload[] = sortConfigurationMonitors(configuration.monitors).map((monitor) => {
    const safeLabelSegment = normalizeWindowLabelSegment(monitor.shortName, `display-${monitor.order + 1}`);

    return {
      shortName: monitor.shortName,
      windowLabel: `presentation-preview-${safeLabelSegment}-${monitor.order + 1}`,
      deviceId: monitor.deviceId,
      assetPath: '',
      relativePath: CONFIGURATION_PREVIEW_RELATIVE_PATH,
      frame: monitorFramesByDeviceId?.[monitor.deviceId],
      mapping: monitor.mapping,
      selected: monitor.deviceId === selectedMonitorDeviceId
    };
  });

  return {
    active: true,
    playlistId: '',
    configurationId: configuration.id,
    index: 0,
    total: 1,
    fileName: 'Configuration Preview',
    displays
  };
}

export function isConfigurationPreviewPayload(payload: PresentationPayload | null | undefined): boolean {
  return Boolean(
    payload &&
      payload.displays.length > 0 &&
      payload.displays.every((display) => display.relativePath === CONFIGURATION_PREVIEW_RELATIVE_PATH)
  );
}
