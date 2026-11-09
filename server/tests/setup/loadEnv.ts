// Loads server/.env for local test runs. In CI the variables come from the workflow instead.
// Variables that are already set (for example by CI) are not overwritten.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const envFile = resolve(__dirname, '../../.env');
if (existsSync(envFile)) {
  for (const [name, value] of Object.entries(parseEnv(readFileSync(envFile, 'utf8')))) {
    if (process.env[name] === undefined && value !== undefined) {
      process.env[name] = value;
    }
  }
}

// US-12 (D-80): tests never depend on the developer's AI_VISION_MODE; a test that needs a draft uses setVision.
process.env.AI_VISION_MODE = 'off';
