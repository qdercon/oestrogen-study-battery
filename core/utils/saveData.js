/**
 * Trial-by-trial persistence to Firestore.
 *
 * Layout (document ID is always the anonymous auth UID):
 *
 *   pilt-wm-main/tasks/session/{uid}     session metadata only
 *   pilt-wm-main/tasks/PILT/{uid}        trialphase "pilt"
 *   pilt-wm-main/tasks/WM/{uid}          trialphase "wm"
 *   pilt-wm-main/tasks/other/{uid}       instructions, quiz, inter-block, ...
 *   pilt-wm-test/tasks/pilt_test/{uid}   trialphase "pilt_test" + confidence
 *   pilt-wm-test/tasks/wm_test/{uid}     trialphase "wm_test" + confidence
 *
 * Each trial becomes one field on its task document, keyed by zero-padded
 * jsPsych trial index (trial_0042), so downloads sort back into run order.
 *
 * Writes are coalesced and flushed at most once per second per document. That
 * keeps us under Firestore's ~1 write/sec sustained per-document limit during
 * bursts (instructions, preloads) without ever dropping a trial. Failed writes
 * are returned to the buffer and retried with exponential backoff rather than
 * being discarded.
 */

import {
    doc,
    setDoc,
    serverTimestamp,
    arrayUnion,
    waitForPendingWrites
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { getDb, getUid } from "./firebase.js";

const MAIN = 'pilt-wm-main';
const TEST = 'pilt-wm-test';

// Logical document key -> [top-level collection, task segment]
const DOC_PATHS = {
    session:   [MAIN, 'session'],
    PILT:      [MAIN, 'PILT'],
    WM:        [MAIN, 'WM'],
    other:     [MAIN, 'other'],
    pilt_test: [TEST, 'pilt_test'],
    wm_test:   [TEST, 'wm_test']
};

// trialphase -> document key. Anything unlisted lands in "other".
const TRIALPHASE_TO_DOC = {
    pilt: 'PILT',
    wm: 'WM',
    pilt_test: 'pilt_test',
    wm_test: 'wm_test'
};

const FLUSH_INTERVAL_MS = 1000;
const MAX_BACKOFF_MS = 30000;
const FAILURES_BEFORE_BANNER = 5;
// Firestore's hard limit is 1 MiB per document; warn well before it.
const DOC_SIZE_WARN_BYTES = 700 * 1024;

let meta = null;          // identity fields stamped onto every document
let dryRun = false;       // simulation mode: log instead of write

const pending = new Map();      // docKey -> { [field]: value }
const pendingStates = [];       // states awaiting an arrayUnion on the session doc
const stampedDocs = new Set();  // docKeys that already carry the identity fields
const docSizes = new Map();     // docKey -> approximate accumulated bytes
const warnedDocs = new Set();

let lastTestDoc = null;   // which test document a confidence rating belongs to
let flushTimer = null;
let inFlight = false;
let consecutiveFailures = 0;
let backoffMs = 0;
let waiters = [];

/* ------------------------------------------------------------------ utils */

function docRef(docKey) {
    const [collection, task] = DOC_PATHS[docKey];
    return doc(getDb(), collection, 'tasks', task, getUid());
}

/**
 * Make a value safe for Firestore: drop undefined and functions, and stringify
 * nested arrays (Firestore rejects an array directly inside another array).
 */
function sanitiseValue(value, insideArray = false) {
    if (value === null) return null;

    const type = typeof value;
    if (type === 'undefined' || type === 'function' || type === 'symbol') return undefined;
    if (type === 'number' || type === 'string' || type === 'boolean') return value;
    if (value instanceof Date) return value;

    if (Array.isArray(value)) {
        if (insideArray) return JSON.stringify(value);   // nested array
        const out = [];
        for (const item of value) {
            const clean = sanitiseValue(item, true);
            if (clean !== undefined) out.push(clean);
        }
        return out;
    }

    if (type === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            const clean = sanitiseValue(v, false);
            if (clean !== undefined) out[k] = clean;
        }
        return out;
    }

    return undefined;
}

/**
 * Strip a jsPsych trial down to what is worth storing. `stimulus` holds the
 * full rendered HTML on instruction trials - kilobytes of markup we already
 * have in source - so it goes, exactly as the previous REDCap path did with
 * .ignore('stimulus').
 */
