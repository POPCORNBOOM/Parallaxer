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
  color?: string;
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

  const sortedConfigurations = [...configurations].sort(
    (left, right) =>
      Number(Boolean(right.favorite)) - Number(Boolean(left.favorite)) ||
      (left.name || '').localeCompare(right.name || '') ||
      left.id.localeCompare(right.id)
  );

  const sortedPlaylists = [...playlists].sort(
    (left, right) =>
      Number(Boolean((right as { favorite?: boolean }).favorite)) -
        Number(Boolean((left as { favorite?: boolean }).favorite)) ||
      (left.name || '').localeCompare(right.name || '') ||
      left.id.localeCompare(right.id)
  );

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
        title: formatMonitorTitle(monitor),
        tail: monitor.connected ? 'live' : 'history',
        hoverTail: monitor.connected
          ? `${monitor.size.width}x${monitor.size.height}`
          : [
              {
                key: 'forget',
                hoverTip: 'Forget monitor',
                icon: 'mdi-close',
                color: 'var(--color-danger-text)'
              }
            ]
      })),
      configurations: sortedConfigurations.map((configuration) => ({
        key: configuration.id,
        selected: currentPage === 'configuration' && selectedConfigurationId === configuration.id,
        head: configuration.favorite
          ? {
              key: 'favorite',
              icon: 'mdi-star',
              hoverTip: 'Unfavorite configuration',
              color: 'var(--color-warning-text, #f4cf64)'
            }
          : undefined,
        hoverHead: !configuration.favorite
          ? {
              key: 'favorite',
              icon: 'mdi-star-outline',
              hoverTip: 'Favorite configuration',
              color: 'var(--color-text-tertiary)'
            }
          : {
              key: 'favorite',
              icon: 'mdi-star',
              hoverTip: 'Unfavorite configuration',
              color: 'var(--color-warning-text, #f4cf64)'
            },
        title: configuration.name || 'Untitled configuration',
        tail: `${configuration.monitors.length} monitors`,
        hoverTail: [
          {
            key: 'duplicate',
            hoverTip: 'Duplicate configuration',
            icon: 'mdi-content-copy'
          },
          {
            key: 'delete',
            hoverTip: 'Delete configuration',
            icon: 'mdi-delete-outline',
            color: 'var(--color-danger-text)'
          }
        ]
      })),
      playlists: sortedPlaylists.map((playlist) => ({
        key: playlist.id,
        selected: currentPage === 'playlist' && selectedPlaylistId === playlist.id,
        head: (playlist as PlaylistRecord & { favorite?: boolean }).favorite
          ? {
              key: 'favorite',
              icon: 'mdi-star',
              hoverTip: 'Unfavorite playlist',
              color: 'var(--color-warning-text, #f4cf64)'
            }
          : undefined,
        hoverHead: !(playlist as PlaylistRecord & { favorite?: boolean }).favorite
          ? {
              key: 'favorite',
              icon: 'mdi-star-outline',
              hoverTip: 'Favorite playlist',
              color: 'var(--color-text-tertiary)'
            }
          : {
              key: 'favorite',
              icon: 'mdi-star',
              hoverTip: 'Unfavorite playlist',
              color: 'var(--color-warning-text, #f4cf64)'
            },
        title: playlist.name || 'Untitled playlist',
        tail: `${playlist.entries.length} items`,
        hoverTail: [
          {
            key: 'scan',
            hoverTip: 'Rescan folder',
            icon: 'mdi-refresh'
          },
          {
            key: 'remove',
            hoverTip: 'Remove from sidebar',
            icon: 'mdi-close',
            color: 'var(--color-danger-text)'
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
