/**
 * Playwright Electron互換性パッチ
 *
 * Electron 30+では --remote-debugging-port がCLI引数として受け付けられない。
 * Playwright PR #39012の修正を手動適用する。
 *
 * 参照: https://github.com/microsoft/playwright/pull/39012
 */
const fs = require('fs');
const path = require('path');

const electronJsPath = path.resolve(
  __dirname, '..', 'node_modules', 'playwright-core', 'lib', 'server', 'electron', 'electron.js'
);

const loaderJsPath = path.resolve(
  __dirname, '..', 'node_modules', 'playwright-core', 'lib', 'server', 'electron', 'loader.js'
);

// electron.js: --remote-debugging-port=0 をCLI引数から除去
if (fs.existsSync(electronJsPath)) {
  let content = fs.readFileSync(electronJsPath, 'utf-8');
  if (content.includes('"--remote-debugging-port=0"')) {
    content = content.replace(
      '"--inspect=0", "--remote-debugging-port=0"',
      '"--inspect=0"'
    );
    fs.writeFileSync(electronJsPath, content, 'utf-8');
    console.log('[patch] electron.js: removed --remote-debugging-port=0 from CLI args');
  } else {
    console.log('[patch] electron.js: already patched or not needed');
  }
}

// loader.js: 全体を書き直し
// - process.argv.spliceを除去（もう--remote-debugging-port=0はCLI引数にない）
// - appendSwitchでremote-debugging-portを設定
if (fs.existsSync(loaderJsPath)) {
  let content = fs.readFileSync(loaderJsPath, 'utf-8');
  const needsPatch = content.includes('process.argv.splice(1, process.argv.indexOf("--remote-debugging-port=0"))');
  if (needsPatch) {
    // splice行を除去
    content = content.replace(
      'process.argv.splice(1, process.argv.indexOf("--remote-debugging-port=0"));',
      ''
    );
    // chromiumSwitchesループの前にappendSwitch追加
    content = content.replace(
      'for (const arg of chromiumSwitches())',
      'app.commandLine.appendSwitch("remote-debugging-port", "0");\nfor (const arg of chromiumSwitches())'
    );
    fs.writeFileSync(loaderJsPath, content, 'utf-8');
    console.log('[patch] loader.js: removed argv.splice, added appendSwitch');
  } else {
    console.log('[patch] loader.js: already patched or not needed');
  }
}

console.log('[patch] Playwright Electron patch complete');
