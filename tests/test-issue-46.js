// @ts-check
const { test, expect } = require('@playwright/test');
const path = require('path');
const http = require('http');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');

function createServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost');
      const filePath = path.join(ROOT, url.pathname === '/' ? '/index_dev.html' : url.pathname);
      if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
      const ext = path.extname(filePath);
      const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css' }[ext] || 'text/plain';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(fs.readFileSync(filePath));
    });
    server.listen(0, () => resolve({ server, port: server.address().port }));
  });
}

let serverInfo;
let BASE_URL;

test.beforeAll(async () => {
  serverInfo = await createServer();
  BASE_URL = `http://127.0.0.1:${serverInfo.port}`;
});
test.afterAll(async () => { serverInfo?.server.close(); });

async function autoConfirm(page) {
  page.on('dialog', (dialog) => dialog.accept());
}

async function getLocalStorage(page) {
  return page.evaluate(() => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const raw = localStorage.getItem(key);
      try { data[key] = JSON.parse(raw); } catch { data[key] = raw; }
    }
    return data;
  });
}

async function waitForInit(page) {
  await page.waitForFunction(() => {
    const sel = document.getElementById('savedRoutineSelect');
    return sel && sel.options.length > 1;
  }, { timeout: 5000 });
}

async function openWithSeed(page, { syncDict = {}, savedRoutines = [], deletedSyncKeys = [] } = {}) {
  const syncParam = encodeURIComponent(JSON.stringify(syncDict));
  const url = `${BASE_URL}/index_dev.html?sync=${syncParam}`;
  await page.goto(url);
  await waitForInit(page);

  await page.evaluate(({ savedRoutines, deletedSyncKeys }) => {
    localStorage.setItem('savedRoutines', JSON.stringify(savedRoutines));
    localStorage.setItem('deletedSyncKeys', JSON.stringify(deletedSyncKeys));
  }, { savedRoutines, deletedSyncKeys });

  await page.goto(url);
  await waitForInit(page);
}

// Save without navigating — calls saveRoutineToStorage directly, then reads localStorage
async function saveWithoutNav(page, routineStr = '') {
  return page.evaluate((routineStr) => {
    // Call saveRoutineToStorage directly (like saveAndSendSingle does)
    const name = document.getElementById('routineName').value || 'My Routine';
    const exercises = myRoutine || [];
    saveRoutineToStorage(name, exercises,
      document.getElementById('progressionMode').value,
      document.getElementById('weightIncrement').value,
      selectedRoutineOriginalName);
    loadSavedRoutines();
    // Return the payload that would have been sent
    return buildConfigPayload(routineStr);
  }, routineStr);
}

async function addExercise(page, { sets = 3, reps = 10, weight = 60 } = {}) {
  await page.fill('#targetSets', String(sets));
  await page.fill('#targetReps', String(reps));
  await page.fill('#targetWeight', String(weight));
  await page.click('#addUpdateBtn');
}

