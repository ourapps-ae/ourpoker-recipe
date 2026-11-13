const { app } = require('electron');
const { start } = require('../../components/windows-desktop/desktop/index.cjs');
const { desktopConfiguration } = require('./configuration.cjs');
if (process.argv.includes('--verify-application')) {
  require('./verify.cjs').verify().catch(() => app.exit(1));
} else {
  start(desktopConfiguration(app)).catch(error => { console.error(error); app.exit(1); });
}
