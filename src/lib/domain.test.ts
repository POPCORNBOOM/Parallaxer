import { describe, expect, test } from 'vitest';
import type { ConfigurationRecord, MonitorRecord, PlaylistEntry, PlaylistRecord } from '../types';
import {
  buildPresentationPayload,
  createConfigurationDraft,
  createDefaultMonitorMapping,
  findPlaylistBySourceFolder,
  getPlayableEntryIndices,
  mergeMonitorHistory,
  stepPlayableIndex,
  upsertPlaylistRecord,
  validateConfiguration,
  validatePlaylist
} from './domain';

function createConfiguration(overrides: Partial<ConfigurationRecord> = {}): ConfigurationRecord {
  return {
    id: 'config-1',
    name: 'Wall',
    description: '',
    monitors: [
      {
        deviceId: 'monitor-left',
        shortName: 'left',
        order: 0,
        mapping: createDefaultMonitorMapping()
      },
      {
        deviceId: 'monitor-right',
        shortName: 'right',
        order: 1,
        mapping: createDefaultMonitorMapping()
      }
    ],
    ...overrides
  };
}

function createPlaylistEntry(overrides: Partial<PlaylistEntry> = {}): PlaylistEntry {
  return {
    fileName: 'scene-01.jpg',
    visibility: true,
    status: 'ready',
    message: 'Ready',
    perMonitor: {
      'monitor-left': {
        exists: true,
        relativePath: 'left/scene-01.jpg'
      },
      'monitor-right': {
        exists: true,
        relativePath: 'right/scene-01.jpg'
      }
    },
    ...overrides
  };
}

function createPlaylist(overrides: Partial<PlaylistRecord> = {}): PlaylistRecord {
  return {
    id: 'playlist-1',
    name: 'Demo',
    sourceFolder: 'D:/Playlist',
    configurationId: 'config-1',
    mappingMode: 'same-name-separated-by-shortname',
    entries: [createPlaylistEntry()],
    playlistFilePath: 'D:/Playlist/demo.playlist.json',
    ...overrides
  };
}

function createMonitor(overrides: Partial<MonitorRecord> = {}): MonitorRecord {
  return {
    deviceId: 'monitor-main',
    systemName: '\\\\.\\DISPLAY1',
    friendlyName: 'Main',
    connected: true,
    position: { x: 0, y: 0 },
    size: { width: 1920, height: 1080 },
    lastSeenAt: '2026-05-14T00:00:00.000Z',
    ...overrides
  };
}

