import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { joursFeries, joursOuvres } from '../src/conges.js';

const dates = (feries) => feries.map((f) => f.date);

// Critères 1 à 3 : cas d'exemple du client (réponse 14), valeurs attendues écrites en dur.
const CAS_CLIENT = [
  { critere: 1, debut: '2025-12-22', fin: '2025-12-26', site: 'national', attendu: 4 },
  { critere: 1, debut: '2025-12-22', fin: '2025-12-26', site: 'alsace-moselle', attendu: 3 },
  { critere: 2, debut: '2026-03-30', fin: '2026-04-03', site: 'national', attendu: 5 },
  { critere: 2, debut: '2026-03-30', fin: '2026-04-03', site: 'alsace-moselle', attendu: 4 },
  { critere: 3, debut: '2026-05-01', fin: '2026-05-10', site: 'national', attendu: 4 },
  { critere: 3, debut: '2026-05-01', fin: '2026-05-10', site: 'alsace-moselle', attendu: 4 },
];

for (const { critere, debut, fin, site, attendu } of CAS_CLIENT) {
  test(`critère ${critere} : du ${debut} au ${fin}, le site ${site} compte ${attendu} jours ouvrés`, () => {
    assert.deepEqual(joursOuvres({ debut, fin, site }), { joursOuvres: attendu });
  });
}

test('critère 4 : un jour ouvré seul compte 1 jour', () => {
  assert.deepEqual(joursOuvres({ debut: '2026-05-04', fin: '2026-05-04', site: 'national' }), { joursOuvres: 1 });
});

test('critère 4 : un samedi seul ou un dimanche seul compte 0 jour', () => {
  assert.deepEqual(joursOuvres({ debut: '2026-05-02', fin: '2026-05-02', site: 'national' }), { joursOuvres: 0 });
  assert.deepEqual(joursOuvres({ debut: '2026-05-03', fin: '2026-05-03', site: 'national' }), { joursOuvres: 0 });
});

test('critère 4 : un jour férié seul compte 0 jour', () => {
  for (const site of ['national', 'alsace-moselle']) {
    assert.deepEqual(joursOuvres({ debut: '2026-05-01', fin: '2026-05-01', site }), { joursOuvres: 0 });
  }
});

test('critère 5 : un jour férié tombé un samedi n\'est pas retiré deux fois', () => {
  assert.deepEqual(joursOuvres({ debut: '2026-08-10', fin: '2026-08-16', site: 'national' }), { joursOuvres: 5 });
});

test('une demande à cheval sur deux années tient compte des fériés de chacune', () => {
  for (const site of ['national', 'alsace-moselle']) {
    assert.deepEqual(joursOuvres({ debut: '2025-12-29', fin: '2026-01-02', site }), { joursOuvres: 4 });
  }
});

const FERIES_2026_NATIONAL = [
  '2026-01-01', '2026-04-06', '2026-05-01', '2026-05-08', '2026-05-14', '2026-05-25',
  '2026-07-14', '2026-08-15', '2026-11-01', '2026-11-11', '2026-12-25',
];

test('critère 6 : le site national a 11 jours fériés en 2026', () => {
  assert.deepEqual(dates(joursFeries(2026, 'national')), FERIES_2026_NATIONAL);
});

test('critère 7 : l\'Alsace-Moselle a 13 jours fériés en 2026, avec le Vendredi saint et le 26 décembre', () => {
  const attendu = [...FERIES_2026_NATIONAL, '2026-04-03', '2026-12-26'].sort();
  assert.equal(attendu.length, 13);
  assert.deepEqual(dates(joursFeries(2026, 'alsace-moselle')), attendu);
});

test('critère 8 : les fêtes mobiles de 2025 sont calculées', () => {
  const national = joursFeries(2025, 'national');
  const libelle = (feries, date) => feries.find((f) => f.date === date)?.libelle;
  assert.equal(libelle(national, '2025-04-21'), 'Lundi de Pâques');
  assert.equal(libelle(national, '2025-05-29'), 'Ascension');
  assert.equal(libelle(national, '2025-06-09'), 'Lundi de Pentecôte');
  assert.equal(libelle(national, '2025-04-18'), undefined);
  const alsace = joursFeries(2025, 'alsace-moselle');
  assert.equal(libelle(alsace, '2025-04-18'), 'Vendredi saint');
  assert.equal(libelle(alsace, '2025-04-21'), 'Lundi de Pâques');
  assert.equal(libelle(alsace, '2025-05-29'), 'Ascension');
  assert.equal(libelle(alsace, '2025-06-09'), 'Lundi de Pentecôte');
});

