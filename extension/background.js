// Opens the bundled poster page when the Strava content script has
// fetched and stored an activity's track.
chrome.runtime.onMessage.addListener((msg) => {
	if (msg && msg.type === 'mtp-open-poster') {
		chrome.tabs.create({ url: chrome.runtime.getURL('poster.html') });
	}
});
