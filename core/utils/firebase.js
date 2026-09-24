/**
 * Firebase initialisation for the oestrogen study.
 *
 * Owns the app handle, the Firestore instance, and anonymous authentication.
 * Everything that writes data goes through saveData.js, which reads the handles
 * exported here.
 *
 * The config below is deliberately committed: the apiKey is a public project
 * identifier, not a secret. Access control lives entirely in firestore.rules.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
    getAuth,
    signInAnonymously,
    signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
    initializeFirestore,
    persistentLocalCache
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCkLh07IBK-TZ1GtwGXpnE_Ws48GI5wQ8g",
    authDomain: "oestrogen-project.firebaseapp.com",
    projectId: "oestrogen-project",
    storageBucket: "oestrogen-project.firebasestorage.app",
    messagingSenderId: "547529061196",
    appId: "1:547529061196:web:47c1da02195d5e899815e9",
    measurementId: "G-EF69ZTZV1F"
};

// Key under which the current sitting is recorded in sessionStorage. Scoped to
// the tab, so it survives a reload but not a new participant in a new tab.
const SITTING_STORAGE_KEY = 'oestrogen_sitting';

let app = null;
let auth = null;
let db = null;
let uid = null;

/**
 * The Firestore instance. Null until initFirebase() has resolved.
 */
function getDb() {
    return db;
}

/**
 * The anonymous auth UID for this sitting. Null until initFirebase() resolved.
 */
function getUid() {
    return uid;
}

/**
 * Initialise Firebase and sign in anonymously.
 *
 * Callers must await this before running the timeline, so that no trial can
 * finish before there is a UID to write it under.
 *
 * Anonymous users persist in browser storage by default, which is wrong for a
 * shared lab machine: the next participant would silently inherit the previous
 * participant's UID and write into their documents. We therefore sign out and
 * mint a fresh UID whenever the participant/session pair changes, while a
 * mid-session reload (same tab, same pair) keeps writing to the same documents.
 *
 * @param {string} participantID - Participant identifier from the URL
 * @param {string} session - Session identifier (wk0 | wk2 | wk4)
 * @returns {Promise<string>} The anonymous auth UID
 */
async function initFirebase(participantID, session) {
    app = initializeApp(firebaseConfig);

    // Persistent local cache queues writes through transient connectivity loss
    // and replays them on reconnect.
    db = initializeFirestore(app, { localCache: persistentLocalCache({}) });

    auth = getAuth(app);

    const sittingKey = `${participantID}__${session}`;
    if (sessionStorage.getItem(SITTING_STORAGE_KEY) !== sittingKey) {
        // Different participant or session than this tab last saw - start clean.
        await signOut(auth).catch(() => { /* no user signed in yet */ });
        sessionStorage.setItem(SITTING_STORAGE_KEY, sittingKey);
    }

    const credential = await signInAnonymously(auth);
    uid = credential.user.uid;
    console.log(`Firebase anonymous UID: ${uid}`);

    return uid;
}

export {
    initFirebase,
    getDb,
    getUid
};
