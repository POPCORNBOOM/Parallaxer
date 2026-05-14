import type {
  ConfigurationRecord,
  MonitorRecord,
  PresentationDisplayPayload,
  PresentationPayload
} from '../types';
import { buildPresentationPayload, sortConfigurationMonitors } from './domain';

export interface PresentationWindowConfig {
  label: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  focus: boolean;
  fullscreen: boolean;
  scaleFactor: number;
  preview: boolean;
}

export function getMonitorByDeviceId(
  monitors: MonitorRecord[],
  deviceId: string
): MonitorRecord | null {
  return monitors.find((monitor) => monitor.deviceId === deviceId) ?? null;
}

export function buildPresentationWindowConfig(
  display: PresentationDisplayPayload,
  monitor: MonitorRecord,
  focus: boolean
): PresentationWindowConfig {
  const scaleFactor = monitor.scaleFactor && monitor.scaleFactor > 0 ? monitor.scaleFactor : 1;
  const logicalX = Math.round(monitor.position.x / scaleFactor);
  const logicalY = Math.round(monitor.position.y / scaleFactor);
  const logicalWidth = Math.round(monitor.size.width / scaleFactor);
  const logicalHeight = Math.round(monitor.size.height / scaleFactor);
  const preview = display.relativePath === '__configuration_preview__';

  return {
    label: display.windowLabel,
    url: `index.html?view=presentation&display=${encodeURIComponent(display.windowLabel)}`,
    x: logicalX,
    y: logicalY,
    width: logicalWidth,
    height: logicalHeight,
    focus,
    fullscreen: !preview,
    scaleFactor,
    preview
  };
}

export function buildPresentationWindowConfigs(args: {
  payload: PresentationPayload;
  monitors: MonitorRecord[];
  focusedWindowLabel?: string;
}): PresentationWindowConfig[] {
  const { payload, monitors, focusedWindowLabel } = args;

  return payload.displays.flatMap((display) => {
    const monitor = getMonitorByDeviceId(monitors, display.deviceId);
    if (!monitor) {
      return [];
    }

    return [
      buildPresentationWindowConfig(
        display,
        monitor,
        display.windowLabel === (focusedWindowLabel ?? payload.displays[0]?.windowLabel)
      )
    ];
  });
}

export function canPresentConfiguration(
  configuration: ConfigurationRecord,
  connectedMonitorIds: Set<string>
): { ok: true } | { ok: false; reason: string } {
  for (const monitor of sortConfigurationMonitors(configuration.monitors)) {
    if (!connectedMonitorIds.has(monitor.deviceId)) {
      return {
        ok: false,
        reason: `Monitor ${monitor.shortName} is not connected.`
      };
    }
  }

  return { ok: true };
}

export { buildPresentationPayload };
