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

page.setDefaultTimeout(0);
page.setDefaultNavigationTimeout(0);
page.on('dialog', dialog => dialog.accept());
// 0. Otevřít SIS a přihlásit se
await page.goto(`${SIS_URL}/index.php?sso`);

await page.getByRole('button', { name: 'Identita občana' }).click();
await page.getByRole('button', { name: 'Mobilní klíč eGovernmentu' }).click();

await page.waitForURL(`${SIS_URL}/index.php*`, { waitUntil: 'domcontentloaded' });
const session_id = new URL(page.url()).searchParams.get("id");

await page.goto(`${ZMODUL_URL}&id=${session_id}&do=zapis_plan`, { waitUntil: 'domcontentloaded' });
await page.goto(`${ZMODUL_URL}&id=${session_id}&do=zapsane`, { waitUntil: 'domcontentloaded' });



const regex = /^\d{2}[ab](.+)(?:p\d|x\d{2})$/gm;
const subject_set = new Set(tickets.map(ticket => ticket.replace(regex, "$1")));
const reversed_tickets = tickets.toReversed();


await Bun.sleep(new Date(SCHEDULED_UNIX_TIMESTAMP_MS));

const startTime = performance.now();

const enroll = async () => {
  // Synchronously iterate over subjects sequentially in a single tab
  for (const subject of subject_set) {
    // 2. Navigovat na zápisový link pro předmět
  await page.goto(`${ZAPSAT_URL}&id=${session_id}&kod=${subject}`, {
    waitUntil: 'domcontentloaded'
  });

    // Skip if already enrolled or unable to enroll
    if (!page.url().includes("do=vyber_rl")) {
      console.log((performance.now() - startTime) / 1000, ` skipped ${subject}, enrollment hasn't started, already enrolled, ineligible to enroll, or does not exist`); //retriable
      continue
    }
    else {
      subject_set.delete(subject); // Do not retry if opened successfully
    };

    // 3. Pustit selector na lístky pro tento předmět
    for (const ticket of reversed_tickets) {
      const el = page.locator(`input[value="${ticket}"]`);
      if (await el.count() === 1) {
        await el.dispatchEvent('click');
      }
    }

    // 4. Kliknout zapsat
    const zapBut = await page.getByRole('button', { name: 'Zapsat' })
    if (await zapBut.count() === 0) {
      console.log((performance.now() - startTime) / 1000, ` failed to enroll in ${subject} due to insufficient capcity (missing 'zapsat' button)`) // do not retry
      continue
    }

    await zapBut.dispatchEvent('click');

    await page.waitForEvent("domcontentloaded");
    
    if (page.url().includes("do=vyber_rl")) {
      console.log((performance.now() - startTime) / 1000, `failed to enroll in ${subject}, chosen tickets unavailable`) // do not retry
    }
    
    else if (page.url().includes("do=ceka")) {
      console.log((performance.now() - startTime) / 1000, `waitlisted in ${subject}`) // do not retry
      await page.getByRole('button', { name: 'Zapsat' }).dispatchEvent('click');
    await page.waitForEvent("domcontentloaded");
    }
    
    else {
    console.log((performance.now() - startTime) / 1000, ` successfully enrolled in ${subject}`); // do not retry
    };
    
  
  }

  const endTime = performance.now();
  console.log(`Zápis trval ${(endTime - startTime) / 1000} sekund`);
};

while (true) {
  try {
    await enroll();
  } catch (e) {
    console.log((performance.now() - startTime) / 1000, ` error: ${e}`);
  }
  prompt("Press enter to repeat. (already enrolled subjects will be ignored)")
}
