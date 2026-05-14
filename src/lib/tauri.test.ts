import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn()
}));

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => path,
  invoke: mocks.invoke
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: mocks.listen
}));

import type { PresentationPayload } from '../types';
import { getPresentationState, readPlaylist, scanPlaylistFolder, startPresentation, syncPresentation } from './tauri';

function createPayload(count = 2): PresentationPayload {
  return {
    active: true,
    playlistId: 'playlist-1',
    configurationId: 'configuration-1',
    index: 0,
    total: 1,
    fileName: 'scene-01.jpg',
    displays: Array.from({ length: count }, (_, index) => ({
      shortName: `display-${index + 1}`,
      windowLabel: `presentation-display-${index + 1}`,
      deviceId: `monitor-${index + 1}`,
      assetPath: 'D:/Playlist/scene-01.jpg',
      relativePath: 'scene-01.jpg',
      frame: {
        width: 3440,
        height: 1440,
        scaleFactor: 1.5
      },
      selected: index === 0,
      mapping: {
        rotation: 0,
        mirror: 'none',
        scale: 1,
        offsetX: 0,
        offsetY: 0
      }
    }))
  };
}

describe('tauri frontend contract', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.listen.mockReset();
  });

  test('passes generalized presentation payloads through unchanged', async () => {
    const payload = createPayload(3);
    await startPresentation(payload);
    await syncPresentation(payload);

    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'start_presentation', { payload });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'sync_presentation', { payload });
  });

  test('reads playlists by source folder', async () => {
    await readPlaylist('D:/Playlist');

    expect(mocks.invoke).toHaveBeenCalledWith('read_playlist', {
      sourceFolder: 'D:/Playlist'
    });
  });

  test('reads the current presentation state', async () => {
    await getPresentationState();

    expect(mocks.invoke).toHaveBeenCalledWith('get_presentation_state');
  });

  test('passes monitors when scanning playlist folders', async () => {
    await scanPlaylistFolder(
      'D:/Playlist',
      [
        {
          deviceId: 'monitor-1',
          shortName: 'left',
          order: 0,
          mapping: {
            rotation: 0,
            mirror: 'none',
            scale: 1,
            offsetX: 0,
            offsetY: 0
          }
        }
      ],
      []
    );

    expect(mocks.invoke).toHaveBeenCalledWith('scan_playlist_folder', {
      sourceFolder: 'D:/Playlist',
      monitors: [
        {
          deviceId: 'monitor-1',
          shortName: 'left',
          order: 0,
          mapping: {
            rotation: 0,
            mirror: 'none',
            scale: 1,
            offsetX: 0,
            offsetY: 0
          }
        }
      ],
      previousEntries: []
    });
  });
});
