import type { ConfigurationRecord, MonitorRecord, PlaylistRecord } from '../types';
import { t } from '../i18n';
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
        title: t('titlebar.newConfig'),
        hoverTip: t('shell.action.createConfiguration'),
        icon: 'mdi-plus-box-multiple-outline'
      },
      {
        key: 'new-playlist',
        title: t('titlebar.newPlaylist'),
        hoverTip: t('shell.action.createPlaylist'),
        icon: 'mdi-playlist-plus'
      }
    ],
    bodyLists: [
      {
        key: 'monitors',
        title: t('shell.page.monitors'),
        placeholder: t('shell.sidebar.noMonitorsFound'),
        actions: [{ key: 'refresh', hoverTip: t('shell.action.refreshMonitors'), icon: 'mdi-refresh' }]
      },
      {
        key: 'configurations',
        title: t('shell.page.configurations'),
        placeholder: t('shell.sidebar.noConfigurationsYet'),
        actions: [
          { key: 'refresh', hoverTip: t('shell.action.reloadConfigurations'), icon: 'mdi-refresh' },
          { key: 'new', hoverTip: t('shell.action.createConfigurationShort'), icon: 'mdi-plus' }
        ]
      },
      {
        key: 'playlists',
        title: t('shell.page.playlists'),
        placeholder: t('shell.sidebar.noPlaylistsYet'),
        actions: [
          { key: 'refresh', hoverTip: t('shell.action.reloadPlaylists'), icon: 'mdi-refresh' },
          { key: 'open', hoverTip: t('shell.action.openPlaylistFolder'), icon: 'mdi-folder-open-outline' }
        ]
      }
    ],
    tailButtons: [
      {
        key: 'settings',
        title: t('shell.page.settings'),
        hoverTip: t('shell.action.openSettings'),
        icon: 'mdi-cog-outline'
      }
    ],
    listItems: {
      monitors: monitors.map((monitor) => ({
        key: monitor.deviceId,
        selected: currentPage === 'monitor' && selectedMonitorId === monitor.deviceId,
        title: formatMonitorTitle(monitor),
        tail: monitor.connected ? t('shell.sidebar.live') : t('shell.sidebar.history'),
        hoverTail: monitor.connected
          ? `${monitor.size.width}x${monitor.size.height}`
          : [
              {
                key: 'forget',
                hoverTip: t('shell.action.forgetMonitor'),
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
              hoverTip: t('shell.action.unfavoriteConfiguration'),
              color: 'var(--color-warning-text, #f4cf64)'
            }
          : undefined,
        hoverHead: !configuration.favorite
          ? {
              key: 'favorite',
              icon: 'mdi-star-outline',
              hoverTip: t('shell.action.favoriteConfiguration'),
              color: 'var(--color-text-tertiary)'
            }
          : {
              key: 'favorite',
              icon: 'mdi-star',
              hoverTip: t('shell.action.unfavoriteConfiguration'),
              color: 'var(--color-warning-text, #f4cf64)'
            },
        title: configuration.name || t('common.untitledConfiguration'),
        tail: t('shell.sidebar.monitorCount', { count: configuration.monitors.length }),
        hoverTail: [
          {
            key: 'duplicate',
            hoverTip: t('shell.action.duplicateConfiguration'),
            icon: 'mdi-content-copy'
          },
          {
            key: 'delete',
            hoverTip: t('shell.action.deleteConfiguration'),
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
              hoverTip: t('shell.action.unfavoritePlaylist'),
              color: 'var(--color-warning-text, #f4cf64)'
            }
          : undefined,
        hoverHead: !(playlist as PlaylistRecord & { favorite?: boolean }).favorite
          ? {
              key: 'favorite',
              icon: 'mdi-star-outline',
              hoverTip: t('shell.action.favoritePlaylist'),
              color: 'var(--color-text-tertiary)'
            }
          : {
              key: 'favorite',
              icon: 'mdi-star',
              hoverTip: t('shell.action.unfavoritePlaylist'),
              color: 'var(--color-warning-text, #f4cf64)'
            },
        title: playlist.name || t('common.untitledPlaylist'),
        tail: t('shell.sidebar.itemCount', { count: playlist.entries.length }),
        hoverTail: [
          {
            key: 'scan',
            hoverTip: t('shell.action.rescanFolder'),
            icon: 'mdi-refresh'
          },
          {
            key: 'remove',
            hoverTip: t('shell.action.removeFromSidebar'),
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
