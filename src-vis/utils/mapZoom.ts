/** Highest zoom the map widget allows. Above a tile server's own last level Leaflet
 *  scales that level's tiles up (`maxNativeZoom`), so small plots (a mower's track on
 *  a garden lawn) can still be zoomed in on (#837). Kept out of MapWidget so the
 *  config dialog does not pull in Leaflet. */
export const MAX_MAP_ZOOM = 22;
