import { describe, expect, test } from 'vitest';
import type { ConfigurationRecord, MonitorRecord, PlaylistRecord } from '../types';
import {
  buildSidebarModel,
  createSidebarWidth,
  getSidebarCollapseState,
  resolveSidebarSelection
} from './sidebar';

const monitors: MonitorRecord[] = [
  {
    deviceId: 'monitor-1',
    systemName: 'Display 1',
    friendlyName: 'Front Wall',
    connected: true,
    position: { x: 0, y: 0 },
    size: { width: 1920, height: 1080 },
    lastSeenAt: '1'
  }
];

const configurations: ConfigurationRecord[] = [
  {
    id: 'config-1',
    name: 'Main Wall',
    description: 'Primary display layout',
    monitors: []
  }
];

const playlists: PlaylistRecord[] = [
  {
    id: 'playlist-1',
    name: 'Launch Loop',
    sourceFolder: 'D:/Playlists/launch',
    configurationId: 'config-1',
    mappingMode: 'same-name-separated-by-shortname',
    entries: [],
    playlistFilePath: 'D:/Playlists/launch/launch.playlist.json'
  }
];

describe('sidebar helpers', () => {
  test('builds generic sidebar lists and items for the workbench', () => {
    const model = buildSidebarModel({
      monitors,
      configurations,
      playlists,
      currentPage: 'playlist',
      selectedMonitorId: null,
      selectedConfigurationId: null,
      selectedPlaylistId: 'playlist-1'
    });

    expect(model.headButtons.map((item) => item.key)).toEqual(['new-config', 'new-playlist']);
    expect(model.bodyLists.map((item) => item.key)).toEqual(['monitors', 'configurations', 'playlists']);
    expect(model.listItems.monitors[0]?.key).toBe('monitor-1');
    expect(model.listItems.playlists[0]?.selected).toBe(true);
    expect(model.tailButtons.map((item) => item.key)).toEqual(['settings']);
  });

  test('resolves sidebar selection keys back to page and id', () => {
    expect(resolveSidebarSelection('monitors', 'monitor-1')).toEqual({
      page: 'monitor',
      id: 'monitor-1'
    });
    expect(resolveSidebarSelection('configurations', 'config-1')).toEqual({
      page: 'configuration',
      id: 'config-1'
    });
    expect(resolveSidebarSelection('playlists', 'playlist-1')).toEqual({
      page: 'playlist',
      id: 'playlist-1'
    });
  });

  test('clamps sidebar width and derives collapse state', () => {
    expect(createSidebarWidth(140)).toBe(196);
    expect(createSidebarWidth(480)).toBe(420);
    expect(getSidebarCollapseState(179)).toBe(true);
    expect(getSidebarCollapseState(196)).toBe(false);
  });
});