describe('domain helpers', () => {
  test('configuration validation allows duplicate short names', () => {
    const config = createConfiguration({
      monitors: [
        {
          deviceId: 'monitor-left',
          shortName: 'dup',
          order: 0,
          mapping: createDefaultMonitorMapping()
        },
        {
          deviceId: 'monitor-right',
          shortName: 'dup',
          order: 1,
          mapping: createDefaultMonitorMapping()
        }
      ]
    });

    expect(validateConfiguration(config)).not.toContain('shortName must be unique');
  });

  test('configuration validation rejects duplicate device ids', () => {
    const config = createConfiguration({
      monitors: [
        {
          deviceId: 'monitor-left',
          shortName: 'left',
          order: 0,
          mapping: createDefaultMonitorMapping()
        },
        {
          deviceId: 'monitor-left',
          shortName: 'right',
          order: 1,
          mapping: createDefaultMonitorMapping()
        }
      ]
    });

    expect(validateConfiguration(config)).toContain('deviceId must be unique');
  });

  test('playlist validation rejects disconnected monitors', () => {
    const config = createConfiguration();
    const playlist = createPlaylist();

    expect(validatePlaylist(playlist, config, new Set())).toContain('Configuration monitor left is not connected');
  });

  test('playlist validation requires at least one visible ready entry', () => {
    const config = createConfiguration();
    const playlist = createPlaylist({
      entries: [
        createPlaylistEntry({ fileName: 'hidden.jpg', visibility: false }),
        createPlaylistEntry({ fileName: 'partial.jpg', status: 'partial-missing' })
      ]
    });

    expect(validatePlaylist(playlist, config, new Set(['monitor-left', 'monitor-right']))).toContain(
      'Playlist must include at least one visible ready entry'
    );
  });

  test('playable indices skip hidden and incomplete entries', () => {
    const entries: PlaylistEntry[] = [
      createPlaylistEntry({ fileName: 'hidden.jpg', visibility: false }),
      createPlaylistEntry({ fileName: 'ready-1.jpg' }),
      createPlaylistEntry({ fileName: 'partial.jpg', status: 'partial-missing' }),
      createPlaylistEntry({ fileName: 'ready-2.jpg' })
    ];

    expect(getPlayableEntryIndices(entries)).toEqual([1, 3]);
    expect(stepPlayableIndex(entries, 1, 1)).toBe(3);
  });

  test('presentation payload resolves one display per configuration monitor', () => {
    const configuration = createConfiguration({
      monitors: [
        {
          deviceId: 'monitor-left',
          shortName: 'left',
          order: 0,
          mapping: createDefaultMonitorMapping()
        },
        {
          deviceId: 'monitor-right',
          shortName: 'right',
          order: 1,
          mapping: createDefaultMonitorMapping()
        },
        {
          deviceId: 'monitor-top',
          shortName: 'top',
          order: 2,
          mapping: createDefaultMonitorMapping()
        }
      ]
    });
    const playlist = createPlaylist({
      entries: [
        createPlaylistEntry({
          perMonitor: {
            'monitor-left': { exists: true, relativePath: 'left/scene-01.jpg' },
            'monitor-right': { exists: true, relativePath: 'right/scene-01.jpg' },
            'monitor-top': { exists: true, relativePath: 'top/scene-01.jpg' }
          }
        })
      ]
    });

    const payload = buildPresentationPayload({
      playlist,
      configuration,
      index: 0
    });

    expect(payload.displays.map((item) => item.shortName)).toEqual(['left', 'right', 'top']);
    expect(payload.displays[0]?.assetPath).toBe('D:/Playlist/left/scene-01.jpg');
  });

  test('presentation payload marks shared root assets for horizontal slicing', () => {
    const configuration = createConfiguration({
      monitors: [
        {
          deviceId: 'monitor-left',
          shortName: 'left',
          order: 0,
          mapping: createDefaultMonitorMapping()
        },
        {
          deviceId: 'monitor-right',
          shortName: 'right',
          order: 1,
          mapping: createDefaultMonitorMapping()
        }
      ]
    });
    const playlist = createPlaylist({
      entries: [
        createPlaylistEntry({
          perMonitor: {
            'monitor-left': { exists: true, relativePath: 'shared-video.mp4', sharedSlice: true },
            'monitor-right': { exists: true, relativePath: 'shared-video.mp4', sharedSlice: true }
          }
        })
      ]
    });

    const payload = buildPresentationPayload({
      playlist,
      configuration,
      index: 0
    });

    expect(payload.displays[0]?.assetPath).toBe('D:/Playlist/shared-video.mp4');
    expect(payload.displays[0]?.slice).toEqual({ axis: 'horizontal', index: 0, total: 2 });
    expect(payload.displays[1]?.slice).toEqual({ axis: 'horizontal', index: 1, total: 2 });
  });

  test('presentation window labels are sanitized and do not depend on raw device ids', () => {
    const configuration = createConfiguration({
      monitors: [
        {
          deviceId: 'edid:tdo:5448:54@9-252835-0-uid257',
          shortName: 'Main Left',
          order: 0,
          mapping: createDefaultMonitorMapping()
        }
      ]
    });

    const payload = buildPresentationPayload({
      playlist: createPlaylist(),
      configuration,
      index: 0
    });

    expect(payload.displays[0]?.windowLabel).toBe('presentation-main-left-1');
  });

  test('playlist draft defaults to shortName-subfolder mode', () => {
    const playlist = createPlaylist();
    expect(playlist.mappingMode).toBe('same-name-separated-by-shortname');
  });

  test('playlist lookup and upsert are keyed by source folder', () => {
    const left = createPlaylist({
      id: 'D:/Playlists/Left',
      sourceFolder: 'D:\\Playlists\\Left',
      playlistFilePath: 'D:/Playlists/Left/playlist.json'
    });
    const duplicateLeft = createPlaylist({
      id: 'D:/Playlists/Left',
      name: 'Left 2',
      sourceFolder: 'D:/Playlists/Left/',
      playlistFilePath: 'D:/Playlists/Left/playlist.json'
    });
    const right = createPlaylist({
      id: 'D:/Playlists/Right',
      sourceFolder: 'D:/Playlists/Right',
      playlistFilePath: 'D:/Playlists/Right/playlist.json'
    });

    expect(findPlaylistBySourceFolder([left, right], 'D:/Playlists/Left')).toBe(left);
    expect(upsertPlaylistRecord([left, right], duplicateLeft).map((playlist) => playlist.id)).toEqual([
      'D:/Playlists/Left',
      'D:/Playlists/Right'
    ]);
  });

  test('playlist records retain configuration id and entry visibility when cloned through storage shape', () => {
    const playlist = createPlaylist({
      configurationId: 'config-2',
      entries: [
        createPlaylistEntry({ fileName: 'scene-01.jpg', visibility: false }),
        createPlaylistEntry({ fileName: 'scene-02.jpg', visibility: true })
      ]
    });

    const restored = JSON.parse(JSON.stringify(playlist)) as PlaylistRecord;

    expect(restored.configurationId).toBe('config-2');
    expect(restored.entries.map((entry) => ({ fileName: entry.fileName, visibility: entry.visibility }))).toEqual([
      { fileName: 'scene-01.jpg', visibility: false },
      { fileName: 'scene-02.jpg', visibility: true }
    ]);
  });

  test('configuration drafts get unique ids', () => {
    const first = createConfigurationDraft();
    const second = createConfigurationDraft();

    expect(first.id).not.toBe(second.id);
    expect(first.id.startsWith('configuration-')).toBe(true);
    expect(second.id.startsWith('configuration-')).toBe(true);
  });

  test('monitor history keeps disconnected monitors visible and upgrades connected copies', () => {
    const merged = mergeMonitorHistory({
      currentMonitors: [
        createMonitor({
          deviceId: 'monitor-main',
          friendlyName: 'Live Main',
          connected: true,
          lastSeenAt: '2026-05-14T10:00:00.000Z'
        })
      ],
      historyMonitors: [
        createMonitor({
          deviceId: 'monitor-main',
          friendlyName: 'Old Main',
          connected: false,
          lastSeenAt: '2026-05-01T10:00:00.000Z'
        }),
        createMonitor({
          deviceId: 'monitor-side',
          systemName: '\\\\.\\DISPLAY9',
          friendlyName: 'Side',
          connected: false,
          position: { x: 1920, y: 0 },
          size: { width: 720, height: 720 },
          lastSeenAt: '2026-05-10T10:00:00.000Z'
        })
      ],
      monitorOverrides: {}
    });

    expect(merged).toHaveLength(2);
    expect(merged.find((monitor) => monitor.deviceId === 'monitor-main')?.connected).toBe(true);
    expect(merged.find((monitor) => monitor.deviceId === 'monitor-main')?.friendlyName).toBe('Live Main');
    expect(merged.find((monitor) => monitor.deviceId === 'monitor-side')?.connected).toBe(false);
    expect(merged.find((monitor) => monitor.deviceId === 'monitor-side')?.friendlyName).toBe('Side');
  });
});
