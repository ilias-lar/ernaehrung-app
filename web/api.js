/* Verbindung zum eigenen Server (Token im Browser, kein Passwort gespeichert) */
(function () {
  'use strict';
  const KEY = 'ernaehrung-token';
  const API = {
    token() { try { return localStorage.getItem(KEY); } catch (e) { return null; } },
    setToken(t) { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch (e) { /* egal */ } },
    async call(method, url, body) {
      const headers = { 'Content-Type': 'application/json' };
      const t = API.token(); if (t) headers.Authorization = 'Bearer ' + t;
      const res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
      let data = null; try { data = await res.json(); } catch (e) { /* leer */ }
      if (res.status === 401 && !/\/api\/(login|setup|register)/.test(url)) { API.setToken(null); location.href = '/login.html'; }
      return { status: res.status, ok: res.ok, data: data || {} };
    },
    async logout() { try { await API.call('POST', '/api/logout'); } catch (e) { /* egal */ } API.setToken(null); location.href = '/login.html'; },
  };
  window.API = API;
})();
