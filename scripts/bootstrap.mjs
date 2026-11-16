#!/usr/bin/env node
/**
 * Run the Tiana plugin bootstrap manually.
 *
 * This is the same code path the Host plugin uses on first activation. It is
 * useful after a failed install, or for verifying the bootstrap without
 * restarting DSH.
 */
import { bootstrap } from '../install.js';

try {
  const state = await bootstrap({
    log: (message) => console.error(`[tiana] ${message}`),
  });
  console.log(JSON.stringify(state, null, 2));
  if (state.status !== 'ok') process.exitCode = 1;
} catch (error) {
  console.error(`[tiana] bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
