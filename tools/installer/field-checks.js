/**
 * Feldpruefungen des Web-Installers, die eine Regel des SERVERS spiegeln.
 *
 * Reine Funktionen ohne DOM: install.html ruft sie in den Schritt-Handlern auf,
 * test/test-installer-validation.js bindet jede an die Stelle im Server, deren
 * Regel sie vorwegnimmt. Der Anlass ist derselbe in allen Faellen: der Wizard
 * nahm einen Wert an, an dem der Server erst nach dem Speichern scheiterte -
 * still (Backups aus, Kalender ohne Verbindung) oder mit einem Startabbruch,
 * der im Wizard nur als "Container konnte nicht gestartet werden" ankam.
 */

/**
 * Wertebereiche der fuenf Cron-Felder (Minute, Stunde, Tag, Monat, Wochentag).
 * Wochentag 7 ist wie 0 der Sonntag. Namen nur bei Monat und Wochentag,
 * dreibuchstabig, ohne Ruecksicht auf Gross-/Kleinschreibung.
 */
const CRON_FIELDS = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12, names: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'], base: 1 },
  { min: 0, max: 7, names: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'], base: 0 },
];

function cronValue(token, field) {
  if (/^\d+$/.test(token)) {
    const n = Number(token);
    return n >= field.min && n <= field.max ? n : null;
  }
  const idx = field.names ? field.names.indexOf(token.toLowerCase()) : -1;
  return idx === -1 ? null : idx + field.base;
}

function cronItem(item, field) {
  const [range, step, extra] = item.split('/');
  if (extra !== undefined) return false;
  if (step !== undefined && !(/^\d+$/.test(step) && Number(step) >= 1 && Number(step) <= field.max)) return false;
  if (range === '*') return true;
  const bounds = range.split('-');
  if (bounds.length === 1) {
    // "5/10" lehnt der Scheduler ab: ein Schritt braucht * oder einen Bereich.
    return step === undefined && cronValue(bounds[0], field) !== null;
  }
  if (bounds.length !== 2) return false;
  const lo = cronValue(bounds[0], field);
  const hi = cronValue(bounds[1], field);
  return lo !== null && hi !== null && lo <= hi;
}

/**
 * Ein fuenfteiliger Cron-Ausdruck in den Wertebereichen oben: `*`, `*\/n`,
 * Zahl, Bereich `a-b`, Bereich mit Schritt `a-b/n` und Listen daraus.
 *
 * Absichtlich enger als node-cron, das der Server nutzt
 * (server/services/backup-scheduler.js, `cron.validate`): was hier durchgeht,
 * nimmt der Scheduler garantiert an - der Test haelt genau diese Richtung
 * fest. Vorher zaehlte der Wizard nur die Felder, `99 * * * *` ging durch, und
 * der Server schaltete die Backups beim Start still ab (nur eine Logzeile).
 */
export function isValidCron(expr) {
  const parts = String(expr ?? '').trim().split(/\s+/);
  if (parts.length !== CRON_FIELDS.length) return false;
  return parts.every((part, i) => part.split(',').every(item => item !== '' && cronItem(item, CRON_FIELDS[i])));
}

/**
 * Container-Pfad (DOCUMENT_STORAGE_LOCAL_PATH): absolut. docker-compose.yml
 * bindet den Host-Ordner an genau diesen Pfad
 * (`${DOCUMENT_STORAGE_LOCAL_DIR}:${DOCUMENT_STORAGE_LOCAL_PATH}`), und das
 * Ziel eines Mounts muss absolut sein - sonst scheitert schon `compose up`,
 * und der Wizard meldete nur einen fehlgeschlagenen Start.
 */
export function isAbsoluteContainerPath(path) {
  return String(path ?? '').startsWith('/');
}

/**
 * Das Praefix der Platzhalter aus .env.example. server/auth.js und server/db.js
 * brechen beim Start daran ab (`startsWith('REPLACE_WITH_')`); der Wizard
 * nimmt den Wert deshalb gar nicht erst an.
 */
export const PLACEHOLDER_PREFIX = 'REPLACE_WITH_';

export function isPlaceholderSecret(value) {
  return String(value ?? '').startsWith(PLACEHOLDER_PREFIX);
}

/**
 * Paar aus ID und Secret (Google, Outlook, Apple): welches Feld fehlt?
 *
 * 'secret' : die ID steht, das Secret fehlt - eingetippt UND in der .env
 * 'id'     : ein Secret ist eingetippt, die ID fehlt
 * null     : vollstaendig oder ganz leer
 *
 * `secretKept` heisst: das Secret steht schon in der bestehenden .env (Rerun,
 * Feld bewusst leer). Ein uebernommenes Secret ohne ID meldet nichts: der
 * Server bewahrt eine leer gesendete ID ohnehin, ein Fehler hier blockierte
 * nur jeden Rerun.
 */
export function pairGap(id, typedSecret, secretKept) {
  if (id && !(typedSecret || secretKept)) return 'secret';
  if (!id && typedSecret) return 'id';
  return null;
}

/**
 * WebDAV (Dokumente oder Backups) ist eingeschaltet, aber ohne Adresse.
 *
 * Der Server liest jedes WebDAV-Feld aus der Umgebung ODER aus den
 * App-Einstellungen. Bei einer Erstinstallation sind die leer, ein
 * eingeschaltetes Ziel ohne URL ist dann nur ein Fehler, der erst beim ersten
 * Upload bzw. der ersten Sicherung auffaellt. Laeuft die bestehende .env schon
 * genau so (eingeschaltet, URL in der App gepflegt), meldet der Rerun nichts:
 * `rerun` sind die uebernommenen Werte, `enabledKey`/`urlKey` ihre Schluessel.
 */
export function enabledWithoutUrl(enabled, url, rerun, enabledKey, urlKey) {
  if (!enabled || url) return false;
  const runsThatWay = Boolean(rerun) && rerun[enabledKey] === 'true' && !rerun[urlKey];
  return !runsThatWay;
}
