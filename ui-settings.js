(() => {
  function whenWebbleReady(fn){
    if (window.webble && window.webble.__ready) { fn(); return; }
    const iv = setInterval(() => {
      if (window.webble && window.webble.__ready) { clearInterval(iv); fn(); }
    }, 50);
    setTimeout(() => clearInterval(iv), 5000);
  }

  function bindWithWebble(){
    // -------------------- Settings DOM --------------------
    const led = document.getElementById('led');
    const useFil = document.getElementById('useFil');
    const motorVal = document.getElementById('motorVal');
    const motorMinus = document.getElementById('motorMinus');
    const motorPlus  = document.getElementById('motorPlus');
    const dir = document.getElementById('dir');
    const hs = document.getElementById('hs');
    const autoStop = document.getElementById('autoStop');
    const jin = document.getElementById('jin');
    const wgt = document.getElementById('wgt');
    const fan = document.getElementById('fan');
    const fanAlways = document.getElementById('fanAlways');
    const speed = document.getElementById('speed');
    const speedVal = document.getElementById('speedVal');

    const durVal = document.getElementById('durVal');
    const durMinus = document.getElementById('durMinus');
    const durPlus  = document.getElementById('durPlus');

    // Servo UI
    const servoSettingsGroup = document.getElementById('servoSettingsGroup');
    const servoCalBtn = document.getElementById('servoCalBtn');
    const servoStepMinus = document.getElementById('servoStepMinus');
    const servoStepPlus  = document.getElementById('servoStepPlus');
    const servoStepVal   = document.getElementById('servoStepVal');

    // Servo modal
    const servoModalBackdrop = document.getElementById('servoModalBackdrop');
    const servoModalClose    = document.getElementById('servoModalClose');
    const servoSideL         = document.getElementById('servoSideL');
    const servoSideR         = document.getElementById('servoSideR');
    const servoArrowLeft     = document.getElementById('servoArrowLeft');
    const servoArrowRight    = document.getElementById('servoArrowRight');
    const servoAngleText     = document.getElementById('servoAngleText');
    const servoHomeSetting   = document.getElementById('servoHomeSetting');
    const servoSideSegment   = document.getElementById('servoSideSegment');
    const servoSideIndicator = document.getElementById('servoSideIndicator');

    // -------------------- Helpers --------------------
    const uiEditing = new Set();
    const beginUI = (key) => { uiEditing.add(key); try { window.webble.beginEdit(key); } catch(_){} };
    const endUI   = (key) => { uiEditing.delete(key); try { window.webble.commitEdit(key); } catch(_){} };
    const isUIEditing = (key) => uiEditing.has(key);

    // -------------------- Connectivity-safe setters --------------------
    // The Settings UI should stay interactive even when disconnected.
    // We queue outgoing writes and flush them on the next successful connection.
    const queuedWrites = new Map();
    function isConnectedNow(){
      try { return window.webble?.getState?.().connected === true; } catch(_) { return false; }
    }
    function runOrQueue(key, fn){
      if (isConnectedNow()) {
        try { fn(); } catch(e) { console.warn('Setting write failed:', key, e); }
        return;
      }
      queuedWrites.set(key, fn);
    }
    try {
      window.webble.on('connected', () => {
        try {
          // Flush last-write-wins.
          const entries = Array.from(queuedWrites.entries());
          queuedWrites.clear();
          for (const [, fn] of entries) {
            try { fn(); } catch(_) {}
          }
        } catch(_) {}
      });
    } catch(_) {}

    const pending = new Map();
    function setPending(key, val, ms = 900) {
      pending.set(key, { val: String(val), until: Date.now() + ms });
    }
    function shouldApply(key, incomingVal) {
      const p = pending.get(key);
      if (!p) return true;
      if (Date.now() > p.until) { pending.delete(key); return true; }
      if (String(incomingVal) === p.val) { pending.delete(key); return true; }
      return false;
    }

    function bindSlider(el, key, setter, onLocal){
      if (!el) return;
      el.addEventListener('pointerdown', () => beginUI(key));
      if (onLocal) el.addEventListener('input', e => onLocal(e.target.value));
      const commit = (v) => { try { runOrQueue(key, () => setter(v)); } finally { endUI(key); } };
      el.addEventListener('pointerup',   e => commit(e.target.value));
      el.addEventListener('change',      e => commit(e.target.value));
      el.addEventListener('pointercancel', () => endUI(key));
      el.addEventListener('keyup', (e)=>{ if(e.key==='Enter' || e.key===' ') commit(e.target.value); });
    }
    function bindCheckbox(el, key, setter){
      if (!el) return;
      el.addEventListener('pointerdown', () => beginUI(key));
      el.addEventListener('change', e => { try { runOrQueue(key, () => setter(e.target.checked)); } finally { endUI(key); } });
      el.addEventListener('pointercancel', () => endUI(key));
      el.addEventListener('keyup', (e)=>{ if(e.key==='Enter' || e.key===' ') { try { runOrQueue(key, () => setter(el.checked)); } finally { endUI(key); } } });
      el.addEventListener('blur', () => { if (uiEditing.has(key)) endUI(key); });
    }
    function bindSelect(el, key, setter){
      if (!el) return;
      el.addEventListener('pointerdown', () => beginUI(key));
      el.addEventListener('focusin',   () => beginUI(key));
      el.addEventListener('change',    e => { try { runOrQueue(key, () => setter(e.target.value)); } finally { endUI(key); } });
      el.addEventListener('blur',      () => { if (uiEditing.has(key)) endUI(key); });
    }

    function clampPow(v){
      v = Number(v);
      if (!Number.isFinite(v)) return 100;
      return Math.max(80, Math.min(120, Math.round(v / 10) * 10));
    }

    function clampDur(v){
      v = Number(v);
      if (!Number.isFinite(v)) return 895;
      v = Math.round(v);
      return Math.max(10, Math.min(60 * 180, v)); // 10s .. 180m
    }

    function fmtDur(sec){
      const s = clampDur(sec);
      const m = Math.floor(s / 60);
      const r = s % 60;
      return String(m).padStart(2,'0') + 'm ' + String(r).padStart(2,'0') + 's';
    }

    function fmtMm(v){
      const n = Number(v);
      if (!Number.isFinite(n)) return '– mm';
      return n.toFixed(2) + ' mm';
    }

    function isRespoolerProFromState(st){
      try {
        const did = (st && Object.prototype.hasOwnProperty.call(st, 'didReceiveBoardVariant')) ? !!st.didReceiveBoardVariant : false;
        const raw = String(st?.boardVariant || '').trim().toUpperCase();
        return did && raw === 'PRO';
      } catch (_) {
        return false;
      }
    }

    function setServoSettingsEnabled(enabled){
      const on = !!enabled;
      if (servoSettingsGroup) {
        servoSettingsGroup.classList.toggle('is-disabled', !on);
        servoSettingsGroup.setAttribute('aria-disabled', on ? 'false' : 'true');
      }
      // Also set disabled attributes for accessibility (overlay already blocks pointer events)
      if (servoCalBtn) servoCalBtn.disabled = !on;
      if (servoStepMinus) servoStepMinus.disabled = !on;
      if (servoStepPlus) servoStepPlus.disabled = !on;
      if (servoHomeSetting) servoHomeSetting.disabled = !on;
      ['spoolSelect','spoolWidth','spoolName','spoolSaveBtn','spoolDelBtn','guideTravel','guideTravelBtn']
        .forEach(id => { const el = document.getElementById(id); if (el) el.disabled = !on; });
    }

    // -------------------- Bind settings controls --------------------
    bindSlider(led,   'LED',     (v)=>window.webble.setLED(v));
    bindCheckbox(useFil,'USE_FIL',(on)=>window.webble.setUseFil(on));
    bindCheckbox(dir, 'DIR',     (on)=>window.webble.setDir(on));
    bindCheckbox(hs,  'HS',      (on)=>window.webble.setHighSpeed(on));

    bindSelect(autoStop, 'TRQ', (v) => { setPending('TRQ', v); window.webble.setTorque(v); });
    bindSelect(jin,      'JIN', (v) => { setPending('JIN', v); window.webble.setJingle(v); });
    bindSelect(wgt,      'WGT', (v) => { setPending('WGT', v); window.webble.setTargetWeight(v); });

    bindSlider(fan,   'FAN_SPD', (v)=>window.webble.setFanSpeed(v));
    bindCheckbox(fanAlways,'FAN_ALW',(on)=>window.webble.setFanAlways(on));
    bindSlider(speed, 'SPD',     (v)=>window.webble.setSpeed(v), (v)=>{ if (speedVal) speedVal.textContent = v + ' %'; });

    // Servo home position
    if (servoHomeSetting) {
      bindSelect(servoHomeSetting, 'SV_HOME', (v) => {
        setPending('SV_HOME', v);
        window.webble.setServoHome(v);
      });
    }

    // Motor strength +/- buttons
    let motorLocal = 100;
    function updateMotorUI(){
      if (motorVal) motorVal.textContent = String(motorLocal) + ' %';
    }
    function commitMotor(){
      beginUI('POW');
      try { runOrQueue('POW', () => window.webble.setPower(motorLocal)); } finally { endUI('POW'); }
    }
    updateMotorUI();

    if (motorMinus) motorMinus.addEventListener('click', () => {
      motorLocal = clampPow(motorLocal - 10);
      updateMotorUI();
      commitMotor();
    });
    if (motorPlus) motorPlus.addEventListener('click', () => {
      motorLocal = clampPow(motorLocal + 10);
      updateMotorUI();
      commitMotor();
    });

    // Reference Time (calibration time at 80) — DUR in seconds
    let durLocal = 895;
    function updateDurUI(){
      if (durVal) durVal.textContent = fmtDur(durLocal);
    }
    function commitDur(){
      beginUI('DUR');
      try {
        setPending('DUR', durLocal);
        runOrQueue('DUR', () => window.webble.setDurationAt80(durLocal));
      } finally {
        endUI('DUR');
      }
    }
    updateDurUI();

    const durDelta = 5; // seconds per click
    if (durMinus) durMinus.addEventListener('click', () => {
      durLocal = clampDur(durLocal - durDelta);
      updateDurUI();
      commitDur();
    });
    if (durPlus) durPlus.addEventListener('click', () => {
      durLocal = clampDur(durLocal + durDelta);
      updateDurUI();
      commitDur();
    });

    // -------------------- Servo modal (settings UI) --------------------
    function openServoModal(){
      if (!servoModalBackdrop) return;

      // Show first so setSide() can optionally move the servo only while the modal is open
      servoModalBackdrop.classList.add('show');

      // When opening, align modal picker with current Home Position
      try {
        const hv = (servoHomeSetting && servoHomeSetting.value)
          ? String(servoHomeSetting.value).trim().toUpperCase()
          : null;
        if (hv === 'R' || hv === 'L') {
          setSide(hv);
        }
      } catch(_) {}
    }

    function closeServoModal(){
      if (!servoModalBackdrop) return;
      servoModalBackdrop.classList.remove('show');

      // When closing, return servo to Home position
      try {
        if (window.webble && typeof window.webble.servoGoto === 'function') {
          window.webble.servoGoto('HOME');
        }
      } catch(_) {}
    }

    if (servoCalBtn) {
      servoCalBtn.addEventListener('click', () => {
        // Only allow opening calibration on Respooler Pro
        if (servoSettingsGroup?.classList?.contains('is-disabled')) return;
        openServoModal();
      });
    }
    if (servoModalClose) servoModalClose.addEventListener('click', closeServoModal);
    if (servoModalBackdrop) {
      servoModalBackdrop.addEventListener('click', (e) => {
        if (e.target === servoModalBackdrop) closeServoModal();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeServoModal();
    });

    // Step distance +/- buttons
    let servoStepLocal = 1.75;
    function updateServoStepUI(){
      if (servoStepVal) servoStepVal.textContent = fmtMm(servoStepLocal);
    }
    updateServoStepUI();

    const stepDelta = 0.01;
    const stepMin = 0.05;
    const stepMax = 20.0;

    function commitServoStep(){
      beginUI('SV_STP');
      try { runOrQueue('SV_STP', () => window.webble.setServoStepMm(servoStepLocal)); } finally { endUI('SV_STP'); }
    }

    if (servoStepMinus) servoStepMinus.addEventListener('click', () => {
      servoStepLocal = Math.max(stepMin, +(servoStepLocal - stepDelta).toFixed(2));
      updateServoStepUI();
      commitServoStep();
    });
    if (servoStepPlus) servoStepPlus.addEventListener('click', () => {
      servoStepLocal = Math.min(stepMax, +(servoStepLocal + stepDelta).toFixed(2));
      updateServoStepUI();
      commitServoStep();
    });

    // Servo calibration (segmented + arrows)
    let calSide = 'L'; // 'L' or 'R'
    let angleL = 175;
    let angleR = 5;

    function setSide(side){
      calSide = (side === 'R') ? 'R' : 'L';

      // Only move the servo when the calibration modal is open.
      // This prevents an initial queued "goto L" that would run right after connecting.
      try {
        const modalOpen = !!servoModalBackdrop && servoModalBackdrop.classList.contains('show');
        if (modalOpen && window.webble && typeof window.webble.servoGoto === 'function') {
          runOrQueue('SV_GOTO', () => window.webble.servoGoto(calSide));
        }
      } catch(_) {}

      if (servoSideL) {
        const on = calSide === 'L';
        servoSideL.classList.toggle('is-selected', on);
        servoSideL.setAttribute('aria-selected', on ? 'true' : 'false');
      }
      if (servoSideR) {
        const on = calSide === 'R';
        servoSideR.classList.toggle('is-selected', on);
        servoSideR.setAttribute('aria-selected', on ? 'true' : 'false');
      }

      if (servoSideIndicator) {
        const index = (calSide === 'L') ? 0 : 1;
        servoSideIndicator.style.transform = `translateX(${index * 100}%)`;
      }

      updateAngleText();
    }

    function updateAngleText(){
      const v = (calSide === 'L') ? angleL : angleR;
      if (servoAngleText) servoAngleText.textContent = `Angle: ${Math.round(v)}°`;
    }

    function commitAngle(){
      if (calSide === 'L') {
        beginUI('SV_L');
        try { runOrQueue('SV_L', () => window.webble.setServoAngleL(angleL)); } finally { endUI('SV_L'); }
      } else {
        beginUI('SV_R');
        try { runOrQueue('SV_R', () => window.webble.setServoAngleR(angleR)); } finally { endUI('SV_R'); }
      }
    }

    function nudgeAngle(delta){
      if (calSide === 'L') {
        angleL = Math.max(0, Math.min(180, Math.round(angleL + delta)));
      } else {
        angleR = Math.max(0, Math.min(180, Math.round(angleR + delta)));
      }
      updateAngleText();
      commitAngle();
    }

    if (servoSideL) servoSideL.addEventListener('click', () => setSide('L'));
    if (servoSideR) servoSideR.addEventListener('click', () => setSide('R'));
    if (servoArrowLeft)  servoArrowLeft.addEventListener('click', () => nudgeAngle(+1));
    if (servoArrowRight) servoArrowRight.addEventListener('click', () => nudgeAngle(-1));

    // Initialize
    setSide('L');

    // -------------------- Spool tools (pzgz firmware) --------------------
    // Presets (name + end stops + inner width) live on the board; each spool + adapter combination is
    // calibrated once with "Calibrate End Positions" and saved. "Measured Travel" calibrates how far the
    // guide moves per servo degree, which makes the step distance exact. Inner width minus guide travel
    // ("clearance") is shown as a check that the end stops sit at the flanges.
    const spoolTools     = document.getElementById('spoolTools');
    const spoolSelect    = document.getElementById('spoolSelect');
    const spoolWidth     = document.getElementById('spoolWidth');
    const spoolName      = document.getElementById('spoolName');
    const spoolSaveBtn   = document.getElementById('spoolSaveBtn');
    const spoolDelBtn    = document.getElementById('spoolDelBtn');
    const guideTravel    = document.getElementById('guideTravel');
    const guideTravelBtn = document.getElementById('guideTravelBtn');
    const spoolInfo      = document.getElementById('spoolInfo');
    const spoolMsg       = document.getElementById('spoolMsg');

    let spoolMsgTimer = null;
    function showSpoolMsg(text, isError){
      if (!spoolMsg) return;
      spoolMsg.textContent = text || '';
      spoolMsg.classList.toggle('is-error', !!isError);
      clearTimeout(spoolMsgTimer);
      if (text) spoolMsgTimer = setTimeout(() => { spoolMsg.textContent = ''; }, 6000);
    }
    function cur(){ try { return window.webble.getState() || {}; } catch(_) { return {}; } }
    function fmt(n, d){ return Number.isFinite(n) ? n.toFixed(d) : '–'; }

    function renderSpoolList(st){
      if (!spoolSelect || isUIEditing('SPOOL')) return;
      const list = Array.isArray(st.spools) ? st.spools : [];
      const want = String(st.activeSpool ?? -1);
      const sig = JSON.stringify(list) + '|' + want;
      if (spoolSelect.dataset.sig === sig) return;
      spoolSelect.dataset.sig = sig;
      spoolSelect.innerHTML = '';
      const none = document.createElement('option');
      none.value = '-1'; none.textContent = 'None';
      spoolSelect.appendChild(none);
      for (const p of list) {
        const o = document.createElement('option');
        o.value = String(p.i);
        o.textContent = p.w > 0 ? `${p.name} (${+p.w.toFixed(1)} mm)` : p.name;
        spoolSelect.appendChild(o);
      }
      spoolSelect.value = list.some(p => String(p.i) === want) ? want : '-1';
    }

    function renderSpoolInfo(st){
      if (!spoolInfo) return;
      const mmd = Number(st.servoMmPerDeg);
      const pitch = Number(st.servoStepMm);
      const L = Number(st.servoAngleL), R = Number(st.servoAngleR);
      if (!(mmd > 0) || !(pitch > 0)) { spoolInfo.textContent = '–'; return; }
      const travel = (L - R) * mmd;
      const W = Number(st.spoolWidthMm);
      const parts = [`${fmt(mmd, 4)} mm/°`, `${fmt(pitch / mmd, 2)}° per turn`];
      if (travel > 0) parts.push(`guide travel ${fmt(travel, 1)} mm`, `≈ ${fmt(travel / pitch, 1)} turns/layer`);
      // Inner width minus guide travel: should come out about the same for every well-calibrated spool.
      if (travel > 0 && W > 0) parts.push(`clearance ${fmt(W - travel, 1)} mm`);
      spoolInfo.textContent = parts.join(' · ');
    }

    function renderSpoolTools(st){
      if (!spoolTools) return;
      spoolTools.hidden = !st.hasSpoolTools;
      if (!st.hasSpoolTools) return;
      renderSpoolList(st);
      if (spoolWidth && document.activeElement !== spoolWidth && !isUIEditing('SV_W')) {
        const w = Number(st.spoolWidthMm);
        spoolWidth.value = w > 0 ? String(w) : '';
      }
      if (spoolName && document.activeElement !== spoolName && !spoolName.dataset.touched) {
        const p = (st.spools || []).find(x => x.i === st.activeSpool);
        spoolName.value = p ? p.name : '';
      }
      renderSpoolInfo(st);
    }

    if (spoolSelect) {
      spoolSelect.addEventListener('focusin', () => beginUI('SPOOL'));
      spoolSelect.addEventListener('blur', () => { if (isUIEditing('SPOOL')) endUI('SPOOL'); });
      spoolSelect.addEventListener('change', () => {
        const i = Number(spoolSelect.value) | 0;
        try {
          runOrQueue('SPOOL', () => window.webble.selectSpool(i));
          if (spoolName) { delete spoolName.dataset.touched; }
          if (i >= 0) showSpoolMsg('Preset applied. The guide moves to its home end.');
        } finally { endUI('SPOOL'); }
      });
    }

    if (spoolWidth) {
      spoolWidth.addEventListener('focusin', () => beginUI('SV_W'));
      spoolWidth.addEventListener('change', () => {
        const w = Number(spoolWidth.value);
        try {
          if (!(w >= 0 && w <= 300)) { showSpoolMsg('Enter a width between 0 and 300 mm.', true); return; }
          runOrQueue('SV_W', () => window.webble.setSpoolWidth(w));
        } finally { endUI('SV_W'); }
      });
      spoolWidth.addEventListener('blur', () => { if (isUIEditing('SV_W')) endUI('SV_W'); });
    }

    if (spoolName) spoolName.addEventListener('input', () => { spoolName.dataset.touched = '1'; });

    if (spoolSaveBtn) spoolSaveBtn.addEventListener('click', async () => {
      const st = cur();
      const name = (spoolName?.value || '').trim();
      if (!name) { showSpoolMsg('Enter a name for the preset.', true); return; }
      if (!st.connected) { showSpoolMsg('Connect to the Respooler first.', true); return; }
      const list = Array.isArray(st.spools) ? st.spools : [];
      const same = list.find(p => p.name === name);
      if (!same && list.length >= 6) { showSpoolMsg('All 6 slots are used. Delete a preset first.', true); return; }
      try {
        await window.webble.saveSpool(name, same ? same.i : -1);
        if (spoolName) delete spoolName.dataset.touched;
        showSpoolMsg(same ? `Updated "${name}".` : `Saved "${name}".`);
      } catch (e) { showSpoolMsg('Saving failed: ' + (e?.message || e), true); }
    });

    if (spoolDelBtn) spoolDelBtn.addEventListener('click', async () => {
      const st = cur();
      const p = (st.spools || []).find(x => x.i === st.activeSpool);
      if (!p) { showSpoolMsg('Select the preset to delete first.', true); return; }
      if (!window.confirm(`Delete preset "${p.name}"?`)) return;
      try { await window.webble.deleteSpool(p.i); showSpoolMsg(`Deleted "${p.name}".`); }
      catch (e) { showSpoolMsg('Delete failed: ' + (e?.message || e), true); }
    });

    if (guideTravelBtn) guideTravelBtn.addEventListener('click', async () => {
      const st = cur();
      const L = Number(st.servoAngleL), R = Number(st.servoAngleR);
      const T = Number(guideTravel?.value);
      if (!(L > R)) { showSpoolMsg('Calibrate the end positions first.', true); return; }
      if (!(T >= 5 && T <= 200)) { showSpoolMsg('Enter the guide travel you measured between the two ends, in mm.', true); return; }
      const mmd = T / (L - R);
      if (!(mmd >= 0.1 && mmd <= 1.0)) { showSpoolMsg(`${fmt(mmd, 4)} mm/° looks wrong. Check the measurement.`, true); return; }
      if (!st.connected) { showSpoolMsg('Connect to the Respooler first.', true); return; }
      try {
        await window.webble.setServoMmPerDeg(mmd);
        showSpoolMsg(`Calibrated: ${fmt(mmd, 4)} mm per degree.`);
      } catch (e) { showSpoolMsg('Sending failed: ' + (e?.message || e), true); }
    });

    window.webble.on('spools', () => { try { renderSpoolTools(cur()); } catch(_) {} });

    // -------------------- Apply incoming state to SETTINGS UI --------------------
    function applySettingsFromState(s){
      const st = s || {};

      if (led && !isUIEditing('LED'))      led.value = st.led ?? 50;
      if (useFil && !isUIEditing('USE_FIL'))  useFil.checked = (st.useFil !== false);

      if (!isUIEditing('POW')) {
        motorLocal = clampPow(st.pow ?? 100);
        updateMotorUI();
      }

      if (dir && !isUIEditing('DIR'))      dir.checked = !!st.dir;
      if (hs && !isUIEditing('HS'))       hs.checked = !!st.hs;

      if (autoStop && !isUIEditing('TRQ')) {
        const v = String(st.trq ?? 0);
        if (shouldApply('TRQ', v)) autoStop.value = v;
      }
      if (jin && !isUIEditing('JIN')) {
        const v = String(st.jin ?? 0);
        if (shouldApply('JIN', v)) jin.value = v;
      }
      if (wgt && !isUIEditing('WGT')) {
        const v = String(st.targetWeight ?? st.wgt ?? st.WGT ?? st.targetweight ?? 0);
        if (shouldApply('WGT', v)) wgt.value = v;
      }

      if (fan && !isUIEditing('FAN_SPD'))  fan.value = st.fan ?? 80;
      if (fanAlways && !isUIEditing('FAN_ALW'))  fanAlways.checked = !!st.fanAlways;

      if (speed && !isUIEditing('SPD')) {
        const sp = st.speed ?? 80;
        speed.value = sp;
        if (speedVal) speedVal.textContent = sp + ' %';
      }

      if (!isUIEditing('DUR')) {
        const v = Number(st.dur ?? st.DUR);
        if (Number.isFinite(v)) {
          const vv = clampDur(v);
          if (shouldApply('DUR', vv)) {
            durLocal = vv;
            updateDurUI();
          }
        }
      }

      // Servo values
      if (!isUIEditing('SV_STP')) {
        const v = Number(st.servoStepMm ?? st.SV_STP);
        if (Number.isFinite(v)) {
          servoStepLocal = v;
          updateServoStepUI();
        }
      }
      if (!isUIEditing('SV_L') && typeof (st.servoAngleL ?? st.SV_L) === 'number') {
        angleL = Math.max(0, Math.min(180, Math.round(Number(st.servoAngleL ?? st.SV_L))));
        if (calSide === 'L') updateAngleText();
      }
      if (!isUIEditing('SV_R') && typeof (st.servoAngleR ?? st.SV_R) === 'number') {
        angleR = Math.max(0, Math.min(180, Math.round(Number(st.servoAngleR ?? st.SV_R))));
        if (calSide === 'R') updateAngleText();
      }
      if (!isUIEditing('SV_HOME') && servoHomeSetting && typeof (st.servoHome ?? st.SV_HOME) === 'string') {
        const h = String(st.servoHome ?? st.SV_HOME).trim().toUpperCase();
        if ((h === 'R' || h === 'L') && shouldApply('SV_HOME', h)) {
          servoHomeSetting.value = h;
        }
      }

      // Servo settings are only available on Respooler Pro (variant gating only — NOT connection gating).
      const isPro = isRespoolerProFromState(st || window.webble?.getState?.() || {});
      setServoSettingsEnabled(isPro);
      try { renderSpoolTools(st); } catch(_) {}
    }

    window.webble.on('status', s => {
      try { applySettingsFromState(s); } catch(_) {}
    });

    // Initial
    try {
      applySettingsFromState(window.webble.getState());
    } catch(_) {}
  }

  whenWebbleReady(bindWithWebble);
})();