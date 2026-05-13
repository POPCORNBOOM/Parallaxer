import type { ConfigurationRecord, MonitorRecord, PlaylistRecord } from '../types';
import { formatMonitorTitle } from './ui';

export const SIDEBAR_MIN_WIDTH = 196;
export const SIDEBAR_MAX_WIDTH = 420;
export const SIDEBAR_COLLAPSE_THRESHOLD = 180;
export const SIDEBAR_COLLAPSED_WIDTH = 0;

export type WorkbenchPage = 'monitor' | 'configuration' | 'playlist' | 'settings';

export interface SidebarAction {
  key?: string;
  hoverTip?: string;
  icon: string;
}

export interface SidebarButton {
  icon?: string;
  title: string;
  hoverTip: string;
  key: string;
}

export interface SidebarList {
  title: string;
  placeholder: string;
  key: string;
  actions: SidebarAction[];
}

export interface SidebarItem {
  key: string;
  selected: boolean;
  head?: SidebarAction;
  hoverHead?: SidebarAction;
  title: string;
  tail: string | SidebarAction;
  hoverTail: string | SidebarAction[];
}

export interface SidebarModel {
  headButtons: SidebarButton[];
  bodyLists: SidebarList[];
  tailButtons: SidebarButton[];
  listItems: Record<string, SidebarItem[]>;
}

export function createSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

export function getSidebarCollapseState(width: number): boolean {
  return width < SIDEBAR_COLLAPSE_THRESHOLD;
}

export function buildSidebarModel(args: {
  monitors: MonitorRecord[];
  configurations: ConfigurationRecord[];
  playlists: PlaylistRecord[];
  currentPage: WorkbenchPage;
  selectedMonitorId: string | null;
  selectedConfigurationId: string | null;
  selectedPlaylistId: string | null;
}): SidebarModel {
  const {
    monitors,
    configurations,
    playlists,
    currentPage,
    selectedMonitorId,
    selectedConfigurationId,
    selectedPlaylistId
  } = args;

  return {
    headButtons: [
      {
        key: 'new-config',
        title: 'New Config',
        hoverTip: 'Create a configuration',
        icon: 'mdi-plus-box-multiple-outline'
      },
      {
        key: 'new-playlist',
        title: 'New Playlist',
        hoverTip: 'Create a playlist',
        icon: 'mdi-playlist-plus'
      }
    ],
    bodyLists: [
      {
        key: 'monitors',
        title: 'Monitors',
        placeholder: 'No monitors found',
        actions: [{ key: 'refresh', hoverTip: 'Refresh monitors', icon: 'mdi-refresh' }]
      },
      {
        key: 'configurations',
        title: 'Configurations',
        placeholder: 'No configurations yet',
        actions: [
          { key: 'refresh', hoverTip: 'Reload configurations', icon: 'mdi-refresh' },
          { key: 'new', hoverTip: 'Create configuration', icon: 'mdi-plus' }
        ]
      },
      {
        key: 'playlists',
        title: 'Playlists',
        placeholder: 'No playlists yet',
        actions: [
          { key: 'refresh', hoverTip: 'Reload playlists', icon: 'mdi-refresh' },
          { key: 'open', hoverTip: 'Open playlist folder', icon: 'mdi-folder-open-outline' }
        ]
      }
    ],
    tailButtons: [
      {
        key: 'settings',
        title: 'Settings',
        hoverTip: 'Open settings',
        icon: 'mdi-cog-outline'
      }
    ],
    listItems: {
      monitors: monitors.map((monitor) => ({
        key: monitor.deviceId,
        selected: currentPage === 'monitor' && selectedMonitorId === monitor.deviceId,
        head: {
          icon: monitor.connected ? 'mdi-circle' : 'mdi-history',
          hoverTip: monitor.connected ? 'Connected' : 'Seen before'
        },
        title: formatMonitorTitle(monitor),
        tail: monitor.connected ? 'live' : 'history',
        hoverTail: `${monitor.size.width}x${monitor.size.height}`
      })),
      configurations: configurations.map((configuration) => ({
        key: configuration.id,
        selected: currentPage === 'configuration' && selectedConfigurationId === configuration.id,
        head: {
          icon: 'mdi-view-quilt-outline',
          hoverTip: 'Configuration'
        },
        title: configuration.name || 'Untitled configuration',
        tail: `${configuration.monitors.length} mon`,
        hoverTail: [
          {
            key: 'delete',
            hoverTip: 'Delete configuration',
            icon: 'mdi-delete-outline'
          }
        ]
      })),
      playlists: playlists.map((playlist) => ({
        key: playlist.id,
        selected: currentPage === 'playlist' && selectedPlaylistId === playlist.id,
        head: {
          icon: 'mdi-playlist-star',
          hoverTip: 'Playlist'
        },
        title: playlist.name || 'Untitled playlist',
        tail: `${playlist.entries.length}`,
        hoverTail: [
          {
            key: 'scan',
            hoverTip: 'Rescan folder',
            icon: 'mdi-refresh'
          }
        ]
      }))
    }
  };
}

export function resolveSidebarSelection(
  listKey: string,
  itemKey: string
): { page: WorkbenchPage; id: string | null } {
  switch (listKey) {
    case 'monitors':
      return { page: 'monitor', id: itemKey };
    case 'configurations':
      return { page: 'configuration', id: itemKey };
    case 'playlists':
      return { page: 'playlist', id: itemKey };
    default:
      return { page: 'settings', id: null };
  }
}
