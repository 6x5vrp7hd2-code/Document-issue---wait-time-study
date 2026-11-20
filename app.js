/* Powertec Permit Wait-Time Study: page script.
   Talks to the Google Apps Script back end set in config.js. With no apiUrl set it runs
   a demonstration with example data held in the browser only. */
(() => {
  const CFG = window.PT_CONFIG || {};
  const API = String(CFG.apiUrl || '').trim();
  const DEMO = !API;
  const CAUSE = {none:'Nothing, issued straight away',keys:'Locating keys',box:'Lockout box not available',locks:'Locks not where expected',doc:'Document not prepared',busy:'Issuing another document',isolation:'Isolation not yet complete',other:'Other'};
  const LOC = {office:'At the AP office',site:'On site'};
  const STATUS = {registered:'Approved',active:'Activated',issued:'Issued'};
  const $ = id => document.getElementById(id);
  const norm = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const ms = v => v ? new Date(v).getTime() : 0;
  const fmtT = v => v ? new Date(v).toLocaleString('en-GB', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}) : '—';
  const fmtDur = m => { if (m == null || isNaN(m)) return '—'; const r = Math.round(m); return r < 60 ? `${r} min` : `${Math.floor(r/60)} h ${String(r%60).padStart(2,'0')} min`; };
  const party = r => Math.max(0, parseInt(r.workingParty, 10) || 0);
  const waiting = r => party(r) + 1; // the CP plus his working party
  const show = (el, text, kind) => { el.hidden = !text; el.textContent = text || ''; el.className = 'msg ' + (kind || 'info'); };
  const mkStore = s => ({ get(k){ try { return s().getItem(k); } catch(e){ return null; } }, set(k,v){ try { v ? s().setItem(k,v) : s().removeItem(k); } catch(e){} } });
  const session = mkStore(() => sessionStorage), keep = mkStore(() => localStorage);

  if (CFG.siteName) $('site-name').textContent = ' · ' + CFG.siteName;

  let requests = [], aps = [], currentNo = null, pending = null, busy = false; // pending: CP has pressed Complete, waiting for the AP to agree
  let passcode = session.get('pt-office-pass') || '';
  let me = null; try { me = JSON.parse(keep.get('pt-ap') || 'null'); } catch(e) {}

  /* ---------- back end ---------- */
  async function call(body){
    if (DEMO) return demoCall(body);
    const res = await fetch(API, { method:'POST', body: JSON.stringify(body) }); // text/plain: no CORS preflight
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'The request failed.');
    return data;
  }
  async function refresh(){
    try {
      const d = DEMO ? demoCall({action:'list'}) : await (await fetch(API + '?action=list')).json();
      if (!d.ok) throw new Error(d.error);
      requests = d.requests; aps = d.aps;
      if (DEMO) show($('status'), 'Demonstration mode: example data only, nothing is saved. Sign in as AP01 with PIN 1234 and open EX-113; the CP number is CP05 and the AP agrees with PIN 1234. Office passcode: demo.', 'info');
      else $('status').hidden = true;
      render();
    } catch (e) {
      show($('status'), 'The study record could not be reached. Check the connection; the page will try again.', 'err');
    }
  }

  /* ---------- demonstration back end (browser only) ---------- */
  const demo = { req: [], aps: [{apNo:'AP01', pin:'1234', example:true}] };
  (function seed(){
    const causes = ['keys','keys','box','locks','none','busy','keys','doc','locks','keys','isolation','box'];
    const mins = [48,35,22,41,6,18,63,27,33,52,15,29];
    const types = ['HV PTW','LV PTW','HV PTW','SFT','LV PTW','HV PTW','LV PTW','LOA','HV PTW','LV PTW','SFT','HV PTW'];
    const party = [3,2,4,1,2,5,3,0,4,2,1,3];
    const start = Date.now() - 3*86400000;
    for (let i = 0; i < 12; i++){
      const a = start + i*5*3600000, r = a + mins[i]*60000;
      demo.req.push({reqNo:'EX-'+(101+i), cp:'CP'+String((i*3)%20+1).padStart(2,'0'), docType:types[i], workingParty:party[i], status:'issued', registeredAt:new Date(a-3600000).toISOString(), activatedAt:new Date(a).toISOString(), activatedBy:'AP01', location:i%3===0?'site':'office', issuedAt:new Date(r).toISOString(), issuedBy:'AP01', cause:causes[i], waitMinutes:mins[i], example:true});
    }
    demo.req.push({reqNo:'EX-113', cp:'CP05', docType:'HV PTW', workingParty:3, status:'registered', registeredAt:new Date().toISOString(), example:true});
  })();
  function demoCall(b){
    const office = () => { if (b.passcode !== 'demo') throw new Error('The office passcode is not correct.'); };
    const ap = () => { const a = demo.aps.find(x => x.apNo === norm(b.apNo)); if (!a || b.token !== 'demo-' + a.apNo + '-' + a.pin) throw new Error('Sign in again with your AP number and PIN.'); return a.apNo; };
    switch (b.action){
      case 'list': return {ok:true, requests: demo.req.map(r => ({...r})), aps: demo.aps.map(a => ({apNo:a.apNo, example:!!a.example}))};
      case 'checkPasscode': office(); return {ok:true};
      case 'apLogin': { const a = demo.aps.find(x => x.apNo === norm(b.apNo)); if (!a || a.pin !== String(b.pin).trim()) throw new Error('The AP number and PIN do not match.'); return {ok:true, apNo:a.apNo, token:'demo-' + a.apNo + '-' + a.pin}; }
      case 'register': { office(); const reqNo = norm(b.reqNo), cp = norm(b.cp);
        if (!reqNo || !cp) throw new Error('Enter the request number and the CP number.');
        if (!/^\d{1,3}$/.test(String(b.workingParty ?? '').trim())) throw new Error('Enter the number of people in the working party, not counting the CP (0 if the CP is working alone).');
        if (demo.req.some(r => r.reqNo === reqNo)) throw new Error('That request number is already registered.');
        demo.req.push({reqNo, cp, docType:b.docType, workingParty:+b.workingParty, status:'registered', registeredAt:new Date().toISOString()}); return {ok:true, message:`${reqNo} registered for ${cp} with a working party of ${+b.workingParty}.`}; }
      case 'setPin': { office(); const apNo = norm(b.apNo), pin = String(b.pin||'').trim();
        if (!apNo || !/^\d{4,6}$/.test(pin)) throw new Error('Enter an AP number and a PIN of 4 to 6 digits.');
        const a = demo.aps.find(x => x.apNo === apNo); if (a) a.pin = pin; else demo.aps.push({apNo, pin}); return {ok:true, message:`PIN saved for ${apNo}.`}; }
      case 'activate': case 'issue': {
        const apNo = ap();
        const r = demo.req.find(x => x.reqNo === norm(b.reqNo)); if (!r) throw new Error('No approved request with that number.');
        if (!norm(b.cp)) throw new Error('The CP must enter his CP number.');
        if (r.cp !== norm(b.cp)) throw new Error('That CP number does not match this request.');
        const now = new Date().toISOString();
        if (b.action === 'activate'){
          if (r.status !== 'registered') throw new Error(r.status === 'active' ? 'This document is already activated.' : 'This document has already been issued.');
          Object.assign(r, {status:'active', activatedAt:now, activatedBy:apNo, location:b.location}); return {ok:true, message:`${r.reqNo} activated. The clock has started.`};
        }
        if (r.status !== 'active') throw new Error(r.status === 'registered' ? 'Activate this document first.' : 'This document has already been issued.');
        if (demo.aps.find(x => x.apNo === apNo).pin !== String(b.pin || '').trim()) throw new Error('Your PIN is not correct. The AP must agree with his PIN.');
        Object.assign(r, {status:'issued', issuedAt:now, issuedBy:apNo, cause:b.cause || 'none', waitMinutes:(Date.now()-ms(r.activatedAt))/60000}); return {ok:true, message:`${r.reqNo} issued. The clock has stopped.`}; }
      case 'clearExamples': office(); demo.req = demo.req.filter(r => !r.example); demo.aps = demo.aps.filter(a => !a.example); return {ok:true, message:'Example records removed.'};
      case 'loadExamples': office(); return {ok:true, message:'Example records are already loaded in demonstration mode.'};
    }
    throw new Error('Unknown action.');
  }

  /* ---------- views ---------- */
  const views = ['ap','office','results'];
  function route(){
    const v = views.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'ap';
    views.forEach(n => { $('view-'+n).hidden = n !== v; });
    document.querySelectorAll('nav.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.view === v ? 'page' : 'false'));
  }
  window.addEventListener('hashchange', route); route();
  function render(){ renderAp(); renderOffice(); renderResults(); }

  /* ---------- AP: issue ---------- */
  function signedIn(){ $('ap-login').hidden = !!me; $('ap-main').hidden = !me; if (me) $('ap-me').textContent = me.apNo; }
  signedIn();
  $('ap-login-btn').addEventListener('click', async () => {
    try {
      const d = await call({action:'apLogin', apNo:norm($('ap-login-no').value), pin:$('ap-login-pin').value.trim()});
      me = {apNo:d.apNo, token:d.token}; keep.set('pt-ap', JSON.stringify(me));
      $('ap-login-pin').value = ''; $('ap-login-msg').hidden = true; signedIn(); render();
    } catch (e) { show($('ap-login-msg'), e.message, 'err'); }
  });
  function signOut(){ me = null; keep.set('pt-ap', ''); currentNo = null; pending = null; signedIn(); render(); }
  $('ap-out').addEventListener('click', e => { e.preventDefault(); signOut(); });

  function openReq(no){
    const m = $('ap-open-msg'), r = requests.find(x => x.reqNo === no);
    if (!no) return show(m, 'Enter the request number.', 'err');
    if (!r) return show(m, 'No approved request with that number. Check it with the AP office.', 'err');
    m.hidden = true; currentNo = no; pending = null; $('ap-msg').hidden = true; $('ap-req').value = '';
    renderAp(); $('ap-card').scrollIntoView({behavior:'smooth', block:'start'});
  }
  $('ap-open').addEventListener('click', () => openReq(norm($('ap-req').value)));
  $('ap-req').addEventListener('keydown', e => { if (e.key === 'Enter') openReq(norm($('ap-req').value)); });
  $('ap-active').addEventListener('click', e => { const b = e.target.closest('[data-req]'); if (b) openReq(b.dataset.req); });

  function renderAp(){
    const act = requests.filter(r => r.status === 'active').sort((a,b) => ms(a.activatedAt) - ms(b.activatedAt));
    $('ap-active').innerHTML = act.length ? act.map(r => `<button class="item pick" data-req="${esc(r.reqNo)}"><span><span class="mono">${esc(r.reqNo)}</span> · ${esc(r.docType)} · <span class="mono">${esc(r.cp)}</span></span><span class="muted">${fmtDur((Date.now() - ms(r.activatedAt))/60000)} · ${esc(r.activatedBy)}</span></button>`).join('') : '<p class="muted">None.</p>';
    const r = requests.find(x => x.reqNo === currentNo);
    $('ap-card').hidden = !r; if (!r) return;
    $('ap-title').textContent = r.reqNo;
    $('ap-chip').className = 'chip ' + r.status; $('ap-chip').textContent = STATUS[r.status] || r.status;
    $('ap-kv').innerHTML = `<dt>Document</dt><dd>${esc(r.docType)}</dd><dt>CP</dt><dd class="mono">${esc(r.cp)}</dd><dt>Waiting</dt><dd>${waiting(r)} (CP + ${party(r)})</dd>` +
      (r.activatedAt ? `<dt>Activated</dt><dd>${fmtT(r.activatedAt)} · ${esc(LOC[r.location] || '')} · <span class="mono">${esc(r.activatedBy)}</span></dd>` : '') +
      (r.issuedAt ? `<dt>Issued</dt><dd>${fmtT(r.issuedAt)} · <span class="mono">${esc(r.issuedBy)}</span></dd>` : '');
    const done = r.status === 'issued', reg = r.status === 'registered';
    $('ap-step').hidden = done; $('ap-done').hidden = !done;
    if (done){ $('ap-wait').textContent = fmtDur((ms(r.issuedAt) - ms(r.activatedAt))/60000); return; }
    $('ap-loc-wrap').hidden = !reg; $('ap-cause-wrap').hidden = reg;
    $('ap-cp-wrap').hidden = !!pending; $('ap-agree-wrap').hidden = !pending;
    $('ap-cp-title').textContent = reg ? 'CP: activate' : 'CP: complete';
    $('ap-cp-help').textContent = reg ? 'You are here to receive this document. Enter your CP number and press Activate. The clock starts.' : 'Once the document has been issued to you, enter your CP number and press Complete. The AP then agrees.';
    $('ap-cp-ok').textContent = reg ? 'Activate' : 'Complete';
  }
  async function send(body){
    busy = true; show($('ap-msg'), 'Recording…', 'info');
    try {
      const d = await call({...body, apNo:me.apNo, token:me.token, reqNo:currentNo});
      pending = null; $('ap-cp').value = ''; $('ap-agree-pin').value = ''; $('ap-cause').value = 'none';
      show($('ap-msg'), d.message, 'ok'); await refresh();
    } catch (e) {
      show($('ap-msg'), e.message, 'err');
      if (/sign in again/i.test(e.message)) signOut();
    }
    busy = false;
  }
  function cpOk(){
    if (busy || !me) return;
    const r = requests.find(x => x.reqNo === currentNo); if (!r) return;
    const cp = norm($('ap-cp').value);
    if (!cp) return show($('ap-msg'), 'Enter your CP number.', 'err');
    if (r.status === 'registered') return send({action:'activate', cp, location:$('ap-loc').value});
    if (norm(r.cp) !== cp) return show($('ap-msg'), 'That CP number does not match this request.', 'err');
    pending = {cp, cause:$('ap-cause').value}; $('ap-msg').hidden = true; renderAp(); $('ap-agree-pin').focus();
  }
  function agreeOk(){
    if (busy || !me || !pending) return;
    const pin = $('ap-agree-pin').value.trim();
    if (!pin) return show($('ap-msg'), 'Enter your PIN to agree.', 'err');
    send({action:'issue', cp:pending.cp, cause:pending.cause, pin});
  }
  $('ap-cp-ok').addEventListener('click', cpOk);
  $('ap-cp').addEventListener('keydown', e => { if (e.key === 'Enter') cpOk(); });
  $('ap-agree-ok').addEventListener('click', agreeOk);
  $('ap-agree-pin').addEventListener('keydown', e => { if (e.key === 'Enter') agreeOk(); });
  $('ap-agree-back').addEventListener('click', () => { pending = null; $('ap-agree-pin').value = ''; renderAp(); });

  /* ---------- AP office ---------- */
  function unlocked(){ $('of-login').hidden = !!passcode; $('of-main').hidden = !passcode; }
  unlocked();
  $('of-login-btn').addEventListener('click', async () => {
    const p = $('of-pass').value;
    try { await call({action:'checkPasscode', passcode:p}); passcode = p; session.set('pt-office-pass', p); $('of-pass').value = ''; $('of-login-msg').hidden = true; unlocked(); }
    catch (e) { show($('of-login-msg'), e.message, 'err'); }
  });
  async function officeAction(body, msgEl, btn){
    btn.disabled = true;
    try { const d = await call({...body, passcode}); show(msgEl, d.message || 'Done.', 'ok'); await refresh(); return true; }
    catch (e) { show(msgEl, e.message, 'err'); if (/passcode/i.test(e.message)){ passcode = ''; session.set('pt-office-pass',''); unlocked(); } return false; }
    finally { btn.disabled = false; }
  }
  $('of-add').addEventListener('click', async () => {
    if (await officeAction({action:'register', reqNo:norm($('of-req').value), cp:norm($('of-cp').value), docType:$('of-type').value, workingParty:$('of-party').value.trim()}, $('of-msg'), $('of-add'))) { $('of-req').value = ''; $('of-cp').value = ''; $('of-party').value = ''; $('of-req').focus(); }
  });
  $('ap-save').addEventListener('click', async () => {
    if (await officeAction({action:'setPin', apNo:norm($('ap-no').value), pin:$('ap-pin').value.trim()}, $('ap-msg2'), $('ap-save'))) { $('ap-no').value = ''; $('ap-pin').value = ''; }
  });
  $('ex-load').addEventListener('click', () => officeAction({action:'loadExamples'}, $('ex-msg'), $('ex-load')));
  $('ex-clear').addEventListener('click', () => officeAction({action:'clearExamples'}, $('ex-msg'), $('ex-clear')));
  function renderOffice(){
    const open = requests.filter(r => r.status !== 'issued').sort((a,b) => ms(b.registeredAt) - ms(a.registeredAt));
    $('of-list').innerHTML = open.length ? open.map(r => `<div class="item"><span><span class="mono">${esc(r.reqNo)}</span> · ${esc(r.docType)} · <span class="mono">${esc(r.cp)}</span> + ${party(r)}${r.example ? ' <span class="chip ex">Example</span>' : ''}</span><span class="chip ${r.status}">${STATUS[r.status]}</span></div>`).join('') : '<p class="muted">No open requests. Register one above.</p>';
    $('ap-list').innerHTML = aps.length ? aps.slice().sort((a,b) => a.apNo < b.apNo ? -1 : 1).map(a => `<div class="item"><span class="mono">${esc(a.apNo)}</span><span class="muted">${a.example ? 'Example PIN 1234' : 'PIN set'}</span></div>`).join('') : '<p class="muted">No PINs set yet.</p>';
  }

  /* ---------- results ---------- */
  ['rs-rate'].forEach(id => {
    const saved = keep.get('pt-'+id); if (saved) $(id).value = saved;
    $(id).addEventListener('input', () => { keep.set('pt-'+id, $(id).value); renderResults(); });
  });
  function bars(el, groups){
    const rows = Object.entries(groups).sort((a,b) => b[1].mins - a[1].mins);
    const max = Math.max(1, ...rows.map(([,g]) => g.mins));
    el.innerHTML = rows.length ? rows.map(([k,g]) => `<div class="bar"><span>${esc(k)}</span><small>${g.n} doc${g.n === 1 ? '' : 's'} · ${fmtDur(g.mins)} total · avg ${fmtDur(g.mins/g.n)} · ${g.ph.toLocaleString('en-GB', {maximumFractionDigits:1})} person-h</small><div class="track"><div class="fill" style="width:${(g.mins/max*100).toFixed(1)}%"></div></div></div>`).join('') : '<p class="muted">No issued documents yet.</p>';
  }
  function completed(){
    return requests.filter(r => r.status === 'issued' && r.activatedAt && r.issuedAt)
      .map(r => ({...r, mins:(ms(r.issuedAt) - ms(r.activatedAt))/60000}))
      .sort((a,b) => ms(b.issuedAt) - ms(a.issuedAt));
  }
  function renderResults(){
    const done = completed(), waits = done.map(r => r.mins).sort((a,b) => a-b), n = waits.length;
    const total = waits.reduce((s,x) => s+x, 0);
    const median = n ? (n % 2 ? waits[(n-1)/2] : (waits[n/2-1] + waits[n/2]) / 2) : null;
    const rate = Math.max(0, +$('rs-rate').value || 0);
    const personHours = done.reduce((s, r) => s + r.mins * waiting(r), 0) / 60;
    const anyEx = done.some(r => r.example);
    $('rs-stats').innerHTML = [
      [n, 'Documents measured' + (anyEx ? ' (includes examples)' : '')],
      [fmtDur(median), 'Median wait'],
      [fmtDur(n ? total/n : null), 'Average wait'],
      [fmtDur(n ? waits[n-1] : null), 'Longest wait'],
      [personHours.toLocaleString('en-GB', {maximumFractionDigits:1}) + ' h', 'Person-hours spent waiting'],
      ['£' + Math.round(personHours * rate).toLocaleString('en-GB'), 'Estimated cost of waiting']
    ].map(([b,s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');
    const group = (key, map) => done.reduce((acc, r) => { const k = map ? (map[r[key]] || 'Not recorded') : (r[key] || 'Not recorded'); (acc[k] ||= {n:0, mins:0}); acc[k].n++; acc[k].mins += r.mins; acc[k].ph = (acc[k].ph || 0) + r.mins * waiting(r) / 60; return acc; }, {});
    bars($('rs-causes'), group('cause', CAUSE)); bars($('rs-loc'), group('location', LOC)); bars($('rs-type'), group('docType'));
    $('rs-rows').innerHTML = done.length ? done.map(r => `<tr><td class="mono">${esc(r.reqNo)}${r.example ? ' <span class="chip ex">Ex</span>' : ''}</td><td class="mono">${esc(r.cp)}</td><td>${esc(r.docType)}</td><td>${esc(LOC[r.location] || '')}</td><td>${waiting(r)}</td><td>${fmtT(r.activatedAt)}</td><td>${fmtT(r.issuedAt)}</td><td>${fmtDur(r.mins)}</td><td>${esc(CAUSE[r.cause] || '')}</td><td class="mono">${esc(r.issuedBy)}</td></tr>`).join('') : '<tr><td colspan="10" class="muted">No issued documents yet.</td></tr>';
  }
  $('rs-copy').addEventListener('click', () => {
    const csv = ['request,cp,working_party,people_waiting,document,where,activated,issued,wait_minutes,person_hours,held_up_by,ap,example'].concat(completed().map(r => [r.reqNo, r.cp, party(r), waiting(r), r.docType, LOC[r.location] || '', r.activatedAt, r.issuedAt, r.mins.toFixed(1), (r.mins * waiting(r) / 60).toFixed(2), CAUSE[r.cause] || '', r.issuedBy, r.example ? 'yes' : 'no'].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))).join('\n');
    const m = $('rs-copy-msg');
    if (!navigator.clipboard) return show(m, 'Copying is not available in this browser. The full record is also in the Google Sheet.', 'err');
    navigator.clipboard.writeText(csv).then(() => show(m, 'Copied. Paste into Excel or Google Sheets.', 'ok'), () => show(m, 'Copying was blocked. The full record is also in the Google Sheet.', 'err'));
  });

  render(); refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
