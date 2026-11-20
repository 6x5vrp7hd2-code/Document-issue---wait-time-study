/**
 * Powertec Permit Wait-Time Study: Google Apps Script back end.
 *
 * Paste this whole file into a Google Apps Script project attached to a Google Sheet
 * (Sheet > Extensions > Apps Script), then follow SETUP.md.
 *
 * Process:
 *   1. The AP office registers each approved document request (request number, CP number, document).
 *   2. The CP arrives. The AP opens the request on his phone. The CP enters his CP number
 *      and activates it. The clock starts.
 *   3. Once the document is issued, the CP enters his CP number and completes it, and the AP
 *      agrees with his PIN. The clock stops.
 * Every time is stamped by the server clock, not the phone.
 */

const REQ_SHEET = 'Requests';
const AP_SHEET = 'APs';
const REQ_HEAD = ['reqNo', 'cp', 'docType', 'status', 'registeredAt', 'activatedAt', 'activatedBy', 'location', 'issuedAt', 'issuedBy', 'cause', 'waitMinutes', 'example'];
const AP_HEAD = ['apNo', 'pinHash', 'setAt', 'example'];
const CAUSES = ['none', 'keys', 'box', 'locks', 'doc', 'busy', 'isolation', 'other'];
const LOCATIONS = ['office', 'site'];
const DOC_TYPES = ['HV PTW', 'LV PTW', 'SFT', 'LOA', 'Other'];

/* ---------- entry points ---------- */
function doGet(e) { return handle_((e && e.parameter) || {}); }

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e && e.postData && e.postData.contents) || '{}'); } catch (err) { return out_({ ok: false, error: 'The request could not be read.' }); }
  return handle_(body);
}

function handle_(p) {
  try {
    switch (p.action) {
      case 'list': return out_({ ok: true, requests: listRequests_(), aps: listAps_(), serverTime: new Date().toISOString() });
      case 'checkPasscode': requireOffice_(p); return out_({ ok: true });
      case 'apLogin': return out_(apLogin_(p));
      case 'register': requireOffice_(p); return withLock_(() => register_(p));
      case 'setPin': requireOffice_(p); return withLock_(() => setPin_(p));
      case 'activate': return withLock_(() => step_(p, 'activate'));
      case 'issue': return withLock_(() => step_(p, 'issue'));
      case 'clearExamples': requireOffice_(p); return withLock_(() => clearExamples_());
      case 'loadExamples': requireOffice_(p); return withLock_(() => loadExamples_());
      default: return out_({ ok: false, error: 'Unknown action.' });
    }
  } catch (err) {
    return out_({ ok: false, error: String(err.message || err) });
  }
}

/* ---------- AP sign-in ---------- */
// The AP signs in once with his AP number and PIN. The phone keeps a token, never the PIN.
// Resetting the PIN in the AP office makes the old token invalid.
function apLogin_(p) {
  const apNo = clean_(p.apNo), pin = String(p.pin || '').trim();
  const ap = findAp_(apNo);
  if (!ap || ap.pinHash !== hash_(apNo, pin)) throw new Error('The AP number and PIN do not match.');
  return { ok: true, apNo: apNo, token: token_(apNo, ap.pinHash) };
}

function requireAp_(p) {
  const apNo = clean_(p.apNo);
  const ap = findAp_(apNo);
  if (!ap || String(p.token || '') !== token_(apNo, ap.pinHash)) throw new Error('Sign in again with your AP number and PIN.');
  return apNo;
}

/* ---------- actions ---------- */
function register_(p) {
  const reqNo = clean_(p.reqNo), cp = clean_(p.cp), docType = String(p.docType || '');
  if (!reqNo || !cp) throw new Error('Enter the request number and the CP number.');
  if (DOC_TYPES.indexOf(docType) < 0) throw new Error('Choose a document type.');
  const sh = sheet_(REQ_SHEET, REQ_HEAD);
  if (findRow_(sh, reqNo) > 0) throw new Error('That request number is already registered.');
  sh.appendRow([reqNo, cp, docType, 'registered', new Date(), '', '', '', '', '', '', '', false]);
  return out_({ ok: true, message: reqNo + ' registered for ' + cp + '.' });
}

