const path = require('node:path');
const { build } = require('../../components/windows-desktop/desktop/scripts/build.cjs');
build({ webRoot: path.resolve(__dirname, '../../web'), outputRoot: path.resolve(__dirname, '../build/web') })
  .catch(error => { console.error(error); process.exitCode = 1; });
