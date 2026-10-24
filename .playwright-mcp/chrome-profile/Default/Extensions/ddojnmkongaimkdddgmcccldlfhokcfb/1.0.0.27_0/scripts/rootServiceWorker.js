var serviceWorker = self,
	scriptsUsedByRootSW = [
		"./ping.js",
		"../background.bundle.js",
		"./firstSearchNotificationBackground.js",
	];
scriptsUsedByRootSW.forEach((r) => {
	try {
		self.importScripts(r);
	} catch (r) {}
});