function setPin_(p) {
  const apNo = clean_(p.apNo), pin = String(p.pin || '').trim();
  if (!apNo || !/^\d{4,6}$/.test(pin)) throw new Error('Enter an AP number and a PIN of 4 to 6 digits.');
  const sh = sheet_(AP_SHEET, AP_HEAD);
  const row = findRow_(sh, apNo);
  const values = [apNo, hash_(apNo, pin), new Date(), false];
  if (row > 0) sh.getRange(row, 1, 1, values.length).setValues([values]);
  else sh.appendRow(values);
  return out_({ ok: true, message: 'PIN saved for ' + apNo + '.' });
}

function step_(p, kind) {
  const apNo = requireAp_(p);
  const reqNo = clean_(p.reqNo), cp = clean_(p.cp);
  const sh = sheet_(REQ_SHEET, REQ_HEAD);
  const row = findRow_(sh, reqNo);
  if (row < 0) throw new Error('No approved request with that number.');
  const r = rowObject_(sh, row, REQ_HEAD);
  if (!cp) throw new Error('The CP must enter his CP number.');
  if (String(r.cp).toUpperCase() !== cp) throw new Error('That CP number does not match this request.');
  const now = new Date();
  const col = name => REQ_HEAD.indexOf(name) + 1;
  if (kind === 'activate') {
    if (r.status !== 'registered') throw new Error(r.status === 'active' ? 'This document is already activated.' : 'This document has already been issued.');
    sh.getRange(row, col('status')).setValue('active');
    sh.getRange(row, col('activatedAt')).setValue(now);
    sh.getRange(row, col('activatedBy')).setValue(apNo);
    sh.getRange(row, col('location')).setValue(LOCATIONS.indexOf(p.location) >= 0 ? p.location : 'office');
    return out_({ ok: true, message: reqNo + ' activated. The clock has started.' });
  }
  if (r.status !== 'active') throw new Error(r.status === 'registered' ? 'Activate this document first.' : 'This document has already been issued.');
  const ap = findAp_(apNo);
  if (!ap || ap.pinHash !== hash_(apNo, String(p.pin || '').trim())) throw new Error('Your PIN is not correct. The AP must agree with his PIN.');
  const wait = (now.getTime() - new Date(r.activatedAt).getTime()) / 60000;
  sh.getRange(row, col('status')).setValue('issued');
  sh.getRange(row, col('issuedAt')).setValue(now);
  sh.getRange(row, col('issuedBy')).setValue(apNo);
  sh.getRange(row, col('cause')).setValue(CAUSES.indexOf(p.cause) >= 0 ? p.cause : 'none');
  sh.getRange(row, col('waitMinutes')).setValue(Math.round(wait * 10) / 10);
  return out_({ ok: true, message: reqNo + ' issued. The clock has stopped.' });
}

function clearExamples_() {
  [[REQ_SHEET, REQ_HEAD], [AP_SHEET, AP_HEAD]].forEach(([name, head]) => {
    const sh = sheet_(name, head);
    const exCol = head.indexOf('example');
    const values = sh.getDataRange().getValues();
    for (let i = values.length - 1; i >= 1; i--) {
      if (values[i][exCol] === true || values[i][exCol] === 'TRUE') sh.deleteRow(i + 1);
    }
  });
  return out_({ ok: true, message: 'Example records removed.' });
}

