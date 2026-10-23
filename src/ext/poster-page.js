/**
 * Poster page for the Strava Chrome extension.
 *
 * A trimmed-down entry that reuses the web app's state, map, GPX and export
 * modules, but wires only the controls a poster export needs: map mode/theme,
 * labels, track colour/width, poster texts, size and the PNG export itself.
 * The track arrives from the content script via chrome.storage ("pendingPoster");
 * a manual GPX import is offered as a fallback.
 */
import '../../style.css';
import 'leaflet/dist/leaflet.css';
import 'maplibre-gl/dist/maplibre-gl.css';

import { state, updateState, subscribe, getSelectedTheme, getSelectedArtisticTheme } from '../core/state.js';
import { themes } from '../core/themes.js';
import { artisticThemes } from '../core/artistic-themes.js';
import { loadCustomThemes, saveCustomTheme, deleteCustomTheme, newCustomThemeKey, exportCustomThemes, importCustomThemesFromJSON, clearCustomThemes } from '../core/custom-themes.js';
import { outputPresets } from '../core/output-presets.js';
import { parseGpx } from '../core/gpx.js';
import { initMap, updateMapTheme, invalidateMapSize, updateArtisticStyle } from '../map/map-init.js';
import { updateGpxStyles, fitGpxToMap } from '../map/gpx-manager.js';
import { updatePreviewStyles } from '../ui/form.js';
import { exportToPNG } from '../core/export.js';

document.body.classList.add('loaded');

const $ = (id) => document.getElementById(id);

// ---------- Populate selects ----------

$('ext-theme-select').innerHTML = Object.entries(themes)
	.map(([key, t]) => `<option value="${key}">${t.name || key}</option>`).join('');

// Same title font list as the web app's city-font-select.
const FONT_OPTIONS = [
	["'Bebas Neue', sans-serif", 'Bebas Neue'],
	["'Caveat', cursive", 'Caveat'],
	["'Cormorant Garamond', serif", 'Cormorant Garamond'],
	["'Dancing Script', cursive", 'Dancing Script'],
	["'Inter', sans-serif", 'Inter'],
	["'Lora', serif", 'Lora'],
	["'Merriweather', serif", 'Merriweather'],
	["'Montserrat', sans-serif", 'Montserrat'],
	["'Outfit', sans-serif", 'Outfit'],
	["'Playfair Display', serif", 'Playfair Display'],
	["'Raleway', sans-serif", 'Raleway'],
	['sans-serif', 'Generic Sans-Serif'],
	['serif', 'Generic Serif']
];
$('ext-font-select').innerHTML = FONT_OPTIONS
	.map(([value, label]) => `<option value="${value}">${label}</option>`).join('');

function refreshArtisticOptions() {
	const custom = loadCustomThemes();
	const customKeys = Object.keys(custom);
	const builtin = Object.entries(artisticThemes)
		.map(([key, t]) => `<option value="${key}">${t.name || key}</option>`).join('');
	const mine = customKeys.length
		? `<optgroup label="我的主题">${customKeys.map(key => `<option value="${key}">${custom[key].name || key}</option>`).join('')}</optgroup>`
		: '';
	$('ext-artistic-select').innerHTML = `<optgroup label="内置主题">${builtin}</optgroup>${mine}`;
	$('ext-artistic-select').value = state.artisticTheme;
}
refreshArtisticOptions();
$('ext-preset-select').innerHTML = Object.entries(outputPresets)
	.map(([group, presets]) =>
		`<optgroup label="${group.replace(/_/g, ' ')}">${presets
			.map(p => `<option value="${p.width}x${p.height}">${p.name} · ${p.width}×${p.height}</option>`).join('')}</optgroup>`)
	.join('');

// ---------- Map ----------

try {
	initMap('map-preview', [state.lat, state.lon], state.zoom, getSelectedTheme().tileUrl);
} catch (err) {
	console.error('Failed to initialize map:', err);
}

// ---------- Control wiring ----------

function setMode(mode) {
	updateState({ renderMode: mode });
}

