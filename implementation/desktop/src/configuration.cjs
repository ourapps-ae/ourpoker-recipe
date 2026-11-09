const path = require('node:path');

// What this application tells the windows-desktop component (the recipe's own component provides its
// configuration port). Values come from the design's answers when the application is assembled.
function desktopConfiguration(app, partition = 'persist:{{applicationId}}') {
  return {
    scheme: '{{scheme}}', appName: '{{applicationName}}', partition,
    serverOrigin: '{{serverAddress}}', modeEvent: '{{modeEvent}}', externalOrigins: [],
    webRoot: app.isPackaged ? path.join(process.resourcesPath, 'web') : path.resolve(__dirname, '../build/web'),
  };
}

module.exports = { desktopConfiguration };
