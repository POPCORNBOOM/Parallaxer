// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('tauri asset protocol config', () => {
  test('enables asset protocol for arbitrary local media files', () => {
    const configPath = resolve(process.cwd(), 'src-tauri/tauri.conf.json');
    const config = JSON.parse(readFileSync(configPath, 'utf8')) as {
      app?: {
        security?: {
          assetProtocol?: {
            enable?: boolean;
            scope?: string[];
          };
        };
      };
    };

    expect(config.app?.security?.assetProtocol?.enable).toBe(true);
    expect(config.app?.security?.assetProtocol?.scope).toContain('**');
  });
});
