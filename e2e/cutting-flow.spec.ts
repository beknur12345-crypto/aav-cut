import { expect, test as base, type Page } from '@playwright/test';

/** Every test fails on an uncaught page error (hydration mismatches included). */
const test = base.extend<{ pageErrors: void }>({
  pageErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use();
    expect(errors, 'uncaught errors in the page').toEqual([]);
  }, { auto: true }],
});

const SHOTS = process.env.E2E_SCREENSHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
};

const PARTS = ['720\t560\t8\tSide', '564\t560\t4\tBottom', '564\t100\t8\tTop rail', '562\t520\t4\tShelf', '716\t596\t4\tDoor'].join('\n');
const PASSWORD = 'correct-horse-42';

async function register(page: Page, email: string) {
  await page.goto('/register');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Email').fill(email);
  // Typed key by key like a person: a dialog that steals focus on re-render would scramble this.
  await dialog.getByLabel('Password', { exact: true }).click();
  await page.keyboard.type(PASSWORD);
  await dialog.getByLabel('Repeat password').click();
  await page.keyboard.type(PASSWORD);
  await dialog.getByRole('button', { name: 'Register' }).click();
  await expect(page).toHaveURL(/\/projects$/);
}

async function newProject(page: Page, name: string) {
  await page.getByTestId('sb-add-project').click();
  await expect(page).toHaveURL(/\/projects\/[a-z0-9]+$/);
  await page.getByLabel('Project name').fill(name);
  return page.url();
}

test.describe.configure({ mode: 'serial' });

test('signed-out visitors are sent to the login page', async ({ page }) => {
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('form', { name: 'Log in' })).toBeVisible();
  await shot(page, '01-login');
});

test('wrong password is rejected with a clear message', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('ID or email').fill('nobody@example.com');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Wrong' })).toHaveText('Wrong ID/email or password');
});

