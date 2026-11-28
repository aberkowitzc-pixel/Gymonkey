import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEvent, endOf, eventIdFor } from '../gcal.js';

test('fin del evento: suma la duración y cruza la medianoche', () => {
  assert.equal(endOf('2026-12-01', '19:30', 75), '2026-12-01T20:45:00');
  assert.equal(endOf('2026-12-31', '23:30', 60), '2027-01-01T00:30:00');
});

test('evento con hora local, zona horaria y resumen de la sesión en las notas', () => {
  const ev = buildEvent({
    iso: '2026-12-01', time: '07:00', minutes: 60, title: 'Torso A', timeZone: 'America/Santiago',
    note: 'Semana 2 de 5', lines: ['Press de banca — 4×6-8 · RIR 2 · 60 kg', 'Remo con barra — 3×8-10 · RIR 2'], appUrl: 'https://x.app/',
  });
  assert.equal(ev.summary, 'Torso A');
  assert.deepEqual(ev.start, { dateTime: '2026-12-01T07:00:00', timeZone: 'America/Santiago' });
  assert.deepEqual(ev.end, { dateTime: '2026-12-01T08:00:00', timeZone: 'America/Santiago' });
  assert.equal(ev.description, 'Semana 2 de 5\n\n• Press de banca — 4×6-8 · RIR 2 · 60 kg\n• Remo con barra — 3×8-10 · RIR 2\n\nhttps://x.app/');
});

test('identificador fijo por día, con los caracteres que admite Google (0-9, a-v)', () => {
  assert.equal(eventIdFor('2026-12-01'), 'gmk20261201');
  assert.match(eventIdFor('2026-12-01'), /^[0-9a-v]{5,1024}$/);
});
