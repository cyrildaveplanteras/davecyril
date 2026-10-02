// First-run database setup page logic.
//
// Uses textContent everywhere (never innerHTML) so nothing the user types can
// become markup. Kept in its own file because the setup page's CSP allows
// script-src 'self' with no 'unsafe-inline'.
(function () {
  'use strict';

  var els = {
    host: document.getElementById('host'),
    port: document.getElementById('port'),
    database: document.getElementById('database'),
    user: document.getElementById('user'),
    password: document.getElementById('password'),
    testBtn: document.getElementById('testBtn'),
    saveBtn: document.getElementById('saveBtn'),
    status: document.getElementById('status')
  };

  var testedOk = false;

  function setStatus(kind, message) {
    els.status.className = 'status show ' + kind;
    els.status.textContent = message;
  }

  function clearStatus() {
    els.status.className = 'status';
    els.status.textContent = '';
  }

  function setBusy(busy) {
    els.testBtn.disabled = busy;
    if (busy) els.saveBtn.disabled = true;
  }

  function collect() {
    return {
      host: els.host.value.trim(),
      port: els.port.value.trim(),
      database: els.database.value.trim(),
      user: els.user.value.trim(),
      password: els.password.value
    };
  }

  // Any edit invalidates a previous successful test so the user cannot save
  // settings that were never verified.
  function invalidate() {
    testedOk = false;
    els.saveBtn.disabled = true;
  }

  ['host', 'port', 'database', 'user', 'password'].forEach(function (key) {
    els[key].addEventListener('input', invalidate);
  });

  els.testBtn.addEventListener('click', async function () {
    clearStatus();
    setBusy(true);
    setStatus('busy', 'Testing the connection...');
    try {
      var res = await window.setup.testConnection(collect());
      if (res && res.success) {
        testedOk = true;
        els.saveBtn.disabled = false;
        setStatus('ok', res.message || 'Connection successful.');
      } else {
        invalidate();
        setStatus('err', (res && res.error) || 'The connection test failed.');
      }
    } catch (err) {
      invalidate();
      setStatus('err', 'Could not reach the application: ' + ((err && err.message) || String(err)));
    } finally {
      setBusy(false);
    }
  });

  els.saveBtn.addEventListener('click', async function () {
    if (!testedOk) return;
    clearStatus();
    setBusy(true);
    setStatus('busy', 'Saving and starting GoldenHope...');
    try {
      var res = await window.setup.save(collect());
      if (res && res.success) {
        // Clear the password from the DOM before handing off.
        els.password.value = '';
        var done = await window.setup.proceed();
        if (!done || !done.success) {
          setStatus('err', (done && done.error) || 'Saved, but startup could not continue. Please restart GoldenHope.');
        }
        return;
      }
      invalidate();
      setStatus('err', (res && res.error) || 'Could not save the configuration.');
    } catch (err) {
      invalidate();
      setStatus('err', 'Could not save the configuration: ' + ((err && err.message) || String(err)));
    } finally {
      setBusy(false);
    }
  });

  (async function init() {
    try {
      var res = await window.setup.getDefaults();
      var d = (res && res.defaults) || {};
      els.host.value = d.host || '127.0.0.1';
      els.port.value = d.port || '5433';
      els.database.value = d.database || 'goldenhope_db';
      els.user.value = d.user || 'goldenhope';
      els.password.focus();
    } catch (_) {
      setStatus('err', 'Could not load the default settings. Fill the form in manually.');
    }
  })();
})();
