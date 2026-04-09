'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// INIT_CWD is set by npm to the directory where npm was invoked from.
// When ioBroker runs "npm install", that's the ioBroker root (e.g. /opt/iobroker).
const ioBrokerRoot = process.env.INIT_CWD || process.cwd();

if (!fs.existsSync(path.join(ioBrokerRoot, 'iobroker.json'))) {
  // Not inside an ioBroker installation — skip (e.g. local dev)
  process.exit(0);
}

try {
  console.log('Creating aura adapter instance...');
  execSync('iobroker add aura', {
    stdio: 'inherit',
    cwd: ioBrokerRoot,
    timeout: 30000,
  });
} catch {
  // Instance may already exist or iobroker CLI not in PATH — that's fine.
  console.log('Instance creation skipped (may already exist).');
}
