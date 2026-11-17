'use strict';
/**
 * Einfache, sichere Datei-Datenbank: alles in einer JSON-Datei,
 * atomar geschrieben (temp-Datei + rename). Für 2 Personen völlig ausreichend.
 */
const fs = require('node:fs');
const path = require('node:path');
const model = require('./model');

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'db.json');
    this.queue = Promise.resolve();
    fs.mkdirSync(dir, { recursive: true });
    this.db = this.load();
  }

  load() {
    let db = null;
    try { db = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (e) {
      if (e.code !== 'ENOENT') {
        // Kaputte Datei nicht überschreiben, sondern sichern
        const bak = this.file + '.defekt-' + Date.now();
        try { fs.copyFileSync(this.file, bak); } catch (_) { /* egal */ }
        console.error('db.json nicht lesbar, Sicherung unter', bak);
      }
    }
    db = db || {};
    db.users = db.users || [];
    db.sessions = db.sessions || {};
    db.invites = db.invites || [];
    db.state = Object.assign(model.defaultState(), db.state || {});
    db.state.updated = Object.assign({ settings: 0, plan: 0, recipes: 0, logs: 0 }, db.state.updated || {});
    model.PIDS.forEach((p) => {
      db.state.logs[p] = db.state.logs[p] || {};
      db.state.weights[p] = db.state.weights[p] || [];
    });
    return db;
  }

  /** Änderungen speichern (serialisiert, damit sich Schreibvorgänge nicht überholen). */
  save() {
    const json = JSON.stringify(this.db);
    this.queue = this.queue.then(() => new Promise((resolve) => {
      const tmp = this.file + '.tmp';
      fs.writeFile(tmp, json, (err) => {
        if (err) { console.error('Speichern fehlgeschlagen', err); return resolve(); }
        fs.rename(tmp, this.file, (err2) => { if (err2) console.error('Umbenennen fehlgeschlagen', err2); resolve(); });
      });
    }));
    return this.queue;
  }
}

module.exports = { Store };
