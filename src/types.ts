export type Rotation = 0 | 90 | 180 | 270;
export type MirrorMode = 'none' | 'horizontal' | 'vertical' | 'both';
export type MappingMode = 'same-folder-shared-files' | 'same-name-separated-by-shortname';
export type MediaFit = 'contain' | 'cover' | 'fill' | 'none';

export interface MonitorRecord {
  deviceId: string;
  systemName: string;
  friendlyName: string;
  connected: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  scaleFactor?: number;
  refreshRate?: number;
  manufacturer?: string;
  productCode?: string;
  serialNumber?: string;
  edid?: string;
  lastSeenAt: string;
}

export interface MonitorMapping {
  rotation: Rotation;
  mirror: MirrorMode;
  fit?: MediaFit;
  scale?: number;
  offsetX?: number;
  offsetY?: number;
}

export interface ConfigurationMonitor {
  deviceId: string;
  shortName: string;
  order: number;
  mapping: MonitorMapping;
}

export interface ConfigurationRecord {
  id: string;
  name: string;
  description: string;
  favorite?: boolean;
  monitors: ConfigurationMonitor[];
}

export interface PlaylistMonitorEntry {
  exists: boolean;
  relativePath: string;
  info?: string;
  sharedSlice?: boolean;
}

export interface PresentationSlice {
  axis: 'horizontal';
  index: number;
  total: number;
}

export interface PlaylistEntry {
  fileName: string;
  visibility: boolean;
  status: 'ready' | 'partial-missing' | 'missing-all';
  message: string;
  perMonitor: Record<string, PlaylistMonitorEntry>;
}

export interface PlaylistRecord {
  id: string;
  name: string;
  sourceFolder: string;
  configurationId: string;
  mappingMode: MappingMode;
  entries: PlaylistEntry[];
  playlistFilePath: string;
}

export interface AppSettings {
  monitorOverrides: Record<string, { friendlyName: string }>;
  monitorHistory: MonitorRecord[];
  recentPlaylistFolders: string[];
  cache: Record<string, unknown>;
  lastSelectedPage?: string;
  lastSelectedEntityId?: string;
}

export interface PresentationDisplayPayload {
  shortName: string;
  windowLabel: string;
  deviceId: string;
  assetPath: string;
  relativePath: string;
  slice?: PresentationSlice;
  frame?: { width: number; height: number; scaleFactor?: number };
  mapping: MonitorMapping;
  selected?: boolean;
}

export interface PresentationPayload {
  active: boolean;
  playlistId: string;
  configurationId: string;
  index: number;
  total: number;
  fileName: string;
  displays: PresentationDisplayPayload[];
}