test('critère 9 : les jours fériés sont des objets { date, libelle } triés, dates au format AAAA-MM-JJ', () => {
  for (const site of ['national', 'alsace-moselle']) {
    const feries = joursFeries(2026, site);
    for (const f of feries) {
      assert.deepEqual(Object.keys(f), ['date', 'libelle']);
      assert.match(f.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(typeof f.libelle, 'string');
      assert.ok(f.libelle.length > 0);
    }
    assert.deepEqual(dates(feries), [...dates(feries)].sort());
  }
});

test('critère 9 : le décompte des jours ouvrés est rendu sous forme d\'objet', () => {
  assert.deepEqual(joursOuvres({ debut: '2026-05-04', fin: '2026-05-08', site: 'national' }), { joursOuvres: 4 });
});

test('critère 9 : une date mal formée lève une RangeError', () => {
  for (const debut of ['2026-5-1', '01/05/2026', '', undefined, 20260501]) {
    assert.throws(() => joursOuvres({ debut, fin: '2026-05-10', site: 'national' }), RangeError);
    assert.throws(() => joursOuvres({ debut: '2026-05-01', fin: debut, site: 'national' }), RangeError);
  }
});

test('une date inexistante lève une RangeError', () => {
  for (const date of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-04-31']) {
    assert.throws(() => joursOuvres({ debut: date, fin: date, site: 'national' }), RangeError);
  }
  assert.deepEqual(joursOuvres({ debut: '2028-02-29', fin: '2028-02-29', site: 'national' }), { joursOuvres: 1 });
});

test('un site inconnu lève une RangeError', () => {
  assert.throws(() => joursFeries(2026, 'paris'), RangeError);
  assert.throws(() => joursOuvres({ debut: '2026-05-04', fin: '2026-05-04', site: 'paris' }), RangeError);
  assert.throws(() => joursOuvres({ debut: '2026-05-04', fin: '2026-05-04' }), RangeError);
});

test('une année hors de 2000 à 2100 ou non entière lève une RangeError', () => {
  for (const annee of [1999, 2101, 2026.5, '2026', NaN]) {
    assert.throws(() => joursFeries(annee, 'national'), RangeError);
  }
  assert.throws(() => joursOuvres({ debut: '1999-12-31', fin: '1999-12-31', site: 'national' }), RangeError);
});

test('les années 2000 et 2100 sont acceptées', () => {
  assert.equal(joursFeries(2000, 'national').length, 11);
  assert.equal(joursFeries(2100, 'alsace-moselle').length, 13);
});

test('une date de fin avant la date de début lève une erreur', () => {
  assert.throws(() => joursOuvres({ debut: '2025-12-26', fin: '2025-12-22', site: 'national' }), RangeError);
});

test('critère 10 : les résultats ne dépendent pas de la date du système', () => {
  const calculer = () => ({
    ouvres: joursOuvres({ debut: '2025-12-22', fin: '2026-01-09', site: 'alsace-moselle' }),
    feries: joursFeries(2026, 'national'),
  });
  const reference = calculer();
  for (const maintenant of [0, Date.UTC(2099, 11, 31, 23, 59)]) {
    mock.timers.enable({ apis: ['Date'], now: maintenant });
    try {
      assert.deepEqual(calculer(), reference);
    } finally {
      mock.timers.reset();
    }
  }
});

test('critère 10 : le module ne lit pas l\'horloge et n\'écrit rien', () => {
  const source = readFileSync(new URL('../src/conges.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Date\.now|new Date\(\)|performance\.now/);
  assert.doesNotMatch(source, /\bimport\b|\brequire\(|console\./);
  assert.doesNotMatch(source, /^(let|var)\s/m);
});

test('critère 11 : le README décrit le contrat du module de congés', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  for (const attendu of ['joursFeries(annee, site)', 'joursOuvres({ debut, fin, site })', 'AAAA-MM-JJ',
    '`national`', '`alsace-moselle`', '{ date, libelle }', '{ joursOuvres }', 'RangeError']) {
    assert.ok(readme.includes(attendu), `le README doit mentionner ${attendu}`);
  }
});

test('critère 12 : aucune dépendance externe dans le package.json', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
});