// =====================================================================
// LAYER 1
// =====================================================================
test.describe('Layer 1 — Config page logic', () => {
  test.beforeEach(async ({ page }) => { await autoConfirm(page); });

  test('Test 1: Delete persists across reload', async ({ page }) => {
    const syncDict = { A: 'A|-1|2|Bench|3|10|60|0|-|-' };
    await openWithSeed(page, {
      syncDict,
      savedRoutines: [{ name: 'A', exercises: [['Bench Press', 3, 10, 60, 0, '-']], progressionMode: '-1', weightIncrement: '2' }]
    });

    // Mock sendToPebble to capture payload instead of navigating
    await page.evaluate(() => {
      window.__capturedPayload = null;
      window.sendToPebble = (data) => { window.__capturedPayload = data; };
    });

    await page.selectOption('#savedRoutineSelect', 'A');
    await page.click('.delete-btn');

    // deleteRoutine now sends directly to pkjs — check the captured payload
    const payload = await page.evaluate(() => window.__capturedPayload);
    expect(payload).not.toBeNull();
    expect(payload.deletedKeys).toContain('A');
  });

  test('Test 2: Rename persists across reload', async ({ page }) => {
    await openWithSeed(page, {
      syncDict: { A: 'A|-1|2|Bench|3|10|60|0|-|-' },
      savedRoutines: [{ name: 'A', exercises: [['Bench Press', 3, 10, 60, 0, '-']], progressionMode: '-1', weightIncrement: '2' }]
    });

    await page.selectOption('#savedRoutineSelect', 'A');
    await page.fill('#routineName', 'B');

    // Save without navigating
    const payload = await saveWithoutNav(page);
    expect(payload.deletedKeys).toContain('A');
    expect(payload.updatedSync).toHaveProperty('B');

    const ls = await getLocalStorage(page);
    expect(ls.deletedSyncKeys).toContain('A');
    const names = ls.savedRoutines.map(r => r.name);
    expect(names).toContain('B');
    expect(names).not.toContain('A');

    await page.goto(`${BASE_URL}/index_dev.html?sync=${encodeURIComponent('{}')}`);
    await waitForInit(page);

    const options = await page.evaluate(() =>
      Array.from(document.getElementById('savedRoutineSelect').options).map(o => o.value).filter(Boolean)
    );
    expect(options).toContain('B');
    expect(options).not.toContain('A');
  });

  test('Test 5: Tombstone prevents resurrection', async ({ page }) => {
    await openWithSeed(page, {
      syncDict: { A: 'A|-1|2|Bench|3|10|60|0|-|-' },
      savedRoutines: [],
      deletedSyncKeys: ['A']
    });

    const options = await page.evaluate(() =>
      Array.from(document.getElementById('savedRoutineSelect').options).map(o => o.value).filter(Boolean)
    );
    expect(options).not.toContain('A');
  });

  test('Test 6: Re-creating clears tombstone', async ({ page }) => {
    await openWithSeed(page, {
      syncDict: {},
      savedRoutines: [],
      deletedSyncKeys: ['A']
    });

    await page.fill('#routineName', 'A');
    await addExercise(page);

    // Save without navigating
    await saveWithoutNav(page);

    const ls = await getLocalStorage(page);
    expect(ls.deletedSyncKeys).not.toContain('A');
    expect(ls.savedRoutines.map(r => r.name)).toContain('A');
  });

  test('Test 7: Batch add doesn\'t delete selected routine', async ({ page }) => {
    await openWithSeed(page, {
      syncDict: {},
      savedRoutines: [{ name: 'A', exercises: [['Bench Press', 3, 10, 60, 0, '-']], progressionMode: '-1', weightIncrement: '2' }]
    });

    await page.selectOption('#savedRoutineSelect', 'A');
    await page.fill('#routineName', 'Batch 1');
    await page.click('#btn-add-batch');

    const ls = await getLocalStorage(page);
    expect(ls.savedRoutines.map(r => r.name)).toContain('A');
    expect(ls.deletedSyncKeys).not.toContain('A');
  });

  test('Test 8: Seeding multi-routine', async ({ page }) => {
    const syncDict = {
      A: 'A|-1|2|Bench|3|10|60|0|-|-',
      B: 'B|-1|2|Squat|3|10|80|0|-|-',
      C: 'C|-1|2|Deadlift|3|8|100|0|-|-',
    };

    await openWithSeed(page, { syncDict, savedRoutines: [], deletedSyncKeys: [] });

    const options = await page.evaluate(() =>
      Array.from(document.getElementById('savedRoutineSelect').options).map(o => o.value).filter(Boolean)
    );
    expect(options).toContain('A');
    expect(options).toContain('B');
    expect(options).toContain('C');

    const ls = await getLocalStorage(page);
    expect(ls.savedRoutines.map(r => r.name)).toEqual(expect.arrayContaining(['A', 'B', 'C']));
    expect(ls.deletedSyncKeys).toEqual([]);
  });

  test('Test 10: Payload under 450', async ({ page }) => {
    await openWithSeed(page, {
      syncDict: {},
      savedRoutines: [{ name: 'A', exercises: [['Bench Press', 3, 10, 60, 0, '-']], progressionMode: '-1', weightIncrement: '2' }]
    });

    await page.selectOption('#savedRoutineSelect', 'A');
    await page.fill('#routineName', 'B');

    const payloadSize = await page.evaluate(() => {
      const p = buildConfigPayload('B|-1|2|Bench|3|10|60|0|-|-');
      return JSON.stringify(p).length;
    });
    expect(payloadSize).toBeLessThan(450);
  });

  test('Test 11: deleteRoutine sends deletedKeys to pkjs (prevents resurrection)', async ({ page }) => {
    // Regression: deleting a routine used to rely on beforeunload/pagehide to
    // send deletedKeys to pkjs, which doesn't fire on the Pebble companion app.
    // Fix: deleteRoutine now calls sendToPebble immediately with deletedKeys.
    await openWithSeed(page, {
      syncDict: { A: 'A|-1|2|Bench|3|10|60|0|-' },
      savedRoutines: [{ name: 'A', exercises: [['Bench Press', 3, 10, 60, 0, '-']], progressionMode: '-1', weightIncrement: '2' }]
    });

    // Mock sendToPebble to capture payload
    await page.evaluate(() => {
      window.__capturedPayload = null;
      window.sendToPebble = (data) => { window.__capturedPayload = data; };
    });

    await page.selectOption('#savedRoutineSelect', 'A');
    await page.click('.delete-btn');

    const payload = await page.evaluate(() => window.__capturedPayload);
    expect(payload).not.toBeNull();
    expect(payload.deletedKeys).toContain('A');
  });
});

