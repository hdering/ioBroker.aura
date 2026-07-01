import type { BatteryLibEntry } from '../utils/batteryLibrary';

/**
 * Aura-owned battery-type entries — hand-maintained.
 *
 * These SURVIVE a re-sync of the Home Assistant snapshot (`npm run battery-lib:update`):
 * they are merged on top of batteryLibrary.generated.ts in batteryLibrary.ts, and win on
 * conflict (same manufacturer + model + modelId). Add devices the HA library misses or
 * corrections here.
 *
 * Match key is manufacturer + model (+ optional modelId). `matchMethod` (startswith |
 * endswith | contains) applies to `model`. `quantity` defaults to 1.
 */
const custom: BatteryLibEntry[] = [
    // Example:
    // { manufacturer: 'Aura', model: 'Example-Sensor', batteryType: 'CR2032' },
    // { manufacturer: 'Aura', model: 'Example-Remote', batteryType: 'AAA', quantity: 2 },
];

export default custom;
