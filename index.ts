import { chromium } from 'playwright';

// ###################### SIS URL ######################
const SIS_URL = `https://is.cuni.cz/teststud`;
// #########################################################

// ################ Wait until (use miliseconds since Unix epoch) ################
const SCHEDULED_UNIX_TIMESTAMP_MS: number = 1789667641000
// #############################################################################

// ###################### Kódy lístků ######################
const tickets: Array<string> = [
  "26aNDMI050x02", // již zapsán
  "26aNEEXISTUJIp1", // neexistuje/nejsou opravneni
  "26aNAIL062x05", // plný - čekačka 
  "26aNAIL062p1", // plný - čekačka
  "26aHDPV0001x01", // plný bez čekačky (právo moment)
  "26aNDMI002p2", // částečný zápis
  "26aNMAI069x01"// úspěch
];
// #########################################################

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

await page.goto(`${ZMODUL_URL}&id=${session_id}&do=zapis_plan`, { timeout: 0, waitUntil: 'domcontentloaded' });
await page.goto(`${ZMODUL_URL}&id=${session_id}&do=zapsane`, { timeout: 0, waitUntil: 'domcontentloaded' });



const regex = /^\d{2}[ab](.+)(?:p\d|x\d{2})$/gm;
const subject_set = new Set(tickets.map(ticket => ticket.replace(regex, "$1")));


await Bun.sleep(new Date(SCHEDULED_UNIX_TIMESTAMP_MS));

const startTime = performance.now();

// Synchronously iterate over subjects sequentially in a single tab
for (const subject of subject_set) {
  // 2. Navigovat na zápisový link pro předmět
  await page.goto(`${ZAPSAT_URL}&id=${session_id}&kod=${subject}`, {
    timeout: 300_000,
    waitUntil: 'domcontentloaded'
  });

  // Skip if already enrolled or unable to enroll
  if (!page.url().includes("do=vyber_rl")) {
    console.log((performance.now() - startTime) / 1000, ` skipped ${subject}, already enrolled, ineligible to enroll, or does not exist`);  
    continue
  };

  // 3. Pustit selector na lístky pro tento předmět
  for (const ticket of tickets) {
    const el = page.locator(`input[value="${ticket}"]`);
    if (await el.count() === 1) {
      await el.dispatchEvent('click');
    }
  }

  // 4. Kliknout zapsat
  const zapBut = await page.getByRole('button', { name: 'Zapsat' })
  if (await zapBut.count() === 0) {
    console.log((performance.now() - startTime) / 1000, ` failed to enroll in ${subject} due to insufficient capcity`)
    continue
  }

  zapBut.dispatchEvent('click');

  await page.waitForEvent("domcontentloaded", { timeout: 60_000});
  
  if (page.url().includes("do=vyber_rl")) {
    console.log((performance.now() - startTime) / 1000, ` failed to enroll in ${subject}, chosen tickets unavailable or missing lecture/seminar`)
  }
  
  else if (page.url().includes("do=ceka")) {
    console.log((performance.now() - startTime) / 1000, ` waitlisted in ${subject}`)
    await page.getByRole('button', { name: 'Zapsat' }).dispatchEvent('click');
    await page.waitForEvent("domcontentloaded", { timeout: 60_000});
  }
  
  else {
    console.log((performance.now() - startTime) / 1000, ` successfully enrolled in ${subject}`);
  };
  
  
}

const endTime = performance.now();
console.log(`Zápis trval ${(endTime - startTime) / 1000} sekund`);

await page.goto(`${ZMODUL_URL}&id=${session_id}&do=kontrola`, {waitUntil: 'domcontentloaded'});
await page.getByRole('button', { name: 'Žádost o kontrolu' }).click({timeout: 60_000});
console.log(`requested validation`)

await page.goto(`${ZMODUL_URL}&id=${session_id}&do=zapsane`, { timeout: 60_000, waitUntil: 'domcontentloaded'});

// TODO: add repeat