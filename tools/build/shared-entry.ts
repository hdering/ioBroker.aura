/**
 * What the adapter reuses of the frontend's list / status logic (lib/widgetPublish.js).
 *
 * Bundled by tools/build/build-shared.mjs into lib/shared/auraShared.js, so a list
 * published to aura.0.lists.<id> filters, sorts and names its rows with the very code
 * the widget renders them with — two copies of the filter engine would drift apart.
 *
 * Only pure modules belong here: anything reaching a store, React or the socket
 * would drag the frontend into the adapter. build-shared.mjs fails on such an import.
 */
export { matchesFilterMode, buildFilterChoices, normalizeFilterMode } from '../../src-vis/utils/listFilter';
export { effectiveSortRules, makeSortComparator } from '../../src-vis/utils/listSort';
export { resolveSubDpTemplate } from '../../src-vis/utils/subDpTemplate';
export { isStampSub } from '../../src-vis/utils/subDpStamp';
export { formatItemName, finishItemName, hasLiveToken } from '../../src-vis/utils/nameFilter';
export { dpTokenRefs, replaceDpTokens, dpValueText, stripDpTokens } from '../../src-vis/utils/dpTokens';
export { splitDpRef, resolveDpValue } from '../../src-vis/utils/dpRef';
export { getRoleDisplay } from '../../src-vis/utils/listEntryDisplay';
export {
    evaluateItem,
    applyLatch,
    compareItems,
    latchEnabled,
    LATCH_CATEGORIES,
} from '../../src-vis/utils/statusOverview';
