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
  return {
    label: display.windowLabel,
    url: `index.html?view=presentation&display=${encodeURIComponent(display.shortName)}`,
    x: monitor.position.x,
    y: monitor.position.y,
    width: monitor.size.width,
    height: monitor.size.height,
    focus
  };
}

export function buildPresentationWindowConfigs(args: {
  payload: PresentationPayload;
  monitors: MonitorRecord[];
  focusedShortName?: string;
}): PresentationWindowConfig[] {
  const { payload, monitors, focusedShortName } = args;

  return payload.displays.flatMap((display) => {
    const monitor = getMonitorByDeviceId(monitors, display.deviceId);
    if (!monitor) {
      return [];
    }

    return [
      buildPresentationWindowConfig(display, monitor, display.shortName === (focusedShortName ?? payload.displays[0]?.shortName))
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
