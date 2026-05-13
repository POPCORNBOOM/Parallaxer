import { PhysicalPosition, PhysicalSize } from '@tauri-apps/api/dpi';
import { getCurrentWebviewWindow, WebviewWindow } from '@tauri-apps/api/webviewWindow';
import type { ConfigurationRecord, MonitorRecord, PlaylistRecord, PresentationPayload } from '../types';
import {
  buildPresentationPayload,
  getPlayableEntryIndices,
  resolvePlayableIndex,
  stepPlayableIndex
} from './domain';
import { buildPresentationWindowConfigs } from './presentation';
import { startPresentation, stopPresentation, syncPresentation } from './tauri';

export const PRESENTATION_CONTROL_EVENT = 'presentation:control';

export interface PlaybackSession {
  active: boolean;
  playlistId: string | null;
  configurationId: string | null;
  currentIndex: number;
  payload: PresentationPayload | null;
}

export interface PlaybackContext {
  playlist: PlaylistRecord;
  configuration: ConfigurationRecord;
  monitors: MonitorRecord[];
}

export type PlaybackControl = 'previous' | 'next' | 'stop';

export function createPlaybackSession(): PlaybackSession {
  return {
    active: false,
    playlistId: null,
    configurationId: null,
    currentIndex: 0,
    payload: null
  };
}

export function buildPlaybackPayload(context: PlaybackContext, preferredIndex: number): PresentationPayload {
  const playableIndices = getPlayableEntryIndices(context.playlist.entries);
  const startIndex =
    playableIndices.length > 0 ? resolvePlayableIndex(context.playlist.entries, preferredIndex) : preferredIndex;

  const monitorFramesByDeviceId = Object.fromEntries(
    context.monitors.map((monitor) => [
      monitor.deviceId,
      {
        width: monitor.size.width,
        height: monitor.size.height,
        scaleFactor: monitor.scaleFactor
      }
    ])
  );

  return buildPresentationPayload({
    playlist: context.playlist,
    configuration: context.configuration,
    index: startIndex,
    monitorFramesByDeviceId
  });
}

export async function openPresentationWindows(payload: PresentationPayload, monitors: MonitorRecord[]): Promise<void> {
  const configs = buildPresentationWindowConfigs({ payload, monitors });

  await Promise.all(
    configs.map(async (config) => {
      const existing = await WebviewWindow.getByLabel(config.label);
      const window =
        existing ??
        new WebviewWindow(config.label, {
          url: config.url,
          x: config.x,
          y: config.y,
          width: config.width,
          height: config.height,
          decorations: false,
          shadow: false,
          resizable: false,
          visible: true,
          focus: config.focus,
          title: `Parallaxer ${config.label}`,
          skipTaskbar: true,
          alwaysOnTop: true
        });

      if (!existing) {
        await new Promise<void>((resolve, reject) => {
          let settled = false;

          void window.once('tauri://created', async () => {
            if (settled) {
              return;
            }

            settled = true;
            try {
              await window.setPosition(new PhysicalPosition(config.x, config.y));
              await window.setSize(new PhysicalSize(config.width, config.height));
              await window.setFullscreen(true);
              if (config.focus) {
                await window.setFocus();
              }
              resolve();
            } catch (error) {
              reject(error);
            }
          });

          void window.once('tauri://error', (event) => {
            if (settled) {
              return;
            }

            settled = true;
            reject(event.payload);
          });
        });

        return;
      }

      await window.show();
      await window.setPosition(new PhysicalPosition(config.x, config.y));
      await window.setSize(new PhysicalSize(config.width, config.height));
      await window.setFullscreen(true);
      if (config.focus) {
        await window.setFocus();
      }
    })
  );
}

export async function startPlayback(
  session: PlaybackSession,
  context: PlaybackContext,
  preferredIndex = 0
): Promise<PresentationPayload> {
  const payload = buildPlaybackPayload(context, preferredIndex);
  await startPresentation(payload);
  await openPresentationWindows(payload, context.monitors);
  await syncPresentation(payload);
  session.active = true;
  session.playlistId = context.playlist.id;
  session.configurationId = context.configuration.id;
  session.currentIndex = payload.index;
  session.payload = payload;
  return payload;
}

export async function stepPlayback(
  session: PlaybackSession,
  context: PlaybackContext,
  delta: number
): Promise<PresentationPayload | null> {
  if (!session.active) {
    return null;
  }

  const nextIndex = stepPlayableIndex(context.playlist.entries, session.currentIndex, delta);
  const payload = buildPlaybackPayload(context, nextIndex);
  await syncPresentation(payload);
  session.currentIndex = payload.index;
  session.payload = payload;
  return payload;
}

export async function stopPlayback(session: PlaybackSession): Promise<void> {
  await stopPresentation();
  session.active = false;
  session.playlistId = null;
  session.configurationId = null;
  session.currentIndex = 0;
  session.payload = null;
}

export async function emitPresentationControl(control: PlaybackControl): Promise<void> {
  await getCurrentWebviewWindow().emitTo('main', PRESENTATION_CONTROL_EVENT, { control });
}
