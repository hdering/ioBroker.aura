'use strict';

// Boots a throwaway js-controller, installs this adapter into it and checks
// that the instance actually comes up without dying. Run by CI
// (testing-action-adapter) via `npm run test:integration`.
const path = require('node:path');
const { tests } = require('@iobroker/testing');

tests.integration(path.join(__dirname, '..'));