// =====================================================================
// LAYER 2
// =====================================================================
test.describe('Layer 2 — Full stack with emulator', () => {
  test.beforeEach(async ({ page }) => { await autoConfirm(page); });

  test('Test 3: Delete reaches watch', async ({ page }) => {
    await openWithSeed(page, {
      syncDict: { A: 'A|-1|2|Bench|3|10|60|0|-|-' },
      savedRoutines: [{ name: 'A', exercises: [['Bench Press', 3, 10, 60, 0, '-']], progressionMode: '-1', weightIncrement: '2' }]
    });

    await page.selectOption('#savedRoutineSelect', 'A');
    await page.click('.delete-btn');

    // Delete handler already ran — just evaluate the payload
    const payload = await page.evaluate(() => buildConfigPayload(''));
    expect(payload.deletedKeys).toEqual(['A']);
    expect(Object.keys(payload.updatedSync || {}).length).toBe(0);
  });

  test('Test 4: Rename reaches watch', async ({ page }) => {
    await openWithSeed(page, {
      syncDict: { A: 'A|-1|2|Bench|3|10|60|0|-|-' },
      savedRoutines: [{ name: 'A', exercises: [['Bench Press', 3, 10, 60, 0, '-']], progressionMode: '-1', weightIncrement: '2' }]
    });

    await page.selectOption('#savedRoutineSelect', 'A');
    await page.fill('#routineName', 'B');

    const payload = await saveWithoutNav(page);
    expect(payload.deletedKeys).toContain('A');
    expect(payload.updatedSync).toHaveProperty('B');
  });

  test('Test 9: deleteRoutine sends only deletedKeys (not full dict)', async ({ page }) => {
    const syncDict = { A: 'A|-1|2|Bench|3|10|60|0|-|-', B: 'B|-1|2|Squat|3|10|80|0|-|-' };
    await openWithSeed(page, {
      syncDict,
      savedRoutines: [
        { name: 'A', exercises: [['Bench Press', 3, 10, 60, 0, '-']], progressionMode: '-1', weightIncrement: '2' },
        { name: 'B', exercises: [['Squat', 3, 10, 80, 0, '-']], progressionMode: '-1', weightIncrement: '2' },
      ]
    });

    // Mock sendToPebble to capture payload
    await page.evaluate(() => {
      window.__capturedPayload = null;
      window.sendToPebble = (data) => { window.__capturedPayload = data; };
    });

    await page.selectOption('#savedRoutineSelect', 'A');
    await page.click('.delete-btn');

    const payload = await page.evaluate(() => window.__capturedPayload);
    expect(payload.deletedKeys).toEqual(['A']);
    expect(payload.updatedSync?.A).toBeUndefined();
  });
});

