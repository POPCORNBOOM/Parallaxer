import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type {
  AppSettings,
  ConfigurationMonitor,
  ConfigurationRecord,
  MonitorRecord,
  PlaylistEntry,
  PlaylistRecord,
  PresentationPayload
} from '../types';

export const PRESENTATION_EVENT = 'presentation:sync';

export async function listMonitors(): Promise<MonitorRecord[]> {
  return invoke('list_monitors');
}

export async function loadAppSettings(): Promise<AppSettings> {
  return invoke('load_app_settings');
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  return invoke('save_app_settings', { settings });
}

export async function listConfigurations(): Promise<ConfigurationRecord[]> {
  return invoke('list_configurations');
}

export async function readConfiguration(id: string): Promise<ConfigurationRecord> {
  return invoke('read_configuration', { id });
}

export async function saveConfiguration(config: ConfigurationRecord): Promise<ConfigurationRecord> {
  return invoke('save_configuration', { config });
}

export async function deleteConfiguration(id: string): Promise<void> {
  return invoke('delete_configuration', { id });
}

export async function choosePlaylistFolder(): Promise<string | null> {
  return invoke('choose_playlist_folder');
}

export async function readPlaylist(sourceFolder: string): Promise<PlaylistRecord | null> {
  return invoke('read_playlist', { sourceFolder });
}

export async function savePlaylist(playlist: PlaylistRecord): Promise<void> {
  return invoke('save_playlist', { playlist });
}

export async function scanPlaylistFolder(
  sourceFolder: string,
  monitors: ConfigurationMonitor[],
  previousEntries: PlaylistEntry[]
): Promise<PlaylistEntry[]> {
  return invoke('scan_playlist_folder', {
    sourceFolder,
    monitors,
    previousEntries
  });
}

export async function startPresentation(payload: PresentationPayload): Promise<void> {
  return invoke('start_presentation', { payload });
}

export async function syncPresentation(payload: PresentationPayload): Promise<void> {
  return invoke('sync_presentation', { payload });
}

export async function getPresentationState(): Promise<PresentationPayload | null> {
  return invoke('get_presentation_state');
}

export async function stopPresentation(): Promise<void> {
  return invoke('stop_presentation');
}

export function toAssetUrl(path: string): string {
  return convertFileSrc(path);
}

export async function onPresentationSync(
  handler: (payload: PresentationPayload) => void
): Promise<() => void> {
  return listen<PresentationPayload>(PRESENTATION_EVENT, (event) => {
    handler(event.payload);
  });
}
