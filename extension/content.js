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

		const nameEl = doc.querySelector('metadata > name') || doc.querySelector('trk > name');
		const name = nameEl ? nameEl.textContent.trim() : '';
		return { name, segments, distanceKm };
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
			const payload = {
				activityId: id,
				title: scrapeTitle() || parsed.name || 'Strava Activity',
				date: scrapeDate(),
				name: parsed.name,
				segments: parsed.segments,
				distanceKm: parsed.distanceKm,
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

	function ensureButton() {
		if (!activityIdFromUrl()) return;
		if (document.getElementById(BTN_ID)) return;
		const btn = document.createElement('button');
		btn.id = BTN_ID;
		btn.type = 'button';
		btn.textContent = '🗺 生成活动海报';
		btn.style.cssText = [
			'position:fixed', 'right:24px', 'bottom:24px', 'z-index:9999',
			'background:#FC4C02', 'color:#fff', 'border:none', 'cursor:pointer',
			'padding:12px 20px', 'border-radius:999px',
			'font:600 14px/1 -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
			'box-shadow:0 8px 24px rgba(252,76,2,0.4)'
		].join(';');
		btn.addEventListener('click', () => onClick(btn));
		document.body.appendChild(btn);
	}

	ensureButton();
	// Strava is an SPA: keep the button present across in-app navigations.
	setInterval(ensureButton, 1500);
})();