function loadExamples_() {
  const req = sheet_(REQ_SHEET, REQ_HEAD), aps = sheet_(AP_SHEET, AP_HEAD);
  if (findRow_(aps, 'AP01') < 0) aps.appendRow(['AP01', hash_('AP01', '1234'), new Date(), true]);
  const causes = ['keys', 'keys', 'box', 'locks', 'none', 'busy', 'keys', 'doc', 'locks', 'keys', 'isolation', 'box'];
  const mins = [48, 35, 22, 41, 6, 18, 63, 27, 33, 52, 15, 29];
  const types = ['HV PTW', 'LV PTW', 'HV PTW', 'SFT', 'LV PTW', 'HV PTW', 'LV PTW', 'LOA', 'HV PTW', 'LV PTW', 'SFT', 'HV PTW'];
  const start = Date.now() - 3 * 86400000;
  for (let i = 0; i < 12; i++) {
    const id = 'EX-' + (101 + i);
    if (findRow_(req, id) > 0) continue;
    const act = new Date(start + i * 5 * 3600000), iss = new Date(act.getTime() + mins[i] * 60000);
    req.appendRow([id, 'CP' + ('0' + ((i * 3) % 20 + 1)).slice(-2), types[i], 'issued', new Date(act.getTime() - 3600000), act, 'AP01', i % 3 === 0 ? 'site' : 'office', iss, 'AP01', causes[i], mins[i], true]);
  }
  if (findRow_(req, 'EX-113') < 0) req.appendRow(['EX-113', 'CP05', 'HV PTW', 'registered', new Date(), '', '', '', '', '', '', '', true]);
  return out_({ ok: true, message: 'Example records loaded. Sign in as AP01 with PIN 1234 and try EX-113 with CP05. The AP agrees with PIN 1234.' });
}

/* ---------- reads ---------- */
function listRequests_() {
  const values = sheet_(REQ_SHEET, REQ_HEAD).getDataRange().getValues();
  return values.slice(1).filter(v => v[0] !== '').map(v => {
    const o = {};
    REQ_HEAD.forEach((h, i) => { o[h] = v[i] instanceof Date ? v[i].toISOString() : v[i]; });
    o.example = o.example === true || o.example === 'TRUE';
    return o;
  });
}

function listAps_() {
  return sheet_(AP_SHEET, AP_HEAD).getDataRange().getValues().slice(1).filter(v => v[0] !== '').map(v => ({ apNo: v[0], example: v[3] === true || v[3] === 'TRUE' }));
}

/* ---------- helpers ---------- */
function requireOffice_(p) {
  const code = PropertiesService.getScriptProperties().getProperty('OFFICE_PASSCODE');
  if (!code) throw new Error('The office passcode has not been set. See SETUP.md, step 3.');
  if (String(p.passcode || '') !== code) throw new Error('The office passcode is not correct.');
}

function sha_(text) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text);
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}
function salt_() { return PropertiesService.getScriptProperties().getProperty('PIN_SALT') || 'powertec'; }
function hash_(apNo, pin) { return sha_(salt_() + '|' + apNo + '|' + pin); }
function token_(apNo, pinHash) { return sha_('token|' + salt_() + '|' + apNo + '|' + pinHash); }

function findAp_(apNo) {
  if (!apNo) return null;
  const sh = sheet_(AP_SHEET, AP_HEAD);
  const row = findRow_(sh, apNo);
  return row > 0 ? rowObject_(sh, row, AP_HEAD) : null;
}

function sheet_(name, head) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); }
  return sh;
}

function findRow_(sh, key) {
  const values = sh.getRange(1, 1, Math.max(sh.getLastRow(), 1), 1).getValues();
  for (let i = 1; i < values.length; i++) if (String(values[i][0]).toUpperCase() === key) return i + 1;
  return -1;
}

function rowObject_(sh, row, head) {
  const v = sh.getRange(row, 1, 1, head.length).getValues()[0];
  const o = {}; head.forEach((h, i) => o[h] = v[i]); return o;
}

function clean_(s) { return String(s || '').trim().toUpperCase().replace(/\s+/g, ''); }

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return out_({ ok: false, error: 'The system is busy. Try again in a moment.' });
  try { return fn(); } finally { lock.releaseLock(); }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
