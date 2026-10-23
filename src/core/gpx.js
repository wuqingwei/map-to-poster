/**
 * Minimal GPX import: parse track segments (or route points / waypoints as a fallback),
 * downsample to a poster-friendly point budget, and measure the track.
 * Points are [lat, lon] pairs, grouped per <trkseg> so gaps in the recording stay gaps.
 */

export const GPX_MAX_POINTS = 3000;

function haversineKm(a, b) {
	const R = 6371;
	const dLat = (b[0] - a[0]) * Math.PI / 180;
	const dLon = (b[1] - a[1]) * Math.PI / 180;
	const s = Math.sin(dLat / 2) ** 2 +
		Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
	return 2 * R * Math.asin(Math.sqrt(s));
}

function round6(n) {
	return Math.round(n * 1e6) / 1e6;
}

function pointsFromElements(elements) {
	const pts = [];
	for (const el of elements) {
		const lat = parseFloat(el.getAttribute('lat'));
		const lon = parseFloat(el.getAttribute('lon'));
		if (Number.isFinite(lat) && Number.isFinite(lon)) pts.push([round6(lat), round6(lon)]);
	}
	return pts;
}

/** Evenly thin one segment to at most `budget` points, always keeping both ends. */
function thinSegment(points, budget) {
	if (points.length <= budget || budget < 2) return points;
	const step = (points.length - 1) / (budget - 1);
	const out = [];
	for (let i = 0; i < budget; i++) out.push(points[Math.round(i * step)]);
	return out;
}

/**
 * Parse GPX text. Returns { name, segments, pointCount, distanceKm, bounds }.
 * Throws an Error with a user-readable message when no usable points are found.
 */
export function parseGpx(text, fileName = '') {
	const doc = new DOMParser().parseFromString(text, 'application/xml');
	if (doc.querySelector('parsererror')) {
		throw new Error('That file could not be parsed as XML. Is it really a GPX file?');
	}

	let segments = [];
	const segEls = doc.querySelectorAll('trkseg');
	if (segEls.length > 0) {
		segments = Array.from(segEls)
			.map(seg => pointsFromElements(seg.querySelectorAll('trkpt')))
			.filter(seg => seg.length > 0);
	}
	if (segments.length === 0) {
		const rte = pointsFromElements(doc.querySelectorAll('rtept'));
		if (rte.length > 0) segments = [rte];
	}
	if (segments.length === 0) {
		const wpt = pointsFromElements(doc.querySelectorAll('wpt'));
		if (wpt.length > 0) segments = [wpt];
	}

	const rawCount = segments.reduce((n, s) => n + s.length, 0);
	if (rawCount < 2) {
		throw new Error('No track points found in that file (looked for trkpt, rtept and wpt).');
	}

	// Share the point budget across segments in proportion to their length.
	if (rawCount > GPX_MAX_POINTS) {
		segments = segments.map(seg =>
			thinSegment(seg, Math.max(2, Math.floor(GPX_MAX_POINTS * seg.length / rawCount))));
	}

	let distanceKm = 0;
	let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
	let pointCount = 0;
	for (const seg of segments) {
		pointCount += seg.length;
		for (let i = 0; i < seg.length; i++) {
			const [lat, lon] = seg[i];
			if (lat < minLat) minLat = lat;
			if (lat > maxLat) maxLat = lat;
			if (lon < minLon) minLon = lon;
			if (lon > maxLon) maxLon = lon;
			if (i > 0) distanceKm += haversineKm(seg[i - 1], seg[i]);
		}
	}

	const nameEl = doc.querySelector('metadata > name') || doc.querySelector('trk > name');
	const name = (nameEl && nameEl.textContent.trim()) || fileName.replace(/\.gpx$/i, '') || 'GPX Track';

	return {
		name,
		segments,
		pointCount,
		distanceKm,
		bounds: { minLat, maxLat, minLon, maxLon }
	};
}
