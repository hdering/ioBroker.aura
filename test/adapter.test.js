'use strict';

/**
 * Basic sanity tests for the Aura adapter.
 * Verifies that the module loads and io-package.json is consistent with package.json.
 */

const assert = require('assert');
const path = require('path');

const pkg = require('../package.json');
const ioPkg = require('../io-package.json');

// ── Version consistency ────────────────────────────────────────────────────
assert.strictEqual(
  ioPkg.common.version,
  pkg.version,
  `io-package.json version (${ioPkg.common.version}) must match package.json version (${pkg.version})`,
);
console.log(`✓ Version match: ${pkg.version}`);

// ── Required io-package fields ────────────────────────────────────────────
const required = ['name', 'version', 'titleLang', 'desc', 'authors', 'type', 'mode'];
for (const field of required) {
  assert.ok(ioPkg.common[field], `io-package.json missing required field: common.${field}`);
  console.log(`✓ io-package.json has field: ${field}`);
}

// ── Authors format ────────────────────────────────────────────────────────
assert.ok(Array.isArray(ioPkg.common.authors), 'io-package.json authors must be an array');
assert.ok(ioPkg.common.authors.length > 0, 'io-package.json authors must not be empty');
console.log(`✓ Authors defined: ${ioPkg.common.authors.join(', ')}`);

// ── news field present ────────────────────────────────────────────────────
assert.ok(ioPkg.common.news, 'io-package.json must have a news field');
assert.ok(
  Object.keys(ioPkg.common.news).length > 0,
  'io-package.json news must have at least one entry',
);
console.log(`✓ news entries: ${Object.keys(ioPkg.common.news).length}`);

// ── Main entry point syntax check ────────────────────────────────────────
// Full load requires js-controller which isn't available in CI.
// We verify the file is valid JS by checking it parses without syntax errors.
const fs = require('fs');
const mainPath = path.resolve(__dirname, '..', pkg.main);
const mainSrc = fs.readFileSync(mainPath, 'utf8');
try {
  new Function(mainSrc); // syntax check only
} catch (e) {
  if (e instanceof SyntaxError) assert.fail(`lib/main.js has a syntax error: ${e.message}`);
  // other errors (require not defined etc.) are expected — file parsed OK
}
console.log('✓ lib/main.js has no syntax errors');

console.log('\nAll tests passed.');
