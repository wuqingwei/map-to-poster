/**
 * Strava activity page → poster.
 *
 * Adds a floating "生成活动海报" button on activity pages. On click it fetches the
 * activity's own GPX export (the same file Strava's "··· → Export GPX" menu item
 * downloads, so it uses the signed-in session), thins it to a poster-friendly
 * point budget, stores it for the extension's poster page and asks the background
 * worker to open that page.
 *
 * Standalone classic script (no imports) — the thinning/parsing mirrors
 * src/core/gpx.js in this repo.
 */
(() => {
	const MAX_POINTS = 3000;
	const BTN_ID = 'mtp-poster-btn';

	function activityIdFromUrl() {
		const m = window.location.pathname.match(/^\/activities\/(\d+)/);
		return m ? m[1] : null;
	}

	// ---------- GPX parsing (mirrors src/core/gpx.js) ----------

	function haversineKm(a, b) {
		const R = 6371;
		const dLat = (b[0] - a[0]) * Math.PI / 180;
		const dLon = (b[1] - a[1]) * Math.PI / 180;
		const s = Math.sin(dLat / 2) ** 2 +
			Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
		return 2 * R * Math.asin(Math.sqrt(s));
	}

	function round6(n) { return Math.round(n * 1e6) / 1e6; }

	function pointsFrom(elements) {
		const pts = [];
		for (const el of elements) {
			const lat = parseFloat(el.getAttribute('lat'));
			const lon = parseFloat(el.getAttribute('lon'));
			if (Number.isFinite(lat) && Number.isFinite(lon)) pts.push([round6(lat), round6(lon)]);
		}
		return pts;
	}

	function thinSegment(points, budget) {
		if (points.length <= budget || budget < 2) return points;
		const step = (points.length - 1) / (budget - 1);
		const out = [];
		for (let i = 0; i < budget; i++) out.push(points[Math.round(i * step)]);
		return out;
	}

	function parseGpx(text) {
		const doc = new DOMParser().parseFromString(text, 'application/xml');
		if (doc.querySelector('parsererror')) throw new Error('GPX 解析失败');

		let segments = [];
		const segEls = doc.querySelectorAll('trkseg');
		if (segEls.length > 0) {
			segments = Array.from(segEls)
				.map(seg => pointsFrom(seg.querySelectorAll('trkpt')))
				.filter(seg => seg.length > 0);
		}
		if (segments.length === 0) {
			const rte = pointsFrom(doc.querySelectorAll('rtept'));
			if (rte.length > 0) segments = [rte];
		}
		if (segments.length === 0) {
			const wpt = pointsFrom(doc.querySelectorAll('wpt'));
			if (wpt.length > 0) segments = [wpt];
		}

		const rawCount = segments.reduce((n, s) => n + s.length, 0);
		if (rawCount < 2) throw new Error('这个活动没有 GPS 轨迹');

		if (rawCount > MAX_POINTS) {
			segments = segments.map(seg =>
				thinSegment(seg, Math.max(2, Math.floor(MAX_POINTS * seg.length / rawCount))));
		}

		let distanceKm = 0;
		for (const seg of segments) {
			for (let i = 1; i < seg.length; i++) distanceKm += haversineKm(seg[i - 1], seg[i]);
		}

		// Elevation gain (3 m hysteresis, mirrors src/core/gpx.js) + elapsed span.
		let elevGainM = 0;
		let eleBase = null;
		let tMin = Infinity, tMax = -Infinity;
		for (const el of doc.querySelectorAll('trkpt')) {
			const eleEl = el.querySelector('ele');
			const ele = eleEl ? parseFloat(eleEl.textContent) : NaN;
			if (Number.isFinite(ele)) {
				if (eleBase === null) eleBase = ele;
				else if (ele - eleBase >= 3) { elevGainM += ele - eleBase; eleBase = ele; }
				else if (ele < eleBase) eleBase = ele;
			}
			const timeEl = el.querySelector('time');
			if (timeEl) {
				const t = Date.parse(timeEl.textContent.trim());
				if (Number.isFinite(t)) { if (t < tMin) tMin = t; if (t > tMax) tMax = t; }
			}
		}
		const durationSec = tMax > tMin ? Math.round((tMax - tMin) / 1000) : 0;

		const nameEl = doc.querySelector('metadata > name') || doc.querySelector('trk > name');
		const name = nameEl ? nameEl.textContent.trim() : '';
		return { name, segments, distanceKm, elevGainM: Math.round(elevGainM), durationSec };
	}

	// ---------- Stats shown on the activity page (Strava's own numbers) ----------
	// The stats list pairs a value node (number + unit <abbr>) with a following
	// label node ("Distance" / "Moving Time" / "Elevation"). Strava's values win
	// over GPX-derived ones: its elevation is recomputed and its time is moving
	// time, not the elapsed span.

	function statTextByLabel(labels) {
		const nodes = document.querySelectorAll('div, span, td, dt, dd, li');
		for (const el of nodes) {
			const txt = (el.textContent || '').trim();
			if (!labels.includes(txt)) continue;
			const prev = el.previousElementSibling;
			if (prev && /\d/.test(prev.textContent || '')) return prev.textContent.trim();
			const strong = el.parentElement && el.parentElement.querySelector('strong');
			if (strong && /\d/.test(strong.textContent || '')) return strong.textContent.trim();
		}
		return '';
	}

	function statNumber(text) {
		const m = (text || '').replace(/,/g, '').match(/[\d.]+/);
		return m ? parseFloat(m[0]) : NaN;
	}

	function scrapeStats() {
		const out = {};
		const distText = statTextByLabel(['Distance', '距离']);
		if (distText) {
			let v = statNumber(distText);
			if (Number.isFinite(v)) {
				if (/miles|mi\b/i.test(distText)) v *= 1.60934;
				out.distanceKm = v;
			}
		}
		const elevText = statTextByLabel(['Elevation', 'Elev Gain', '海拔', '爬升', '累计爬升']);
		if (elevText) {
			let v = statNumber(elevText);
			if (Number.isFinite(v)) {
				if (/feet|ft\b/i.test(elevText)) v *= 0.3048;
				out.elevGainM = Math.round(v);
			}
		}
		const timeText = statTextByLabel(['Moving Time', '移动时间']) || statTextByLabel(['Time']);
		if (timeText && /[\d:]/.test(timeText)) out.durationText = timeText.replace(/\s+/g, '');
		return out;
	}

	function formatDuration(sec) {
		if (!sec || sec <= 0) return '';
		const h = Math.floor(sec / 3600);
		const m = Math.floor((sec % 3600) / 60);
		const s = sec % 60;
		return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}

	// ---------- Activity metadata from the page ----------

	function scrapeTitle() {
		const h1 = document.querySelector('h1');
		if (h1 && h1.textContent.trim()) return h1.textContent.trim();
		const og = document.querySelector('meta[property="og:title"]');
		if (og && og.getAttribute('content')) {
			return og.getAttribute('content').replace(/\s*[-|–]\s*Strava.*$/i, '').trim();
		}
		return document.title.replace(/\s*\|\s*Strava.*$/i, '').trim();
	}

	function scrapeDate() {
		const time = document.querySelector('time[datetime]');
		if (time) {
			const dt = time.getAttribute('datetime') || '';
			const m = dt.match(/\d{4}-\d{2}-\d{2}/);
			if (m) return m[0];
			if (time.textContent.trim()) return time.textContent.trim();
		}
		return '';
	}

	// ---------- Button ----------

	function setBtnState(btn, text, disabled) {
		btn.textContent = text;
		btn.style.opacity = disabled ? '0.75' : '1';
		btn.style.pointerEvents = disabled ? 'none' : 'auto';
	}

	async function onClick(btn) {
		const id = activityIdFromUrl();
		if (!id) return;
		const original = '🗺 生成活动海报';
		setBtnState(btn, '读取轨迹中…', true);
		try {
			const res = await fetch(`https://www.strava.com/activities/${id}/export_gpx`, { credentials: 'include' });
			if (!res.ok) throw new Error(`Strava 返回 ${res.status}（未登录或无权限）`);
			const text = await res.text();
			if (!text.includes('<gpx')) throw new Error('没有拿到 GPX（可能未登录）');
			const parsed = parseGpx(text);
			const stats = scrapeStats();
			const payload = {
				activityId: id,
				title: scrapeTitle() || parsed.name || 'Strava Activity',
				date: scrapeDate(),
				name: parsed.name,
				segments: parsed.segments,
				distanceKm: Number.isFinite(stats.distanceKm) ? stats.distanceKm : parsed.distanceKm,
				elevGainM: Number.isFinite(stats.elevGainM) ? stats.elevGainM : parsed.elevGainM,
				durationText: stats.durationText || formatDuration(parsed.durationSec),
				durationSec: parsed.durationSec,
				ts: Date.now()
			};
			await chrome.storage.local.set({ pendingPoster: payload });
			chrome.runtime.sendMessage({ type: 'mtp-open-poster' });
			setBtnState(btn, '✓ 已打开海报页', true);
			setTimeout(() => setBtnState(btn, original, false), 2500);
		} catch (err) {
			setBtnState(btn, `⚠ ${err.message || '读取失败'}`, true);
			setTimeout(() => setBtnState(btn, original, false), 4000);
		}
	}

	const BTN_BASE_STYLE = [
		'background:#FC4C02', 'color:#fff', 'border:none', 'cursor:pointer',
		'border-radius:999px', 'white-space:nowrap',
		'font:600 13px/1 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
		'box-shadow:0 4px 14px rgba(252,76,2,0.35)'
	].join(';');

	// The poster button belongs inside the activity map, bottom-right, lined up
	// with Strava's own controls: it sits immediately left of the orange
	// "Start flyover" button, bottoms aligned, never covering it. If the map
	// (or that button) is not on the page, fall back to a viewport-fixed pill.
	function findMapContainer() {
		const gl = document.querySelector('.maplibregl-map, .mapboxgl-map');
		if (gl && gl.querySelector('canvas') && gl.offsetWidth > 300) return gl;
		const fly = document.querySelector('button[aria-label="Start flyover"], button[aria-label*="flyover" i]');
		let node = fly ? fly.parentElement : null;
		while (node && node !== document.body) {
			if (node.querySelector('canvas') && node.offsetWidth > 300 && node.offsetHeight > 150) return node;
			node = node.parentElement;
		}
		return null;
	}

	let lastPlacement = '';
	function placeButton(btn) {
		const container = findMapContainer();
		const fly = container && container.querySelector('button[aria-label="Start flyover"], button[aria-label*="flyover" i]');
		let placement;
		if (container && fly) {
			if (btn.parentElement !== container) container.appendChild(btn);
			const cr = container.getBoundingClientRect();
			const fr = fly.getBoundingClientRect();
			const right = Math.max(8, Math.round(cr.right - fr.left + 8));
			const bottom = Math.max(0, Math.round(cr.bottom - fr.bottom));
			placement = `position:absolute;right:${right}px;bottom:${bottom}px;z-index:10;padding:11px 16px;`;
		} else if (container) {
			if (btn.parentElement !== container) container.appendChild(btn);
			placement = 'position:absolute;right:10px;bottom:10px;z-index:10;padding:11px 16px;';
		} else {
			if (btn.parentElement !== document.body) document.body.appendChild(btn);
			placement = 'position:fixed;right:24px;bottom:24px;z-index:9999;padding:12px 20px;';
		}
		if (placement !== lastPlacement) {
			lastPlacement = placement;
			btn.style.cssText = BTN_BASE_STYLE + ';' + placement;
		}
	}

	function ensureButton() {
		if (!activityIdFromUrl()) return;
		let btn = document.getElementById(BTN_ID);
		if (!btn) {
			btn = document.createElement('button');
			btn.id = BTN_ID;
			btn.type = 'button';
			btn.textContent = '🗺 生成活动海报';
			btn.addEventListener('click', () => onClick(btn));
			document.body.appendChild(btn);
			lastPlacement = '';
		}
		placeButton(btn);
	}

	ensureButton();
	// Strava is an SPA: keep the button present (and correctly placed) across
	// in-app navigations and map re-renders.
	setInterval(ensureButton, 1500);
})();
