import L from 'leaflet';
import { state, getSelectedTheme, getSelectedArtisticTheme } from '../core/state.js';
import { getMap, getArtisticMap } from './map-init.js';

/**
 * The imported GPX track, drawn next to (and independently of) the A→B custom route:
 * a casing + coloured line per segment, with a dot at the very start and finish.
 * Tile mode draws with Leaflet; artistic mode uses the 'gpx-source' MapLibre layers
 * declared in artistic-style.js. Export redraws the track on the poster canvas in
 * core/export.js, exactly like the custom route.
 */

let leafletLayers = [];
let lastSignature = null;
let lastSegmentsRef = null;

function clearLeafletLayers(map) {
	leafletLayers.forEach(l => map.removeLayer(l));
	leafletLayers = [];
}

function casingColorFor(state) {
	return state.renderMode === 'artistic'
		? (getSelectedArtisticTheme().bg || '#ffffff')
		: (getSelectedTheme().background || '#ffffff');
}

export function updateGpxStyles(currentState = state) {
	const map = getMap();
	const artisticMap = getArtisticMap();
	const segments = (currentState.showGpx && currentState.gpxSegments) ? currentState.gpxSegments : [];
	const hasTrack = segments.some(seg => seg.length > 1);
	const color = currentState.gpxColor || '#EF4444';
	const width = currentState.gpxWidth || 4;
	const casingWidth = Math.round(width * 2.25);
	const casingColor = casingColorFor(currentState);

	// updateGpxStyles runs on every state change (it is wired into the main subscription);
	// only rebuild when something the drawing actually depends on has changed.
	const signature = [hasTrack, color, width, casingColor, currentState.renderMode].join('|');
	if (signature === lastSignature && segments === lastSegmentsRef) return;
	lastSignature = signature;
	lastSegmentsRef = segments;

	if (map) {
		clearLeafletLayers(map);
		if (hasTrack) {
			for (const seg of segments) {
				if (seg.length < 2) continue;
				leafletLayers.push(L.polyline(seg, {
					color: casingColor, weight: casingWidth, opacity: 1.0,
					lineCap: 'round', lineJoin: 'round', interactive: false
				}).addTo(map));
				leafletLayers.push(L.polyline(seg, {
					color, weight: width, opacity: 1.0,
					lineCap: 'round', lineJoin: 'round', interactive: false
				}).addTo(map));
			}
			const first = segments[0][0];
			const lastSeg = segments[segments.length - 1];
			const last = lastSeg[lastSeg.length - 1];
			for (const pt of [first, last]) {
				leafletLayers.push(L.circleMarker(pt, {
					radius: 5, color: '#ffffff', weight: 2,
					fillColor: color, fillOpacity: 1, interactive: false
				}).addTo(map));
			}
		}
	}

	if (artisticMap) {
		const source = artisticMap.getSource && artisticMap.getSource('gpx-source');
		if (source) {
			source.setData({
				type: 'Feature',
				properties: {},
				geometry: {
					type: 'MultiLineString',
					coordinates: hasTrack
						? segments.filter(s => s.length > 1).map(seg => seg.map(([lat, lon]) => [lon, lat]))
						: []
				}
			});
		}
		const visibility = hasTrack ? 'visible' : 'none';
		if (artisticMap.getLayer && artisticMap.getLayer('gpx-line-casing')) {
			artisticMap.setLayoutProperty('gpx-line-casing', 'visibility', visibility);
			artisticMap.setPaintProperty('gpx-line-casing', 'line-color', casingColor);
			artisticMap.setPaintProperty('gpx-line-casing', 'line-width', casingWidth);
		}
		if (artisticMap.getLayer && artisticMap.getLayer('gpx-line')) {
			artisticMap.setLayoutProperty('gpx-line', 'visibility', visibility);
			artisticMap.setPaintProperty('gpx-line', 'line-color', color);
			artisticMap.setPaintProperty('gpx-line', 'line-width', width);
		}
	}
}

/** Zoom/pan the preview so the whole imported track is in frame. */
export function fitGpxToMap() {
	const map = getMap();
	const segments = state.gpxSegments || [];
	const pts = segments.flat();
	if (!map || pts.length === 0) return;
	map.fitBounds(L.latLngBounds(pts), { padding: [24, 24] });
}
