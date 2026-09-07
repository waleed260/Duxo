/**
 * Headless screenshot helper.
 *
 * Captures a served page at four viewports plus the open mobile menu, so
 * layout work can be checked against measurements instead of by eye.
 *
 *   npm run shoot -- [url] [outDir]
 *
 * Defaults to the dev server and ./shots, which is gitignored — earlier
 * revisions hard-coded an absolute scratch path that only existed for one
 * session.
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://127.0.0.1:3000/';
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '..', 'shots'));

const SHOTS = [
  ['desktop', 1487, 1058],
  ['ultrawide', 2560, 1080],
  ['tablet', 820, 1180],
  ['phone', 390, 844],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({
    args: ['--autoplay-policy=no-user-gesture-required'],
  });

  for (const [name, width, height] of SHOTS) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await page.goto(URL, { waitUntil: 'load' });
    await page.waitForTimeout(2600);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });

    // The burger only exists in the portrait layouts.
    const burger = page.locator('#burger, [aria-label="Open menu"]').first();
    if (name === 'phone' && (await burger.count())) {
      await burger.click();
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(OUT, 'phone-menu.png') });
    }

    if (errors.length) console.error(`${name}:`, errors.join('\n  '));
    await page.close();
  }

  await browser.close();
  console.log(`wrote ${SHOTS.length + 1} screenshots to ${OUT}`);
})();
