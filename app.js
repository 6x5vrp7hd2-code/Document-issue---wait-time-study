/* Powertec Permit Wait-Time Study: page script.
   Talks to the Google Apps Script back end set in config.js. With no apiUrl set it runs
   a demonstration with example data held in the browser only. */
(() => {
  const CFG = window.PT_CONFIG || {};
  const API = String(CFG.apiUrl || '').trim();
  const DEMO = !API;
  const CAUSE = {none:'Nothing, issued straight away',keys:'AP locating keys',box:'Lockout box not available',locks:'Locks not where expected',doc:'Document not prepared',busy:'AP issuing another document',isolation:'Isolation not yet complete',other:'Other'};
  const LOC = {office:'At the AP office',site:'On site'};
  const $ = id => document.getElementById(id);
  const norm = s => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const ms = v => v ? new Date(v).getTime() : 0;
  const fmtT = v => v ? new Date(v).toLocaleString('en-GB', {day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit'}) : '—';
  const fmtDur = m => { if (m == null || isNaN(m)) return '—'; const r = Math.round(m); return r < 60 ? `${r} min` : `${Math.floor(r/60)} h ${String(r%60).padStart(2,'0')} min`; };
  const show = (el, text, kind) => { el.hidden = !text; el.textContent = text || ''; el.className = 'msg ' + (kind || 'info'); };
  const store = { get(k){ try { return sessionStorage.getItem(k); } catch(e){ return null; } }, set(k,v){ try { sessionStorage.setItem(k,v); } catch(e){} } };
  const keep = { get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }, set(k,v){ try { localStorage.setItem(k,v); } catch(e){} } };

  if (CFG.siteName) $('site-name').textContent = ' · ' + CFG.siteName;

  let requests = [], aps = [], current = null, busy = false;
  let passcode = store.get('pt-office-pass') || '';

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
      if (current) current = requests.find(r => r.reqNo === current.reqNo) || null;
      $('status').hidden = !DEMO;
      if (DEMO) show($('status'), 'Demonstration mode: example data only, nothing is saved. Office passcode: demo. Try request EX-113 with CP05, AP01 and PIN 1234.', 'info');
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
    const start = Date.now() - 3*86400000;
    for (let i = 0; i < 12; i++){
      const a = start + i*5*3600000, r = a + mins[i]*60000;
      demo.req.push({reqNo:'EX-'+(101+i), cp:'CP'+String((i*3)%20+1).padStart(2,'0'), docType:types[i], status:'received', registeredAt:new Date(a-3600000).toISOString(), arrivalAt:new Date(a).toISOString(), arrivalAp:'AP01', location:i%3===0?'site':'office', receiptAt:new Date(r).toISOString(), receiptAp:'AP01', cause:causes[i], waitMinutes:mins[i], example:true});
    }
    demo.req.push({reqNo:'EX-113', cp:'CP05', docType:'HV PTW', status:'registered', registeredAt:new Date().toISOString(), example:true});
  })();
  function demoCall(b){
    const office = () => { if (b.passcode !== 'demo') throw new Error('The office passcode is not correct.'); };
    switch (b.action){
      case 'list': return {ok:true, requests: demo.req.map(r => ({...r})), aps: demo.aps.map(a => ({apNo:a.apNo, example:!!a.example}))};
      case 'checkPasscode': office(); return {ok:true};
      case 'register': { office(); const reqNo = norm(b.reqNo), cp = norm(b.cp);
        if (!reqNo || !cp) throw new Error('Enter the request number and the CP number.');
        if (demo.req.some(r => r.reqNo === reqNo)) throw new Error('That request number is already registered.');
        demo.req.push({reqNo, cp, docType:b.docType, status:'registered', registeredAt:new Date().toISOString()}); return {ok:true, message:`${reqNo} registered for ${cp}.`}; }
      case 'setPin': { office(); const apNo = norm(b.apNo), pin = String(b.pin||'').trim();
        if (!apNo || !/^\d{4,6}$/.test(pin)) throw new Error('Enter an AP number and a PIN of 4 to 6 digits.');
        const a = demo.aps.find(x => x.apNo === apNo); if (a) a.pin = pin; else demo.aps.push({apNo, pin}); return {ok:true, message:`PIN saved for ${apNo}.`}; }
      case 'confirm': {
        if (b.together !== true) throw new Error('Both the CP and the AP must confirm they are together.');
        const r = demo.req.find(x => x.reqNo === norm(b.reqNo)); if (!r) throw new Error('No approved request with that number.');
        if (r.cp !== norm(b.cp)) throw new Error('That CP number does not match this request.');
        const a = demo.aps.find(x => x.apNo === norm(b.apNo)); if (!a) throw new Error('That AP number has no PIN set. The AP office sets PINs.');
        if (a.pin !== String(b.pin).trim()) throw new Error('The AP number and PIN do not match.');
        const now = new Date().toISOString();
        if (r.status === 'registered'){ Object.assign(r, {status:'arrived', arrivalAt:now, arrivalAp:a.apNo, location:b.location}); return {ok:true, message:'Ready to receive recorded.'}; }
        if (r.status === 'arrived'){ Object.assign(r, {status:'received', receiptAt:now, receiptAp:a.apNo, cause:b.cause, waitMinutes:(Date.now()-ms(r.arrivalAt))/60000}); return {ok:true, message:'Document signed recorded.'}; }
        throw new Error('This request has already been completed.'); }
      case 'clearExamples': office(); demo.req = demo.req.filter(r => !r.example); demo.aps = demo.aps.filter(a => !a.example); return {ok:true, message:'Example records removed.'};
      case 'loadExamples': office(); return {ok:true, message:'Example records are already loaded in demonstration mode.'};
    }
    throw new Error('Unknown action.');
  }

  /* ---------- views ---------- */
  const views = ['cp','office','results'];
  function route(){
    const v = views.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'cp';
    views.forEach(n => { $('view-'+n).hidden = n !== v; });
    document.querySelectorAll('nav.tabs a').forEach(a => a.setAttribute('aria-current', a.dataset.view === v ? 'page' : 'false'));
  }
  window.addEventListener('hashchange', route); route();
  function render(){ renderOffice(); renderResults(); renderCard(); }

  /* ---------- CP ---------- */
  const params = new URLSearchParams(location.search);
  if (params.get('cp')) $('cp-no').value = norm(params.get('cp'));
  $('cp-open').addEventListener('click', () => {
    const req = norm($('cp-req').value), cp = norm($('cp-no').value), m = $('cp-open-msg');
    if (!req || !cp) return show(m, 'Enter the request number and your CP number.', 'err');
    const r = requests.find(x => x.reqNo === req);
    if (!r) return show(m, 'No approved request with that number. Check the number with the AP office.', 'err');
    if (norm(r.cp) !== cp) return show(m, 'That CP number does not match this request.', 'err');
    m.hidden = true; current = r; $('cp-ap').value = ''; $('cp-pin').value = ''; $('cp-agree').checked = false; $('cp-msg').hidden = true;
    renderCard();
  });
  function renderCard(){
    const r = current; $('cp-card').hidden = !r; if (!r) return;
    $('cp-title').textContent = r.reqNo;
    $('cp-chip').className = 'chip ' + r.status;
    $('cp-chip').textContent = r.status === 'registered' ? 'Approved' : r.status === 'arrived' ? 'CP ready' : 'Signed';
    $('cp-kv').innerHTML = `<dt>Document</dt><dd>${esc(r.docType)}</dd><dt>CP</dt><dd class="mono">${esc(r.cp)}</dd>` +
      (r.arrivalAt ? `<dt>Ready</dt><dd>${fmtT(r.arrivalAt)} · ${esc(LOC[r.location] || '')} · <span class="mono">${esc(r.arrivalAp)}</span></dd>` : '') +
      (r.receiptAt ? `<dt>Signed</dt><dd>${fmtT(r.receiptAt)} · <span class="mono">${esc(r.receiptAp)}</span></dd>` : '');
    const done = r.status === 'received';
    $('cp-step').hidden = done; $('cp-done').hidden = !done;
    if (done){ $('cp-wait').textContent = fmtDur((ms(r.receiptAt) - ms(r.arrivalAt))/60000); $('cp-done-note').textContent = 'Held up by: ' + (CAUSE[r.cause] || '—') + '. Thank you.'; return; }
    const arr = r.status === 'registered';
    $('cp-step-title').textContent = arr ? 'Step 1: ready to receive' : 'Step 2: document signed';
    $('cp-step-help').textContent = arr ? 'Record this when you are with the AP and ready to receive the document, at the office or on site. The AP enters their number and PIN on this phone.' : 'Record this when the document has been signed. The AP enters their number and PIN on this phone.';
    $('cp-loc-wrap').hidden = !arr; $('cp-cause-wrap').hidden = arr;
    $('cp-agree-text').textContent = arr ? 'The CP and the issuing AP are together now, and the CP is ready to receive the document.' : 'The CP and the issuing AP are together now, and the document has just been signed.';
    $('cp-confirm').textContent = arr ? 'Confirm ready to receive' : 'Confirm document signed';
  }
  $('cp-confirm').addEventListener('click', async () => {
    if (busy || !current) return;
    const m = $('cp-msg');
    if (!$('cp-agree').checked) return show(m, 'Both the CP and the AP must confirm they are together. Tick the box.', 'err');
    busy = true; $('cp-confirm').disabled = true; show(m, 'Recording…', 'info');
    try {
      const d = await call({action:'confirm', reqNo:current.reqNo, cp:current.cp, apNo:norm($('cp-ap').value), pin:$('cp-pin').value.trim(), together:true, location:$('cp-loc').value, cause:$('cp-cause').value});
      $('cp-pin').value = ''; $('cp-ap').value = ''; $('cp-agree').checked = false; show(m, d.message || 'Recorded.', 'ok');
      await refresh();
    } catch (e) { show(m, e.message, 'err'); }
    busy = false; $('cp-confirm').disabled = false;
  });

  /* ---------- AP office ---------- */
  function unlocked(){ $('of-login').hidden = !!passcode; $('of-main').hidden = !passcode; }
  unlocked();
  $('of-login-btn').addEventListener('click', async () => {
    const p = $('of-pass').value;
    try { await call({action:'checkPasscode', passcode:p}); passcode = p; store.set('pt-office-pass', p); $('of-pass').value = ''; unlocked(); }
    catch (e) { show($('of-login-msg'), e.message, 'err'); }
  });
  async function officeAction(body, msgEl, btn){
    btn.disabled = true;
    try { const d = await call({...body, passcode}); show(msgEl, d.message || 'Done.', 'ok'); await refresh(); return true; }
    catch (e) { show(msgEl, e.message, 'err'); if (/passcode/i.test(e.message)){ passcode = ''; store.set('pt-office-pass',''); unlocked(); } return false; }
    finally { btn.disabled = false; }
  }
  $('of-add').addEventListener('click', async () => {
    if (await officeAction({action:'register', reqNo:norm($('of-req').value), cp:norm($('of-cp').value), docType:$('of-type').value}, $('of-msg'), $('of-add'))) { $('of-req').value = ''; $('of-cp').value = ''; }
  });
  $('ap-save').addEventListener('click', async () => {
    if (await officeAction({action:'setPin', apNo:norm($('ap-no').value), pin:$('ap-pin').value.trim()}, $('ap-msg'), $('ap-save'))) { $('ap-no').value = ''; $('ap-pin').value = ''; }
  });
  $('ex-load').addEventListener('click', () => officeAction({action:'loadExamples'}, $('ex-msg'), $('ex-load')));
  $('ex-clear').addEventListener('click', () => officeAction({action:'clearExamples'}, $('ex-msg'), $('ex-clear')));
  function renderOffice(){
    const open = requests.filter(r => r.status !== 'received').sort((a,b) => ms(b.registeredAt) - ms(a.registeredAt));
    $('of-list').innerHTML = open.length ? open.map(r => `<div class="item"><span><span class="mono">${esc(r.reqNo)}</span> · ${esc(r.docType)} · <span class="mono">${esc(r.cp)}</span>${r.example ? ' <span class="chip ex">Example</span>' : ''}</span><span class="chip ${r.status}">${r.status === 'registered' ? 'Approved' : 'CP ready'}</span></div>`).join('') : '<p class="muted">No open requests. Register one above.</p>';
    $('ap-list').innerHTML = aps.length ? aps.slice().sort((a,b) => a.apNo < b.apNo ? -1 : 1).map(a => `<div class="item"><span class="mono">${esc(a.apNo)}</span><span class="muted">${a.example ? 'Example PIN 1234' : 'PIN set'}</span></div>`).join('') : '<p class="muted">No PINs set yet.</p>';
  }

  /* ---------- results ---------- */
  ['rs-people','rs-rate'].forEach(id => {
    const saved = keep.get('pt-'+id); if (saved) $(id).value = saved;
    $(id).addEventListener('input', () => { keep.set('pt-'+id, $(id).value); renderResults(); });
  });
  function bars(el, groups){
    const rows = Object.entries(groups).sort((a,b) => b[1].mins - a[1].mins);
    const max = Math.max(1, ...rows.map(([,g]) => g.mins));
    el.innerHTML = rows.length ? rows.map(([k,g]) => `<div class="bar"><span>${esc(k)}</span><small>${g.n} doc${g.n === 1 ? '' : 's'} · ${fmtDur(g.mins)} total · avg ${fmtDur(g.mins/g.n)}</small><div class="track"><div class="fill" style="width:${(g.mins/max*100).toFixed(1)}%"></div></div></div>`).join('') : '<p class="muted">No completed documents yet.</p>';
  }
  function completed(){
    return requests.filter(r => r.status === 'received' && r.arrivalAt && r.receiptAt)
      .map(r => ({...r, mins:(ms(r.receiptAt) - ms(r.arrivalAt))/60000}))
      .sort((a,b) => ms(b.receiptAt) - ms(a.receiptAt));
  }
  function renderResults(){
    const done = completed(), waits = done.map(r => r.mins).sort((a,b) => a-b), n = waits.length;
    const total = waits.reduce((s,x) => s+x, 0);
    const median = n ? (n % 2 ? waits[(n-1)/2] : (waits[n/2-1] + waits[n/2]) / 2) : null;
    const people = Math.max(1, +$('rs-people').value || 1), rate = Math.max(0, +$('rs-rate').value || 0);
    const personHours = total / 60 * people;
    const anyEx = done.some(r => r.example);
    $('rs-stats').innerHTML = [
      [n, 'Documents measured' + (anyEx ? ' (includes examples)' : '')],
      [fmtDur(median), 'Median wait'],
      [fmtDur(n ? total/n : null), 'Average wait'],
      [fmtDur(n ? waits[n-1] : null), 'Longest wait'],
      [personHours.toLocaleString('en-GB', {maximumFractionDigits:1}) + ' h', 'Person-hours spent waiting'],
      ['£' + Math.round(personHours * rate).toLocaleString('en-GB'), 'Estimated cost of waiting']
    ].map(([b,s]) => `<div class="stat"><b>${b}</b><span>${s}</span></div>`).join('');
    const group = (key, map) => done.reduce((acc, r) => { const k = map ? (map[r[key]] || 'Not recorded') : (r[key] || 'Not recorded'); (acc[k] ||= {n:0, mins:0}); acc[k].n++; acc[k].mins += r.mins; return acc; }, {});
    bars($('rs-causes'), group('cause', CAUSE)); bars($('rs-loc'), group('location', LOC)); bars($('rs-type'), group('docType'));
    $('rs-rows').innerHTML = done.length ? done.map(r => `<tr><td class="mono">${esc(r.reqNo)}${r.example ? ' <span class="chip ex">Ex</span>' : ''}</td><td class="mono">${esc(r.cp)}</td><td>${esc(r.docType)}</td><td>${esc(LOC[r.location] || '')}</td><td>${fmtT(r.arrivalAt)}</td><td>${fmtT(r.receiptAt)}</td><td>${fmtDur(r.mins)}</td><td>${esc(CAUSE[r.cause] || '')}</td><td class="mono">${esc(r.receiptAp)}</td></tr>`).join('') : '<tr><td colspan="9" class="muted">No completed documents yet.</td></tr>';
  }
  $('rs-copy').addEventListener('click', () => {
    const csv = ['request,cp,document,where,ready,signed,wait_minutes,held_up_by,ap,example'].concat(completed().map(r => [r.reqNo, r.cp, r.docType, LOC[r.location] || '', r.arrivalAt, r.receiptAt, r.mins.toFixed(1), CAUSE[r.cause] || '', r.receiptAp, r.example ? 'yes' : 'no'].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))).join('\n');
    const m = $('rs-copy-msg');
    if (!navigator.clipboard) return show(m, 'Copying is not available in this browser. The full record is also in the Google Sheet.', 'err');
    navigator.clipboard.writeText(csv).then(() => show(m, 'Copied. Paste into Excel or Google Sheets.', 'ok'), () => show(m, 'Copying was blocked. The full record is also in the Google Sheet.', 'err'));
  });

  render(); refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
