import type { PlaylistEntry, PlaylistMonitorEntry, PlaylistRecord } from '../types';
import {
  createPlaylistDraft,
  getPlayableEntryIndices,
  resolvePlayableIndex,
  stepPlayableIndex
} from './domain';

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/g, '');
}

export function formatPlaylistMonitorEntryStatus(entry: PlaylistMonitorEntry): 'ready' | 'missing' {
  return entry.exists && Boolean(entry.relativePath.trim()) ? 'ready' : 'missing';
}

export function createPlaylistEntryDraft(fileName = ''): PlaylistEntry {
  return {
    fileName,
    visibility: true,
    status: 'missing-all',
    message: '',
    perMonitor: {}
  };
}

export function createPlaylistRecordDraft(): PlaylistRecord {
  return createPlaylistDraft();
}

export function getPlaylistEntryCompletion(entry: PlaylistEntry): {
  readyCount: number;
  totalCount: number;
} {
  const items = Object.values(entry.perMonitor);
  return {
    readyCount: items.filter((item) => formatPlaylistMonitorEntryStatus(item) === 'ready').length,
    totalCount: items.length
  };
}

export function getPlaylistVisibilitySummary(entries: PlaylistEntry[]): {
  visibleCount: number;
  playableCount: number;
} {
  return {
    visibleCount: entries.filter((entry) => entry.visibility).length,
    playableCount: getPlayableEntryIndices(entries).length
  };
}

export function normalizePlaylistSourceFolder(path: string): string {
  return normalizePath(path.trim());
}

export function resolvePlaylistAssetPath(sourceFolder: string, relativePath: string): string {
  const normalizedSourceFolder = normalizePlaylistSourceFolder(sourceFolder);
  const normalizedRelativePath = relativePath.replace(/\\/g, '/').replace(/^\/+/g, '');

  if (!normalizedSourceFolder) {
    return normalizedRelativePath;
  }

  if (!normalizedRelativePath) {
    return normalizedSourceFolder;
  }

  return `${normalizedSourceFolder}/${normalizedRelativePath}`;
}

export function resolvePlaylistIndex(entries: PlaylistEntry[], preferred: number): number {
  return resolvePlayableIndex(entries, preferred);
}

export function stepPlaylistPlayback(entries: PlaylistEntry[], current: number, delta: number): number {
  return stepPlayableIndex(entries, current, delta);
}
