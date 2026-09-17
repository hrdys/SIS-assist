import { chromium } from 'playwright';

const SIS_URL = `https://is.cuni.cz/teststud`;
const ZAPSAT_URL = `${SIS_URL}/predm_st2/redir.php?tid=&redir=povinn`;
const ZMODUL_URL = `${SIS_URL}/predm_st2/index.php?tid=`;

const browser = await chromium.launch({headless: false});
const context = await browser.newContext();
const page = await context.newPage();
page.on('dialog', dialog => dialog.accept());
// 0. Otevřít SIS a přihlásit se
await page.goto(`${SIS_URL}/index.php?sso`);

await page.getByRole('button', { name: 'Identita občana' }).click();
await page.getByRole('button', { name: 'Mobilní klíč eGovernmentu' }).click();

await page.waitForURL(`${SIS_URL}/index.php*`, { timeout: 0, waitUntil: 'domcontentloaded' });
const session_id = new URL(page.url()).searchParams.get("id");

// ###################### Kódy lístků ######################
const tickets: Array<string> = [
  "26aNDMI002p1",
  "26aNDMI002x01",
  "26aNJAZ170x12",
  "26aNMAI057p1",
  "26aNMAI057x01",
  "26aNMAI069x01",
];
// #########################################################

const regex = /^\d{2}[ab](.+)(?:p\d|x\d{2})$/gm;
const subject_set = new Set(tickets.map(ticket => ticket.replace(regex, "$1")));

// ################ SCHEDULER (use miliseconds since Unix epoch) ################
const SCHEDULED_UNIX_TIMESTAMP_MS: number = 1789667641000
// #############################################################################
await Bun.sleep(new Date(SCHEDULED_UNIX_TIMESTAMP_MS));

const startTime = performance.now();

// Synchronously iterate over subjects sequentially in a single tab
for (const subject of subject_set) {
  // 2. Navigovat na zápisový link pro předmět
  await page.goto(`${ZAPSAT_URL}&id=${session_id}&kod=${subject}`, {
    timeout: 300_000,
    waitUntil: 'domcontentloaded'
  });

  // 3. Pustit selector na lístky pro tento předmět
  for (const ticket of tickets) {
    const el = page.locator(`input[value="${ticket}"]`);
    if (await el.count() === 1) {
      await el.dispatchEvent('click');
    }
  }

  // 4. Kliknout zapsat
  const zapBtn = page.locator(`input[name="zap_rl"]`);
  await zapBtn.dispatchEvent('click');
  await page.waitForEvent("framenavigated", { timeout: 60_000 });
  await page.waitForEvent("domcontentloaded");
  console.log((performance.now() - startTime) / 1000);
}

const endTime = performance.now();
console.log(`Zápis trval ${(endTime - startTime) / 1000} sekund`);

await page.goto(`${ZMODUL_URL}&id=${session_id}&do=kontrola`, {waitUntil: 'domcontentloaded'});
await page.locator("input.but_next", { hasText: "Žádost o kontrolu" }).click({timeout: 60_000});

await page.goto(`${ZMODUL_URL}&id=${session_id}&do=zapsane`, { timeout: 60_000, waitUntil: 'domcontentloaded'});