$('ext-mode-tile').addEventListener('click', () => setMode('tile'));
$('ext-mode-artistic').addEventListener('click', () => setMode('artistic'));
$('ext-theme-select').addEventListener('change', (e) => updateState({ theme: e.target.value }));
$('ext-artistic-select').addEventListener('change', (e) => updateState({ artisticTheme: e.target.value }));
$('ext-labels-toggle').addEventListener('change', (e) => updateState({ showLabels: e.target.checked }));
$('ext-coords-toggle').addEventListener('change', (e) => updateState({ showCoords: e.target.checked }));
$('ext-title-input').addEventListener('input', (e) => updateState({ cityOverride: e.target.value }));
$('ext-font-select').addEventListener('change', (e) => updateState({ cityFont: e.target.value }));
$('ext-city-size').addEventListener('input', (e) => updateState({ cityFontSize: parseInt(e.target.value) || 0 }));
$('ext-country-size').addEventListener('input', (e) => updateState({ countryFontSize: parseInt(e.target.value) || 0 }));
$('ext-size-auto').addEventListener('click', () => updateState({ cityFontSize: 0, countryFontSize: 0 }));
$('ext-subtitle-input').addEventListener('input', (e) => updateState({ countryOverride: e.target.value }));

const colorEl = $('ext-color');
const colorHexEl = $('ext-color-hex');
colorEl.addEventListener('input', () => {
	colorHexEl.value = colorEl.value;
	updateState({ gpxColor: colorEl.value });
});
colorHexEl.addEventListener('input', () => {
	const v = colorHexEl.value.trim();
	if (/^#[0-9a-fA-F]{6}$/.test(v)) {
		colorEl.value = v;
		updateState({ gpxColor: v });
	}
});
$('ext-width-slider').addEventListener('input', (e) => {
	updateState({ gpxWidth: parseInt(e.target.value) || 4 });
});

$('ext-preset-select').addEventListener('change', (e) => {
	const [w, h] = e.target.value.split('x').map(n => parseInt(n));
	if (w > 0 && h > 0) updateState({ width: w, height: h });
});
$('ext-custom-w').addEventListener('change', (e) => {
	const v = parseInt(e.target.value);
	if (v > 0) updateState({ width: v });
});
$('ext-custom-h').addEventListener('change', (e) => {
	const v = parseInt(e.target.value);
	if (v > 0) updateState({ height: v });
});

$('ext-fit-btn').addEventListener('click', () => fitGpxToMap());

// ---------- Custom artistic themes (same editor model as the web app) ----------

const CT_FIELDS = [
	{ id: 'ct-bg', key: 'bg', label: '背景', def: '#0B0B16' },
	{ id: 'ct-text', key: 'text', label: '文字', def: '#ffffff' },
	{ id: 'ct-water', key: 'water', label: '水域', def: '#071020' },
	{ id: 'ct-parks', key: 'parks', label: '公园', def: '#111122' },
	{ id: 'ct-road-motorway', key: 'road_motorway', label: '高速', def: '#FF2AE6' },
	{ id: 'ct-road-primary', key: 'road_primary', label: '主干道', def: '#00E5FF' },
	{ id: 'ct-road-secondary', key: 'road_secondary', label: '次干道', def: '#00BEBE' },
	{ id: 'ct-road-tertiary', key: 'road_tertiary', label: '三级路', def: '#008F95' },
	{ id: 'ct-road-residential', key: 'road_residential', label: '住宅路', def: '#005E66' },
	{ id: 'ct-road-default', key: 'road_default', label: '其他道路', def: '#008F95' },
	{ id: 'ct-route', key: 'route', label: '路线色', def: '#EAB308' }
];

$('ext-ct-fields').innerHTML = CT_FIELDS.map(({ id, label, def }) => `
	<div>
		<span class="label-sm">${label}</span>
		<div class="flex items-center space-x-2 bg-white border border-slate-200 rounded-xl px-2 py-1.5 shadow-sm">
			<input type="color" id="${id}" value="${def}" class="w-8 h-8 rounded-lg cursor-pointer shrink-0 border-0 p-0" />
			<input type="text" id="${id}-hex" maxlength="7" value="${def}" class="text-xs font-mono text-slate-700 bg-transparent border-0 outline-none w-full p-0" />
		</div>
	</div>`).join('');