function sanitiseTrial(data) {
    const { stimulus, ...rest } = data;
    return sanitiseValue(rest) || {};
}

function fieldNameFor(data) {
    const index = Number.isInteger(data.trial_index) ? data.trial_index : 0;
    return `trial_${String(index).padStart(4, '0')}`;
}

function routeTrial(data) {
    const phase = data.trialphase;
    const mapped = TRIALPHASE_TO_DOC[phase];

    if (mapped) {
        if (mapped === 'pilt_test' || mapped === 'wm_test') lastTestDoc = mapped;
        return mapped;
    }

    // Confidence ratings carry no task marker; they belong to the test phase
    // whose trial they immediately follow.
    if (phase === 'test-confidence' && lastTestDoc) return lastTestDoc;

    return 'other';
}

function showBanner(message) {
    let el = document.getElementById('save-error-banner');
    if (!el) {
        el = document.createElement('div');
        el.id = 'save-error-banner';
        el.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;' +
            'background:#c0392b;color:#fff;padding:10px 16px;font:600 15px/1.4 sans-serif;' +
            'text-align:center;';
        document.body.appendChild(el);
    }
    el.textContent = message;
}

function hideBanner() {
    const el = document.getElementById('save-error-banner');
    if (el) el.remove();
}

/* --------------------------------------------------------------- queueing */

function enqueue(docKey, fields, schedule = true) {
    const bucket = pending.get(docKey) || {};
    Object.assign(bucket, fields);
    pending.set(docKey, bucket);
    if (schedule) scheduleFlush();
}

function scheduleFlush(delay = FLUSH_INTERVAL_MS) {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        flush();
    }, delay);
}

function hasPending() {
    return pending.size > 0 || pendingStates.length > 0;
}

function settleWaiters() {
    if (hasPending() || inFlight) return;
    const pendingWaiters = waiters;
    waiters = [];
    pendingWaiters.forEach(resolve => resolve());
}

/**
 * Write everything currently buffered. One setDoc per document, merged, so a
 * document is created on first write and updated thereafter.
 */
async function flush() {
    if (inFlight || !hasPending()) {
        settleWaiters();
        return;
    }
    if (!getDb() || !getUid()) { settleWaiters(); return; }   // not initialised yet

    // Fold buffered state markers into the session document.
    if (pendingStates.length > 0) {
        const states = pendingStates.splice(0, pendingStates.length);
        enqueue('session', {
            last_state: states[states.length - 1],
            states: arrayUnion(...states)
        }, false);
    }

    const batch = [...pending.entries()];
    pending.clear();
    inFlight = true;

    const results = await Promise.allSettled(batch.map(([docKey, fields]) => {
        const payload = { ...fields };

        // Stamp identity fields once per document so every collection can be
        // joined without relying on the UID.
        if (!stampedDocs.has(docKey) && meta) {
            Object.assign(payload, meta, { task: docKey });
            stampedDocs.add(docKey);
        }

        if (dryRun) {
            console.log(`[saveData dry-run] ${docKey}`, payload);
            return Promise.resolve();
        }

        trackSize(docKey, payload);
        return setDoc(docRef(docKey), payload, { merge: true });
    }));

    inFlight = false;

    const failed = [];
    results.forEach((result, i) => {
        if (result.status === 'rejected') {
            failed.push(batch[i]);
            console.error(`Firestore write failed for ${batch[i][0]}:`, result.reason);
        }
    });

    if (failed.length > 0) {
        // Return failed fields to the buffer without clobbering anything newer
        // that arrived while the write was in flight.
        failed.forEach(([docKey, fields]) => {
            stampedDocs.delete(docKey);
            const bucket = pending.get(docKey) || {};
            pending.set(docKey, { ...fields, ...bucket });
        });

        consecutiveFailures += 1;
        backoffMs = Math.min(MAX_BACKOFF_MS, 1000 * Math.pow(2, consecutiveFailures - 1));

        if (consecutiveFailures >= FAILURES_BEFORE_BANNER) {
            showBanner('Data is not saving. Please tell the experimenter - do not close this window.');
        }
        scheduleFlush(backoffMs);
    } else {
        if (consecutiveFailures > 0) hideBanner();
        consecutiveFailures = 0;
        backoffMs = 0;
        if (hasPending()) scheduleFlush();
    }

    settleWaiters();
}

