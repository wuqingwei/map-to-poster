import { state } from '../core/state.js';
import { CARTO_BASEMAPS_KEY } from '../core/themes.js';

export function generateMapLibreStyle(theme) {
	const style = {
		version: 8,
		names: theme.name,
		sources: {
			carto: {
				type: 'vector',
				tiles: [`https://tiles.basemaps.cartocdn.com/v/20261001-03/vectortiles/carto.streets/v2/{z}/{x}/{y}.mvt?key=${CARTO_BASEMAPS_KEY}`],
				minzoom: 0,
				maxzoom: 15,
				attribution: '© OpenStreetMap contributors © CARTO'
			},
			'route-source': {
				type: 'geojson',
				data: {
					type: 'Feature',
					properties: {},
					geometry: {
						type: 'LineString',
						coordinates: [[state.routeStartLon, state.routeStartLat], [state.routeEndLon, state.routeEndLat]]
					}
				}
			},
			'gpx-source': {
				type: 'geojson',
				data: {
					type: 'Feature',
					properties: {},
					geometry: {
						type: 'MultiLineString',
						coordinates: (state.showGpx && state.gpxSegments)
							? state.gpxSegments.filter(s => s.length > 1).map(seg => seg.map(([lat, lon]) => [lon, lat]))
							: []
					}
				}
			}
		},
		layers: [
			{
				id: 'background',
				type: 'background',
				paint: { 'background-color': theme.bg }
			},
			{
				id: 'water',
				source: 'carto',
				'source-layer': 'water',
				type: 'fill',
				paint: { 'fill-color': theme.water }
			},
			{
				id: 'park',
				source: 'carto',
				'source-layer': 'landuse',
				type: 'fill',
				filter: ['in', ['get', 'kind'], ['literal', ['park', 'wood', 'grass', 'cemetery', 'pitch', 'garden', 'meadow', 'forest', 'nature_reserve', 'recreation_ground', 'village_green', 'common', 'scrub', 'heath']]],
				paint: { 'fill-color': theme.parks }
			},
			{
				id: 'road-default',
				source: 'carto',
				'source-layer': 'roads',
				type: 'line',
				filter: ['!', ['match', ['get', 'kind_detail'], ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'living_street'], true, false]],
				paint: { 'line-color': theme.road_default, 'line-width': 0.5 }
			},
			{
				id: 'road-residential',
				source: 'carto',
				'source-layer': 'roads',
				type: 'line',
				filter: ['in', ['get', 'kind_detail'], ['literal', ['residential', 'unclassified', 'living_street']]],
				paint: { 'line-color': theme.road_residential, 'line-width': 0.5 }
			},
			{
				id: 'road-tertiary',
				source: 'carto',
				'source-layer': 'roads',
				type: 'line',
				filter: ['==', ['get', 'kind_detail'], 'tertiary'],
				paint: { 'line-color': theme.road_tertiary, 'line-width': 0.8 }
			},
			{
				id: 'road-secondary',
				source: 'carto',
				'source-layer': 'roads',
				type: 'line',
				filter: ['==', ['get', 'kind_detail'], 'secondary'],
				paint: { 'line-color': theme.road_secondary, 'line-width': 1.0 }
			},
			{
				id: 'road-primary',
				source: 'carto',
				'source-layer': 'roads',
				type: 'line',
				filter: ['in', ['get', 'kind_detail'], ['literal', ['trunk', 'primary']]],
				paint: { 'line-color': theme.road_primary, 'line-width': 1.5 }
			},
			{
				id: 'road-motorway',
				source: 'carto',
				'source-layer': 'roads',
				type: 'line',
				filter: ['==', ['get', 'kind_detail'], 'motorway'],
				paint: { 'line-color': theme.road_motorway, 'line-width': 2.0 }
			},
			{
				id: 'gpx-line-casing',
				source: 'gpx-source',
				type: 'line',
				layout: {
					'line-cap': 'round',
					'line-join': 'round',
					'visibility': state.showGpx ? 'visible' : 'none'
				},
				paint: {
					'line-color': theme.bg || '#ffffff',
					'line-width': Math.round((state.gpxWidth || 4) * 2.25)
				}
			},
			{
				id: 'gpx-line',
				source: 'gpx-source',
				type: 'line',
				layout: {
					'line-cap': 'round',
					'line-join': 'round',
					'visibility': state.showGpx ? 'visible' : 'none'
				},
				paint: {
					'line-color': state.gpxColor || '#EF4444',
					'line-width': state.gpxWidth || 4
				}
			},
			{
				id: 'route-line-casing',
				source: 'route-source',
				type: 'line',
				layout: {
					'line-cap': 'round',
					'line-join': 'round',
					'visibility': state.showRoute ? 'visible' : 'none'
				},
				paint: {
					'line-color': theme.bg || '#ffffff',
					'line-width': 9
				}
			},
			{
				id: 'route-line',
				source: 'route-source',
				type: 'line',
				layout: {
					'line-cap': 'round',
					'line-join': 'round',
					'visibility': state.showRoute ? 'visible' : 'none'
				},
				paint: {
					'line-color': theme.route || '#EF4444',
					'line-width': 4
				}
			}
		]
	};
	return style;
}
