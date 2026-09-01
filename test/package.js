'use strict';

// Validates package.json against io-package.json the way the ioBroker
// repository checker does: version, licence, news, required fields. Run by
// CI (testing-action-check) via `npm run test:package`.
const path = require('node:path');
const { tests } = require('@iobroker/testing');

tests.packageFiles(path.join(__dirname, '..'));