test('sheet cutting: register → project → parts → optimize → report, and data is private', async ({ page, browser }) => {
  const email = `e2e-${Date.now()}@example.com`;
  await register(page, email);
  await expect(page.getByTestId('account-box')).toContainText(email);
  await expect(page.getByText('No projects here yet.')).toBeVisible();
  await shot(page, '02-projects-empty');

  const projectUrl = await newProject(page, 'Kitchen — 4 base cabinets');
  await page.getByTestId('add-cs').click();
  await expect(page.getByTestId('panel-caption')).toContainText('(CS) Material1');
  await page.getByRole('tab', { name: /Parts/ }).click();
  await shot(page, '03a-parts-empty');
  await page.getByRole('button', { name: 'Paste from Excel' }).click();
  await page.getByRole('dialog').getByRole('textbox').fill(PARTS);
  await page.getByRole('button', { name: 'Add parts' }).click();
  await expect(page.getByTestId('parts-totals')).toContainText('Qty total: 28');
  await expect(page.getByTestId('parts-totals')).toContainText('7.816');
  await expect(page.getByTestId('unsaved')).toBeVisible();
  await shot(page, '03-parts');

  // Inline edit and undo.
  const qtyCell = page.getByTestId('parts-grid').locator('.ag-row[row-index="0"] [col-id="qty"]');
  await qtyCell.click();
  await qtyCell.locator('input').fill('9');
  await qtyCell.locator('input').press('Enter');
  await expect(page.getByTestId('parts-totals')).toContainText('Qty total: 29');
  await page.getByTestId('sb-undo').click();
  await expect(page.getByTestId('parts-totals')).toContainText('Qty total: 28');

  // Optimize: 2 sheets, auto-saved.
  await page.getByRole('tab', { name: 'Cutting' }).click();
  await page.getByTestId('run-optimizer').click();
  await expect(page.getByTestId('cutting-stats')).toContainText('Sheets 2');
  await expect(page.getByTestId('cutting-stats')).toContainText('77.66');
  await expect(page.getByTestId('unsaved')).toHaveCount(0);
  await shot(page, '04-cutting');
  await page.getByTestId('toggle-commands').click();
  await expect(page.getByTestId('commands-table')).toContainText('P');

  // Parameter change makes the plan outdated; undo restores it.
  await page.getByRole('tab', { name: 'Parameters' }).click();
  await shot(page, '04b-params');
  await page.getByTestId('param-kerf').fill('3.2');
  await page.getByTestId('param-kerf').press('Enter');
  await page.getByRole('tab', { name: 'Cutting' }).click();
  await expect(page.getByText('Run the optimizer again.')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(page.getByText('Run the optimizer again.')).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel('Project name')).toHaveValue('Kitchen — 4 base cabinets');
  await page.getByRole('tab', { name: 'Cutting' }).click();
  await expect(page.getByTestId('cutting-stats')).toContainText('Sheets 2');

  // Print report goes through the print settings dialog.
  await page.locator('button.gl-acc', { hasText: 'Print report' }).click();
  const [report] = await Promise.all([page.context().waitForEvent('page'), page.getByTestId('print-go').click()]);
  await expect(report.getByText('№: 2/2')).toBeVisible();
  expect(report.url()).toContain('s=summary');
  await report.close();
  await page.goto(`${projectUrl}/print`);
  await expect(page.getByRole('heading', { name: 'Kitchen — 4 base cabinets' })).toBeVisible();
  await expect(page.getByText('№: 2/2')).toBeVisible();
  await shot(page, '05-report');

  await page.goto('/projects');
  await expect(page.getByTestId('projects-grid')).toContainText('Kitchen — 4 base cabinets');
  await expect(page.getByTestId('projects-grid')).toContainText('Not ordered');
  await shot(page, '06-projects');

  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await register(otherPage, `e2e-other-${Date.now()}@example.com`);
  expect((await otherPage.goto(projectUrl))?.status()).toBe(404);
  await other.close();

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel('ID or email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/projects$/);
});

test('phase 6: Excel import with edgebands, band cutting, labels, general actions, ordered', async ({ page, context }) => {
  await register(page, `e2e-p6-${Date.now()}@example.com`);
  await newProject(page, 'Wardrobe');

  // Imports from Excel: the ET/EB columns hold edgeband thickness → edgeband operations are created.
  await page.getByRole('button', { name: 'Imports from Excel' }).click();
  const csv = 'Length;Width;Qty;Name;ET;EB\n2000;600;2;Side;2;2\n800;600;3;Shelf;0.4;\n800;100;2;Rail;;\n';
  await page.getByTestId('excel-file').setInputFiles({ name: 'parts.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('3 row(s) with length and width')).toBeVisible();
  await shot(page, '10-excel');
  await page.getByRole('dialog').getByRole('button', { name: 'Import' }).click();
  const ops = page.getByTestId('operations-grid');
  await expect(ops).toContainText('Imported');
  await expect(ops).toContainText('Edgeband 2 mm');
  await expect(ops).toContainText('Edgeband 0.4 mm');

  // The 2 mm edgeband lists the side panels, banded on both long sides.
  await ops.getByText('Edgeband 2 mm').click();
  await page.getByRole('tab', { name: 'Parts' }).click();
  await expect(page.getByTestId('el-parts')).toContainText('Side');
  await page.getByRole('tab', { name: 'Parameters' }).click();
  await expect(page.getByTestId('el-material-length')).toHaveText('8');
  await shot(page, '11-edgeband');

  // Band (linear) cutting.
  await page.getByTestId('add-operation').click();
  await page.getByTestId('op-type-dialog').getByRole('button', { name: /\(CL\)/ }).click();
  await page.getByRole('tab', { name: /Parts/ }).click();
  await page.getByTestId('cl-add-part').click();
  const len = page.getByTestId('cl-parts').locator('.ag-row[row-index="0"] [col-id="length"]');
  await len.click();
  await len.locator('input').fill('900');
  await len.locator('input').press('Enter');
  const qty = page.getByTestId('cl-parts').locator('.ag-row[row-index="0"] [col-id="qty"]');
  await qty.click();
  await qty.locator('input').fill('7');
  await qty.locator('input').press('Enter');
  await page.getByRole('tab', { name: 'Cutting' }).click();
  await page.getByTestId('cl-run').click();
  await expect(page.getByTestId('cl-stats')).toContainText('Bands: 3');
  await shot(page, '12-band-cutting');

  // General actions → optimize every operation (sheet + band) and save.
  await page.getByRole('button', { name: 'General actions' }).click();
  await page.getByTestId('optimize-all').click();
  await expect(page.getByText(/operation\(s\) optimized and saved/)).toBeVisible();

  // Labels with barcodes.
  await page.getByTestId('add-operation').click();
  await page.getByTestId('op-type-dialog').getByRole('button', { name: /\(LB\)/ }).click();
  const [labels] = await Promise.all([context.waitForEvent('page'), page.getByTestId('lb-print').click()]);
  await labels.waitForLoadState();
  await expect(labels.getByText(/\d+ label\(s\)/)).toBeVisible();
  await expect(labels.locator('[data-testid="label-page"] svg[role="img"]').first()).toBeVisible();
  if (SHOTS) await labels.screenshot({ path: `${SHOTS}/13-labels.png` });
  await labels.close();
  const [zpl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('lb-zpl').click()]);
  expect(zpl.suggestedFilename()).toMatch(/\.zpl$/);

  // Ordered.
  await page.getByTestId('sb-ordered').click();
  await page.getByRole('dialog').getByRole('button', { name: 'OK' }).click();
  await expect(page.getByTestId('sb-ordered')).toContainText('Ordered');
  await expect(page.getByTestId('sb-ordered')).toBeDisabled();
  await shot(page, '14-ordered');
});

test('phase 9–11: edit nesting, postprocessor export, XNC editor, DXF import, online order', async ({ page, browser }) => {
  await register(page, `e2e-p9-${Date.now()}@example.com`);
  await newProject(page, 'Phase 9');
  await page.getByTestId('add-cs').click();
  await page.getByRole('tab', { name: /Parts/ }).click();
  await page.getByRole('button', { name: 'Paste from Excel' }).first().click();
  await page.getByRole('dialog').getByRole('textbox').fill(PARTS);
  await page.getByRole('button', { name: 'Add parts' }).click();
  await page.getByRole('tab', { name: 'Cutting' }).click();
  await page.getByTestId('run-optimizer').click();
  await expect(page.getByTestId('cutting-stats')).toContainText('Sheets 2');

  // Edit nesting: take a part off, see it unplaced, put it back into free space.
  await page.getByTestId('edit-nesting-btn').click();
  const nest = page.getByTestId('edit-nesting');
  await nest.locator('[data-part]').first().click();
  await nest.getByTestId('nest-remove').click();
  await expect(nest.getByTestId('nest-unplaced')).toContainText('1');
  await shot(page, '20-edit-nesting');
  await nest.getByTestId('nest-add-sheet').click();
  await nest.getByTestId('nest-parts').locator('tr.font-bold').first().click();
  await nest.getByRole('img').locator('rect[style*="copy"]').first().click();
  await expect(nest.getByTestId('nest-unplaced')).toHaveCount(0);
  await nest.getByTestId('nest-apply').click();
  await expect(page.getByText('edited by hand')).toBeVisible();
  await expect(page.getByTestId('cutting-stats')).toContainText('Sheets 3');

  // Postprocessor: DXF download.
  await page.getByTestId('pp-btn').click();
  const [dxf] = await Promise.all([page.waitForEvent('download'), page.getByTestId('pp-export').click()]);
  expect(dxf.suggestedFilename()).toMatch(/\.dxf$/);

  // XNC: drill a hole by clicking the drawing, export G-code.
  await page.getByTestId('add-xnc').click();
  await page.getByRole('tab', { name: 'Template' }).click();
  await page.getByTestId('xnc-mode-hole').click();
  await page.getByTestId('xnc-canvas').click({ position: { x: 120, y: 120 } });
  await expect(page.getByTestId('xnc-canvas').getByTestId('xnc-hole')).toHaveCount(1);
  await expect(page.getByTestId('xnc-items')).toContainText('Hole');
  await shot(page, '21-xnc');
  const [nc] = await Promise.all([page.waitForEvent('download'), page.getByTestId('xnc-gcode').click()]);
  expect(nc.suggestedFilename()).toMatch(/\.nc$/);

  // Import from other programs: rectangles from a DXF become parts.
  await page.getByRole('button', { name: 'Import from other programs' }).click();
  const dxfText = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LWPOLYLINE', '8', 'Door', '70', '1', '10', '0', '20', '0', '10', '596', '20', '0', '10', '596', '20', '716', '10', '0', '20', '716', '0', 'ENDSEC', '0', 'EOF'].join('\n');
  await page.getByTestId('dxf-file').setInputFiles({ name: 'doors.dxf', mimeType: 'application/dxf', buffer: Buffer.from(dxfText) });
  await expect(page.getByTestId('dxf-rows')).toContainText('716');
  await page.getByTestId('dxf-dialog').getByRole('button', { name: 'Import' }).click();
  await expect(page.getByTestId('operations-grid')).toContainText('DXF import');

  // Order module: enable, then a signed-out customer orders through the public page.
  await page.goto('/settings');
  await page.getByTestId('sb-module-orders').click();
  await page.getByTestId('orders-enabled').check();
  const orderUrl = await page.getByTestId('orders-url').inputValue();
  await page.getByTestId('orders-settings').getByRole('button', { name: 'OK' }).click();
  await expect(page.getByText('Saved')).toBeVisible();

  const guest = await browser.newContext();
  const g = await guest.newPage();
  await g.goto(orderUrl);
  await g.getByTestId('order-name').fill('Olena');
  await g.getByTestId('order-phone').fill('+380 50 000 00 00');
  await g.getByTestId('order-length-0').fill('700');
  await g.getByTestId('order-length-0').press('Tab');
  await g.getByTestId('order-width-0').fill('400');
  await g.getByTestId('order-width-0').press('Tab');
  if (SHOTS) await g.screenshot({ path: `${SHOTS}/22-order.png` });
  await g.getByTestId('order-submit').click();
  await expect(g.getByTestId('order-done')).toContainText('has been sent');
  await guest.close();

  await page.goto('/projects');
  await expect(page.getByTestId('projects-grid')).toContainText('Orders');
});
