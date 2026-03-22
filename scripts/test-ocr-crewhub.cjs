'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Mock electron before requiring ocrHandler
const Module = require('module');
const _originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'electron') {
    return {
      ipcMain: { handle: () => {}, on: () => {} },
      app: {
        getPath: (name) => {
          if (name === 'userData') return os.tmpdir();
          return os.tmpdir();
        },
        getVersion: () => '0.0.0',
      },
      BrowserWindow: class {},
      dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
      shell: { openPath: async () => '' },
    };
  }
  return _originalLoad.apply(this, arguments);
};

const imagePath = 'C:\\Users\\Alec Gougebas\\Downloads\\09A734EE-3EBC-46E2-BE91-747C0D7911F5.png';
const { processCapture } = require('../electron/ocrHandler.cjs');

async function main() {
  const imageBuffer = fs.readFileSync(imagePath);
  const imageBase64 = imageBuffer.toString('base64');

  const result = await processCapture(imageBase64, null, null, 'local', {
    screenTypeHint: 'crewhub',
    includeBboxes: true,
  });

  console.log('\n=== RAW RESULT ===');
  console.log(JSON.stringify(result, null, 2));

  // Human-readable wizard summary
  if (result) {
    console.log('\n=== WIZARD VIEW ===');
    console.log('Screen type:', result.screenType);

    const yourTeam = result.yourTeam || {};
    console.log('Your team name:', yourTeam.teamName || '(none)');
    const teammates = yourTeam.players || yourTeam.teammates || [];
    if (teammates.length) {
      console.log('Teammates:');
      for (const p of teammates) {
        const name = p.name || p.playerName || '?';
        const conf = p.confidence ?? p.nameConfidence ?? '?';
        console.log(`  - "${name}" conf=${conf}`);
      }
    }

    const enemies = result.enemyPlayers || result.enemies || [];
    console.log(`\nEnemy players (${enemies.length}):`);
    for (const p of enemies) {
      const name = p.name || p.playerName || '?';
      const team = p.teamName || p.teamColor || '?';
      const conf = p.confidence ?? p.nameConfidence ?? '?';
      console.log(`  - "${name}" | team="${team}" | conf=${conf}`);
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
