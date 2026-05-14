import { describe, expect, test } from 'vitest';
import type { MonitorRecord, PresentationDisplayPayload } from '../types';
import { buildPresentationWindowConfig } from './presentation';
import {
  buildMediaFrameDimensions,
  buildMediaFrameStyle,
  buildSharedSliceSourceRect,
  buildMonitorTransform
} from './ui';

function createMonitor(overrides: Partial<MonitorRecord> = {}): MonitorRecord {
  return {
    deviceId: 'monitor-1',
    systemName: 'Ultrawide',
    friendlyName: 'Ultrawide',
    connected: true,
    position: { x: 3440, y: 0 },
    size: { width: 3440, height: 1440 },
    scaleFactor: 1.25,
    lastSeenAt: '2026-05-13T00:00:00.000Z',
    ...overrides
  };
}

function createDisplay(overrides: Partial<PresentationDisplayPayload> = {}): PresentationDisplayPayload {
  return {
    shortName: 'ultrawide',
    windowLabel: 'presentation-ultrawide',
    deviceId: 'monitor-1',
    assetPath: '',
    relativePath: '__configuration_preview__',
    mapping: {
      rotation: 0,
      mirror: 'none',
      scaleX: 1,
      scaleY: 1,
      offsetX: 0,
      offsetY: 0
    },
    ...overrides
  };
}

describe('presentation helpers', () => {
  test('buildPresentationWindowConfig converts scaled monitor bounds to logical pixels', () => {
    const config = buildPresentationWindowConfig(createDisplay(), createMonitor(), true);

    expect(config.x).toBe(2752);
    expect(config.y).toBe(0);
    expect(config.width).toBe(2752);
    expect(config.height).toBe(1152);
  });

  test('buildMediaFrameStyle keeps cropped slices centered under contain baseline', () => {
    const style = buildMediaFrameStyle({
      viewportWidth: 1720,
      viewportHeight: 1440,
      mediaWidth: 1720,
      mediaHeight: 1440
    });

    expect(style).toEqual({
      width: '1720px',
      height: '1440px'
    });
  });

  test('buildMediaFrameDimensions uses the actual cropped slice aspect ratio', () => {
    const dimensions = buildMediaFrameDimensions({
      viewportWidth: 1920,
      viewportHeight: 1080,
      mediaWidth: 960,
      mediaHeight: 1080
    });

    expect(dimensions).toEqual({
      width: 960,
      height: 1080
    });
  });

  test('monitor transform can be applied independently from slice positioning', () => {
    expect(
      buildMonitorTransform({
        rotation: 0,
        mirror: 'horizontal',
        scaleX: 1,
        scaleY: 1,
        offsetX: 0,
        offsetY: 0
      })
    ).toBe('translate(0px, 0px) scale(-1, 1)');
  });

  test('local monitor transform still resolves to frame-local translation', () => {
    expect(
      buildMonitorTransform({
        rotation: 0,
        mirror: 'none',
        scaleX: 1,
        scaleY: 1,
        offsetX: 120,
        offsetY: -40
      })
    ).toBe('translate(120px, -40px) scale(1, 1)');
  });

  test('shared slices can be cropped before scaling by using natural slice dimensions', () => {
    const sliceFrame = buildMediaFrameDimensions({
      viewportWidth: 1720,
      viewportHeight: 1440,
      mediaWidth: 1720,
      mediaHeight: 1440
    });

    expect(sliceFrame).toEqual({
      width: 1720,
      height: 1440
    });
  });

  test('shared slice safety trim scales with device pixel ratio', () => {
    expect(
      buildSharedSliceSourceRect({
        intrinsicWidth: 3440,
        intrinsicHeight: 1440,
        total: 2,
        index: 1,
        frameWidth: 1720,
        devicePixelRatio: 2
      })
    ).toEqual({
      x: 1720.5,
      y: 0,
      width: 1719.5,
      height: 1440
    });
  });
});