CT_FIELDS.forEach(({ id }) => {
	const picker = $(id);
	const hex = $(id + '-hex');
	picker.addEventListener('input', () => { hex.value = picker.value; });
	hex.addEventListener('input', () => {
		if (/^#[0-9a-fA-F]{6}$/.test(hex.value.trim())) picker.value = hex.value.trim();
	});
});

let editingCustomKey = null;

function openCtEditor(key = null) {
	editingCustomKey = key;
	const existing = key ? (loadCustomThemes()[key] || {}) : {};
	$('ct-name').value = existing.name || '';
	$('ct-desc').value = existing.description || '';
	CT_FIELDS.forEach(({ id, key: fieldKey, def }) => {
		const val = existing[fieldKey] || def;
		$(id).value = val;
		$(id + '-hex').value = val;
	});
	$('ext-ct-delete').classList.toggle('hidden', !key);
	$('ext-ct-editor').classList.remove('hidden');
}

function closeCtEditor() {
	editingCustomKey = null;
	$('ext-ct-editor').classList.add('hidden');
}

$('ext-ct-new').addEventListener('click', () => openCtEditor(null));
$('ext-ct-edit').addEventListener('click', () => {
	if (state.artisticTheme && state.artisticTheme.startsWith('custom_')) {
		openCtEditor(state.artisticTheme);
	} else {
		$('ext-status').textContent = '先在上方选一个「我的主题」，或点＋新建主题';
	}
});
$('ext-ct-cancel').addEventListener('click', closeCtEditor);

$('ext-ct-save').addEventListener('click', () => {
	const name = $('ct-name').value.trim();
	if (!name) { $('ct-name').focus(); return; }
	const theme = { name, description: $('ct-desc').value.trim() };
	CT_FIELDS.forEach(({ id, key: fieldKey }) => { theme[fieldKey] = $(id).value || '#000000'; });
	const key = editingCustomKey || newCustomThemeKey();
	saveCustomTheme(key, theme);
	refreshArtisticOptions();
	updateState({ artisticTheme: key });
	if (state.renderMode === 'artistic') updateArtisticStyle(getSelectedArtisticTheme());
	closeCtEditor();
	$('ext-status').textContent = `已保存自定义主题「${name}」`;
});

$('ext-ct-delete').addEventListener('click', () => {
	if (!editingCustomKey) return;
	const name = $('ct-name').value || editingCustomKey;
	if (!confirm(`删除自定义主题「${name}」？`)) return;
	deleteCustomTheme(editingCustomKey);
	if (state.artisticTheme === editingCustomKey) {
		updateState({ artisticTheme: 'cyber_noir' });
		if (state.renderMode === 'artistic') updateArtisticStyle(getSelectedArtisticTheme());
	}
	refreshArtisticOptions();
	closeCtEditor();
	$('ext-status').textContent = '已删除自定义主题';
});

$('ext-ct-export').addEventListener('click', () => {
	if (Object.keys(loadCustomThemes()).length === 0) {
		$('ext-status').textContent = '还没有自定义主题可导出';
		return;
	}
	exportCustomThemes();
});
$('ext-ct-import').addEventListener('click', () => $('ext-ct-import-file').click());
$('ext-ct-import-file').addEventListener('change', async (e) => {
	const file = e.target.files && e.target.files[0];
	e.target.value = '';
	if (!file) return;
	try {
		const { imported, skipped } = importCustomThemesFromJSON(await file.text());
		refreshArtisticOptions();
		$('ext-status').textContent = `已导入 ${imported} 个主题${skipped ? `（跳过 ${skipped} 个无效项）` : ''}`;
	} catch {
		$('ext-status').textContent = '导入失败：不是有效的主题 JSON 文件';
	}
});
$('ext-ct-clear').addEventListener('click', () => {
	if (Object.keys(loadCustomThemes()).length === 0) return;
	if (!confirm('删除全部自定义主题？')) return;
	clearCustomThemes();
	if (state.artisticTheme && state.artisticTheme.startsWith('custom_')) {
		updateState({ artisticTheme: 'cyber_noir' });
		if (state.renderMode === 'artistic') updateArtisticStyle(getSelectedArtisticTheme());
	}
	refreshArtisticOptions();
	closeCtEditor();
	$('ext-status').textContent = '已清空自定义主题';
});

// ---------- Track seeding ----------

function seedTrack({ title, subtitle, segments, distanceKm }) {
	const first = segments && segments[0] && segments[0][0];
	updateState({
		showGpx: true,
		showMarker: false,
		showRoute: false,
		gpxSegments: segments,
		gpxDistanceKm: distanceKm,
		cityOverride: title || '',
		countryOverride: subtitle || '',
		showCoords: true,
		...(first ? { lat: first[0], lon: first[1] } : {})
	});
	if (document.activeElement !== $('ext-title-input')) $('ext-title-input').value = title || '';
	if (document.activeElement !== $('ext-subtitle-input')) $('ext-subtitle-input').value = subtitle || '';
	requestAnimationFrame(() => setTimeout(() => { invalidateMapSize(); fitGpxToMap(); }, 350));
}

function formatDuration(sec) {
	if (!sec || sec <= 0) return '';
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = sec % 60;
	return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function subtitleFor(distanceKm, date, elevGainM, durationText) {
	const parts = [`距离：${(distanceKm || 0).toFixed(1)} KM`];
	if (elevGainM > 0) parts.push(`海拔上升：${Math.round(elevGainM)} M`);
	if (durationText) parts.push(`活动时间：${durationText}`);
	return parts.join(' ');
}

function statsLine(distanceKm, pointCount, date, elevGainM, durationText) {
	let line = `${(distanceKm || 0).toFixed(1)} km · ${pointCount.toLocaleString()} 个轨迹点`;
	if (elevGainM > 0) line += ` · 爬升 ${Math.round(elevGainM)} m`;
	if (durationText) line += ` · 用时 ${durationText}`;
	if (date) line += ` · ${date}`;
	return line;
}

async function loadPendingPoster() {
	try {
		if (typeof chrome === 'undefined' || !chrome.storage) return;
		const { pendingPoster } = await chrome.storage.local.get('pendingPoster');
		if (pendingPoster && pendingPoster.segments && pendingPoster.segments.length > 0) {
			$('ext-activity-name').textContent = pendingPoster.title || 'Strava Activity';
			const pointCount = pendingPoster.segments.reduce((n, s) => n + s.length, 0);
			const durationText = pendingPoster.durationText || formatDuration(pendingPoster.durationSec);
			$('ext-activity-stats').textContent =
				statsLine(pendingPoster.distanceKm, pointCount, pendingPoster.date, pendingPoster.elevGainM, durationText);
			$('ext-nodata').classList.add('hidden');
			seedTrack({
				title: pendingPoster.title,
				subtitle: subtitleFor(pendingPoster.distanceKm, pendingPoster.date, pendingPoster.elevGainM, durationText),
				segments: pendingPoster.segments,
				distanceKm: pendingPoster.distanceKm
			});
		} else if (!state.gpxSegments || state.gpxSegments.length === 0) {
			$('ext-nodata').classList.remove('hidden');
		}
	} catch (e) {
		console.warn('No pending Strava activity:', e);
	}
}

$('ext-import-btn').addEventListener('click', () => $('ext-file-input').click());
$('ext-file-input').addEventListener('change', async (e) => {
	const file = e.target.files && e.target.files[0];
	e.target.value = '';
	if (!file) return;
	try {
		const parsed = parseGpx(await file.text(), file.name);
		const durationText = formatDuration(parsed.durationSec);
		$('ext-activity-name').textContent = parsed.name;
		$('ext-activity-stats').textContent = statsLine(parsed.distanceKm, parsed.pointCount, '', parsed.elevGainM, durationText);
		$('ext-nodata').classList.add('hidden');
		seedTrack({
			title: parsed.name,
			subtitle: subtitleFor(parsed.distanceKm, '', parsed.elevGainM, durationText),
			segments: parsed.segments,
			distanceKm: parsed.distanceKm
		});
	} catch (err) {
		$('ext-status').textContent = err.message || 'GPX 读取失败';
	}
});

// ---------- Export ----------

$('ext-export-btn').addEventListener('click', async () => {
	const btn = $('ext-export-btn');
	const title = (state.cityOverride || state.city || 'Strava').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'Strava';
	btn.disabled = true;
	btn.classList.add('opacity-60');
	$('ext-status').textContent = '正在生成海报…';
	try {
		await exportToPNG($('poster-container'), `StravaPoster-${title}-${Date.now()}.png`, null);
		$('ext-status').textContent = '已导出 PNG';
	} catch (err) {
		console.error(err);
		$('ext-status').textContent = '导出失败，请重试';
	} finally {
		btn.disabled = false;
		btn.classList.remove('opacity-60');
	}
});

// ---------- Sync UI from state ----------

function syncUI(s) {
	const isArtistic = s.renderMode === 'artistic';
	$('ext-standard-wrap').classList.toggle('hidden', isArtistic);
	$('ext-artistic-wrap').classList.toggle('hidden', !isArtistic);
	for (const [el, active] of [[$('ext-mode-tile'), !isArtistic], [$('ext-mode-artistic'), isArtistic]]) {
		el.classList.toggle('bg-white', active);
		el.classList.toggle('shadow-sm', active);
		el.classList.toggle('text-slate-900', active);
		el.classList.toggle('text-slate-400', !active);
	}
	$('ext-theme-select').value = s.theme;
	$('ext-artistic-select').value = s.artisticTheme;
	$('ext-font-select').value = s.cityFont;
	// Font size sliders mirror the effective size: the explicit value when one
	// is set, otherwise whatever the preset layout computed (read back from the
	// rendered title/subtitle, which updatePreviewStyles has just styled).
	const cityEl = $('display-city');
	if (cityEl) {
		const v = Math.round(parseFloat(getComputedStyle(cityEl).fontSize)) || 0;
		if (v && document.activeElement !== $('ext-city-size')) $('ext-city-size').value = v;
		$('ext-city-size-value').textContent = v ? `${v}px${s.cityFontSize > 0 ? '' : '（自动）'}` : '';
	}
	const countryEl = $('display-country');
	if (countryEl) {
		const v = Math.round(parseFloat(getComputedStyle(countryEl).fontSize)) || 0;
		if (v && document.activeElement !== $('ext-country-size')) $('ext-country-size').value = v;
		$('ext-country-size-value').textContent = v ? `${v}px${s.countryFontSize > 0 ? '' : '（自动）'}` : '';
	}
	$('ext-labels-toggle').checked = !!s.showLabels;
	$('ext-coords-toggle').checked = !!s.showCoords;
	if (document.activeElement !== $('ext-title-input')) $('ext-title-input').value = s.cityOverride || '';
	if (document.activeElement !== $('ext-subtitle-input')) $('ext-subtitle-input').value = s.countryOverride || '';
	if (document.activeElement !== colorHexEl) colorHexEl.value = s.gpxColor || '#EF4444';
	if (colorEl.value !== s.gpxColor) colorEl.value = s.gpxColor || '#EF4444';
	$('ext-width-slider').value = s.gpxWidth || 4;
	$('ext-width-value').textContent = `${s.gpxWidth || 4}px`;
	if (document.activeElement !== $('ext-custom-w')) $('ext-custom-w').value = s.width;
	if (document.activeElement !== $('ext-custom-h')) $('ext-custom-h').value = s.height;
	const presetVal = `${s.width}x${s.height}`;
	if ($('ext-preset-select').value !== presetVal) $('ext-preset-select').value = presetVal;
}

subscribe((s) => {
	if (s.renderMode === 'tile') {
		const theme = getSelectedTheme();
		updateMapTheme(s.showLabels ? theme.tileUrl : theme.tileUrlNoLabels);
	}
	updatePreviewStyles(s);
	updateGpxStyles(s);
	syncUI(s);
});

loadPendingPoster();
setTimeout(invalidateMapSize, 500);
window.addEventListener('resize', () => updatePreviewStyles(state));
