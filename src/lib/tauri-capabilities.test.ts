// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('tauri capabilities', () => {
  test('enables core ipc permissions for app windows', () => {
    const capabilityPath = resolve(process.cwd(), 'src-tauri/capabilities/app-default.json');
    const capability = JSON.parse(readFileSync(capabilityPath, 'utf8')) as {
      identifier?: string;
      windows?: string[];
      permissions?: string[];
    };

    expect(capability.identifier).toBe('app-default');
    expect(capability.windows).toContain('main');
    expect(capability.windows).toContain('presentation-*');
    expect(capability.permissions).toContain('core:default');
    expect(capability.permissions).toContain('core:window:allow-create');
    expect(capability.permissions).toContain('core:window:allow-close');
    expect(capability.permissions).toContain('core:window:allow-minimize');
    expect(capability.permissions).toContain('core:window:allow-toggle-maximize');
    expect(capability.permissions).toContain('core:window:allow-start-dragging');
    expect(capability.permissions).toContain('core:webview:allow-create-webview-window');
  });
});
