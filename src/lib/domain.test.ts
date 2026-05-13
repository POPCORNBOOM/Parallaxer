import { describe, expect, test } from 'vitest';
import type { ConfigurationRecord, PlaylistEntry, PlaylistRecord } from '../types';
import {
  buildPresentationPayload,
  createDefaultMonitorMapping,
  getPlayableEntryIndices,
  stepPlayableIndex,
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
      left: {
        exists: true,
        relativePath: 'left/scene-01.jpg'
      },
      right: {
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

describe('domain helpers', () => {
  test('configuration validation rejects duplicate short names', () => {
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

    expect(validateConfiguration(config)).toContain('shortName must be unique');
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
            left: { exists: true, relativePath: 'left/scene-01.jpg' },
            right: { exists: true, relativePath: 'right/scene-01.jpg' },
            top: { exists: true, relativePath: 'top/scene-01.jpg' }
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
});