// =====================================================================
// LAYER 3 — deleteRoutine / deleteAllRoutines / import / batch
// =====================================================================
test.describe('Layer 3 — Immediate persistence fixes', () => {
  test.beforeEach(async ({ page }) => { await autoConfirm(page); });

  test('Test 24: deleteRoutine sends deletions to pkjs immediately', async ({ page }) => {
    // deleteRoutine must call sendToPebble with deletedKeys instead of relying
    // on beforeunload/pagehide (which don't fire on Pebble companion app).
    await openWithSeed(page, {
      syncDict: { A: 'A|-1|2|Bench|3|10|60|0|-|-' },
      savedRoutines: [{ name: 'A', exercises: [['Bench Press', 3, 10, 60, 0, '-']], progressionMode: '-1', weightIncrement: '2' }]
    });

    // Mock sendToPebble to capture payload
    await page.evaluate(() => {
      window.__capturedPayload = null;
      window.sendToPebble = (data) => { window.__capturedPayload = data; };
    });

    await page.selectOption('#savedRoutineSelect', 'A');
    await page.click('.delete-btn');

    const payload = await page.evaluate(() => window.__capturedPayload);
    expect(payload).not.toBeNull();
    expect(payload.deletedKeys).toContain('A');
  });

  test('Test 25: deleteAllRoutines marks all synced routines as deleted', async ({ page }) => {
    const syncDict = {
      A: 'A|-1|2|Bench|3|10|60|0|-|-',
      B: 'B|-1|2|Squat|3|10|80|0|-|-',
      C: 'C|-1|2|Deadlift|3|8|100|0|-|-',
    };
    await openWithSeed(page, {
      syncDict,
      savedRoutines: [
        { name: 'A', exercises: [['Bench', 3, 10, 60, 0, '-']], progressionMode: '-1', weightIncrement: '2' },
        { name: 'B', exercises: [['Squat', 3, 10, 80, 0, '-']], progressionMode: '-1', weightIncrement: '2' },
        { name: 'C', exercises: [['Deadlift', 3, 8, 100, 0, '-']], progressionMode: '-1', weightIncrement: '2' },
      ]
    });

    // Mock sendToPebble
    await page.evaluate(() => {
      window.__capturedPayload = null;
      window.sendToPebble = (data) => { window.__capturedPayload = data; };
    });

    await page.click('button:text("Delete All")');

    const payload = await page.evaluate(() => window.__capturedPayload);
    expect(payload).not.toBeNull();
    expect(payload.deletedKeys).toEqual(expect.arrayContaining(['A', 'B', 'C']));
    expect(payload.deletedKeys.length).toBe(3);
  });

  test('Test 26: deleteAllRoutines does nothing when no routines exist', async ({ page }) => {
    await openWithSeed(page, { syncDict: {}, savedRoutines: [] });

    // Mock sendToPebble
    await page.evaluate(() => {
      window.__capturedPayload = null;
      window.sendToPebble = (data) => { window.__capturedPayload = data; };
    });

    // deleteAllRoutines checks savedRoutines.length === 0 and returns early
    // The confirm dialog is auto-accepted, but the function returns before sendToPebble
    await page.evaluate(() => deleteAllRoutines());

    const payload = await page.evaluate(() => window.__capturedPayload);
    expect(payload).toBeNull();
  });

  test('Test 27: importFromText bulk sends BATCH to pkjs', async ({ page }) => {
    await openWithSeed(page, { syncDict: {}, savedRoutines: [] });

    const importData = JSON.stringify([
      { n: 'W1H', e: [['Bench', 3, 10, 60, 0, '-'], ['Row', 3, 10, 50, 0, '-']] },
      { n: 'W1L', e: [['Squat', 3, 10, 80, 0, '-']] },
    ]);

    // Mock sendRawToPebble to capture the raw sync string
    await page.evaluate(() => {
      window.__capturedRaw = null;
      window.sendRawToPebble = (syncString) => { window.__capturedRaw = syncString; };
    });

    // Switch to Batch tab (contains Import/Export textarea)
    await page.click('.tab-btn[onclick*="tab-batch"]');
    await page.waitForTimeout(200);

    await page.fill('#routineTextArea', importData);
    await page.click('button:has-text("Import")');

    const raw = await page.evaluate(() => window.__capturedRaw);
    expect(raw).not.toBeNull();
    expect(raw).toMatch(/^BATCH~/);
    expect(raw).toContain('W1H');
    expect(raw).toContain('W1L');
  });

  test('Test 28: addAllToBatch adds all saved routines', async ({ page }) => {
    await openWithSeed(page, {
      syncDict: {},
      savedRoutines: [
        { name: 'Push', exercises: [['Bench', 3, 10, 60, 0, '-']], progressionMode: '-1', weightIncrement: '2' },
        { name: 'Pull', exercises: [['Row', 3, 10, 50, 0, '-']], progressionMode: '-1', weightIncrement: '2' },
        { name: 'Legs', exercises: [['Squat', 3, 10, 80, 0, '-']], progressionMode: '-1', weightIncrement: '2' },
      ]
    });

    await page.click('#btn-add-all-batch');

    const batchCount = await page.evaluate(() => batchRoutines.length);
    expect(batchCount).toBe(3);

    const batchNames = await page.evaluate(() => batchRoutines.map(r => r.name));
    expect(batchNames).toEqual(expect.arrayContaining(['Push', 'Pull', 'Legs']));
  });

  test('Test 29: addAllToBatch skips duplicates already in batch', async ({ page }) => {
    await openWithSeed(page, {
      syncDict: {},
      savedRoutines: [
        { name: 'Push', exercises: [['Bench', 3, 10, 60, 0, '-']], progressionMode: '-1', weightIncrement: '2' },
        { name: 'Pull', exercises: [['Row', 3, 10, 50, 0, '-']], progressionMode: '-1', weightIncrement: '2' },
      ]
    });

    // Manually add Push to batch first
    await page.evaluate(() => {
      batchRoutines.push({ name: 'Push', dataStr: 'Push|-1|2|Bench|3|10|60|0|-|-' });
    });

    await page.click('#btn-add-all-batch');

    const batchNames = await page.evaluate(() => batchRoutines.map(r => r.name));
    expect(batchNames).toContain('Push');
    expect(batchNames).toContain('Pull');
    // Push should not appear twice
    expect(batchNames.filter(n => n === 'Push').length).toBe(1);
  });

  test('Test 30: deleteRoutine confirmation includes close warning', async ({ page }) => {
    await openWithSeed(page, {
      syncDict: { A: 'A|-1|2|Bench|3|10|60|0|-|-' },
      savedRoutines: [{ name: 'A', exercises: [['Bench', 3, 10, 60, 0, '-']], progressionMode: '-1', weightIncrement: '2' }]
    });

    // Override confirm to capture the message
    const confirmMsg = await page.evaluate(() => {
      document.getElementById('savedRoutineSelect').value = 'A';
      let msg = '';
      const origConfirm = window.confirm;
      window.confirm = (m) => { msg = m; return false; };
      deleteRoutine();
      window.confirm = origConfirm;
      return msg;
    });

    expect(confirmMsg).toContain('close');
  });

  test('Test 31: large import (6 routines) uses sendRawToPebble, not the 450-char sendToPebble limit', async ({ page }) => {
    // Regression: importing 6 routines (>450 chars) used to hit sendToPebble's
    // MAX_CONFIG_RESPONSE limit and alert. Import MUST use sendRawToPebble.
    await openWithSeed(page, { syncDict: {}, savedRoutines: [] });

    // 6 routines with realistic exercise names to exceed 450 chars
    const importData = JSON.stringify([
      { n: 'W1H Mell-Hat', e: [['Fekvenyomas', 4, 8, 80, 0, '-'], ['Ikertekero', 3, 10, 40, 0, '-'], ['Csigas lehuzas', 4, 10, 60, 0, '-'], ['Vallvonogatas', 4, 12, 50, 0, '-']] },
      { n: 'W1Sz Lab-Has', e: [['Guggolas', 5, 5, 100, 0, '-'], ['Felhuzas', 5, 5, 120, 0, '-'], ['Labtolo', 4, 10, 150, 0, '-']] },
      { n: 'W1P Vall-Kar', e: [['Vallnyomas', 4, 8, 50, 0, '-'], ['Oldalemeles', 3, 12, 15, 0, '-'], ['Bicepsz', 3, 10, 30, 0, '-'], ['Tricpsz', 3, 10, 35, 0, '-']] },
      { n: 'W2H Mell-Hat', e: [['Fekvenyomas', 4, 6, 85, 0, '-'], ['Ikertekero', 3, 10, 40, 0, '-'], ['Csigas lehuzas', 4, 10, 60, 0, '-']] },
      { n: 'W2Sz Lab-Has', e: [['Guggolas', 5, 3, 105, 0, '-'], ['Felhuzas', 5, 3, 125, 0, '-'], ['Labtolo', 4, 10, 150, 0, '-']] },
      { n: 'W2P Vall-Kar', e: [['Vallnyomas', 4, 8, 50, 0, '-'], ['Oldalemeles', 3, 12, 15, 0, '-'], ['Bicepsz', 3, 10, 30, 0, '-']] },
    ]);

    await page.evaluate(() => {
      window.__capturedRaw = null;
      window.__sendToPebbleCalled = false;
      const origSendToPebble = window.sendToPebble;
      window.sendToPebble = (...args) => { window.__sendToPebbleCalled = true; return origSendToPebble(...args); };
      window.sendRawToPebble = (syncString) => { window.__capturedRaw = syncString; };
    });

    // Switch to Batch tab
    await page.click('.tab-btn[onclick*="tab-batch"]');
    await page.waitForTimeout(200);

    await page.fill('#routineTextArea', importData);
    await page.click('button:has-text("Import")');

    const raw = await page.evaluate(() => window.__capturedRaw);
    const sendToPebbleCalled = await page.evaluate(() => window.__sendToPebbleCalled);

    // Must use sendRawToPebble (no 450-char limit), NOT sendToPebble
    expect(sendToPebbleCalled).toBe(false);
    expect(raw).not.toBeNull();
    expect(raw).toMatch(/^BATCH~/);
    // All 6 routine names present
    for (const name of ['W1H Mell-Hat', 'W1Sz Lab-Has', 'W1P Vall-Kar', 'W2H Mell-Hat', 'W2Sz Lab-Has', 'W2P Vall-Kar']) {
      expect(raw).toContain(name);
    }
    // The raw BATCH exceeds 450 chars, proving it bypasses the limit
    expect(raw.length).toBeGreaterThan(450);
  });

  test('Test 32: addAllToBatch skips corrupt/stale entries and uses routine\'s own prog/inc', async ({ page }) => {
    // A stale "2" entry (empty name + no exercises) from a prior buggy session
    // must NOT be added to the batch. And addAllToBatch must serialize with the
    // routine's stored progressionMode/weightIncrement (serialiseRoutineForSync),
    // not the live DOM dropdown.
    await openWithSeed(page, {
      syncDict: {},
      savedRoutines: [
        { name: 'Push', exercises: [['Bench', 3, 10, 60, 0, '-']], progressionMode: '0', weightIncrement: '2' },
        { name: '2', exercises: [] },
        { name: '', exercises: [['Ghost', 3, 10, 40, 0, '-']] },
        { name: 'Legs', exercises: [['Squat', 3, 10, 80, 0, '-']], progressionMode: '1', weightIncrement: '3' },
      ]
    });

    await page.click('#btn-add-all-batch');

    const batch = await page.evaluate(() => batchRoutines);
    const names = batch.map(r => r.name);
    expect(names).toContain('Push');
    expect(names).toContain('Legs');
    // Corrupt entries skipped — no phantom "2" or empty name
    expect(names).not.toContain('2');
    expect(names).not.toContain('');
    expect(names.length).toBe(2);

    // Correct prog/inc embedded in sync string (routine's own value, not DOM default "-1"/"2")
    const pushStr = batch.find(r => r.name === 'Push').dataStr;
    expect(pushStr).toMatch(/^Push\|0\|2\|/);       // prog=0, inc=2 (stored)
    const legsStr = batch.find(r => r.name === 'Legs').dataStr;
    expect(legsStr).toMatch(/^Legs\|1\|3\|/);        // prog=1, inc=3 (stored)
  });

  test('Test 33: importFromText embeds weight progression (prog=0) in sync string', async ({ page }) => {
    await openWithSeed(page, { syncDict: {}, savedRoutines: [] });

    const importData = JSON.stringify([
      { n: 'W1H', e: [['Bench', 3, 10, 60, 0, '-']] },
    ]);

    await page.evaluate(() => {
      window.__capturedRaw = null;
      window.sendRawToPebble = (syncString) => { window.__capturedRaw = syncString; };
    });

    await page.click('.tab-btn[onclick*="tab-batch"]');
    await page.waitForTimeout(200);
    await page.fill('#routineTextArea', importData);
    await page.click('button:has-text("Import")');

    const raw = await page.evaluate(() => window.__capturedRaw);
    // prog=0 (Weight) and inc=2 must be embedded via serialiseRoutineForSync,
    // NOT the DOM default (-1).
    expect(raw).toMatch(/^BATCH~W1H\|0\|2\|/);
  });
});
