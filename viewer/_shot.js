const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const shots = [
    ['desktop', 1487, 1058],
    ['ultrawide', 2560, 1080],
    ['tablet', 820, 1180],
    ['phone', 390, 844],
  ];
  for (const [name, w, h] of shots) {
    const p = await b.newPage({ viewport: { width: w, height: h } });
    await p.goto('http://127.0.0.1:8787/index.html');
    await p.waitForTimeout(2600);
    await p.screenshot({ path: `/tmp/claude-1000/-home-waleed-Downloads-Duxo/6f645503-32c5-4190-8229-8fa189cedf76/scratchpad/${name}.png` });
    if (name === 'phone') {
      await p.click('#burger');
      await p.waitForTimeout(900);
      await p.screenshot({ path: `/tmp/claude-1000/-home-waleed-Downloads-Duxo/6f645503-32c5-4190-8229-8fa189cedf76/scratchpad/phone-menu.png` });
    }
    await p.close();
  }
  await b.close();
})();