function trackSize(docKey, payload) {
    let size = docSizes.get(docKey) || 0;
    try {
        size += JSON.stringify(payload)?.length || 0;
    } catch { /* FieldValue sentinels are not serialisable; ignore */ }
    docSizes.set(docKey, size);

    if (size > DOC_SIZE_WARN_BYTES && !warnedDocs.has(docKey)) {
        warnedDocs.add(docKey);
        console.warn(
            `Firestore document "${docKey}" is around ${Math.round(size / 1024)} KB, ` +
            `approaching the 1 MiB per-document limit.`
        );
    }
}

/* ----------------------------------------------------------- public API */

/**
 * Set up the writer and create the session document.
 * Must be awaited before the timeline runs.
 *
 * @param {Object} options
 * @param {string} options.participantID
 * @param {string} options.session
 * @param {string} options.module
 * @param {boolean} [options.simulate] - log writes instead of performing them
 */
async function initSaveData({ participantID, session, module, simulate = false }) {
    dryRun = simulate;

    meta = {
        participant_id: participantID,
        session: session,
        module: module,
        firebase_uid: getUid()
    };

    const sessionDoc = {
        ...meta,
        task: 'session',
        sitting_start_time: new Date().toISOString(),
        started_at: serverTimestamp(),
        user_agent: navigator.userAgent,
        is_debug: Boolean(participantID && participantID.includes('debug')),
        expCompleted: 0
    };
    stampedDocs.add('session');

    if (dryRun) {
        console.log('[saveData dry-run] session', sessionDoc);
        return;
    }

    await setDoc(docRef('session'), sessionDoc, { merge: true });
}

/**
 * Persist one jsPsych trial. Wired to initJsPsych's on_data_update, so it is
 * called exactly once per trial with that trial's data.
 */
function saveTrial(data) {
    if (!meta) return;   // not initialised (e.g. auth failed) - nothing to do
    enqueue(routeTrial(data), { [fieldNameFor(data)]: sanitiseTrial(data) });
}

/**
 * Record an experiment state marker on the session document.
 */
function recordState(state) {
    if (!meta) return;
    pendingStates.push(state);
    scheduleFlush();
}

/**
 * Record the running per-task bonus tally on the session document.
 */
function recordBonusState(bonusState) {
    if (!meta) return;
    enqueue('session', { bonus_state: sanitiseValue(bonusState) });
}

/**
 * Block until the server has acknowledged every write.
 *
 * With persistent local caching, setDoc() resolves as soon as the write hits
 * IndexedDB - the sync to Firestore happens in the background. That is exactly
 * what we want mid-task (a blip in connectivity must not stall the experiment),
 * but at the end of a session we need to know the data actually arrived before
 * the participant closes the tab.
 *
 * @param {number} timeoutMs - Give up waiting after this long
 * @returns {Promise<boolean>} True if the server acknowledged everything
 */
async function waitForServerSync(timeoutMs = 20000) {
    if (!meta || dryRun || !getDb()) return true;

    let timer;
    const timeout = new Promise(resolve => {
        timer = setTimeout(() => resolve(false), timeoutMs);
    });

    try {
        const acknowledged = await Promise.race([
            waitForPendingWrites(getDb()).then(() => true),
            timeout
        ]);
        if (!acknowledged) {
            console.warn('Some writes were not acknowledged by the server before ' +
                'the timeout. They remain cached locally and will sync when this ' +
                'browser next opens the study.');
        }
        return acknowledged;
    } catch (error) {
        console.error('waitForPendingWrites failed:', error);
        return false;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Mark the session complete and record its summary figures.
 * Resolves only once the server has confirmed the data.
 */
async function finaliseSession(summary = {}) {
    if (!meta) return;
    enqueue('session', {
        ...sanitiseValue(summary),
        expCompleted: 1,
        ended_at: dryRun ? new Date().toISOString() : serverTimestamp()
    });
    await flushNow();
    await waitForServerSync();
}

/**
 * Resolve once everything buffered has been written.
 */
function flushNow() {
    if (!meta) return Promise.resolve();
    if (!hasPending() && !inFlight) return Promise.resolve();

    const waiter = new Promise(resolve => waiters.push(resolve));
    if (flushTimer !== null) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    flush();
    return waiter;
}

export {
    initSaveData,
    saveTrial,
    recordState,
    recordBonusState,
    finaliseSession,
    flushNow,
    waitForServerSync
};
