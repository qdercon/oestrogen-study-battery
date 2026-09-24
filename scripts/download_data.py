#!/usr/bin/env python3
"""Download oestrogen-study task data from Firestore into tidy CSVs.

Reads with the Admin SDK, which bypasses firestore.rules, so the write-only
client rules are not an obstacle.

Layout written by core/utils/saveData.js (document ID is the anonymous auth UID):

    pilt-wm-main/tasks/session/{uid}     session metadata only
    pilt-wm-main/tasks/PILT/{uid}        one field per trial: trial_0000, ...
    pilt-wm-main/tasks/WM/{uid}
    pilt-wm-main/tasks/other/{uid}
    pilt-wm-test/tasks/pilt_test/{uid}
    pilt-wm-test/tasks/wm_test/{uid}

Usage:
    python scripts/download_data.py --key path/to/serviceAccountKey.json
    python scripts/download_data.py --session wk0 --completed-only
"""

import argparse
import os
import re
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, firestore
import pandas as pd

MAIN = "pilt-wm-main"
TEST = "pilt-wm-test"

# (top-level collection, task segment)
TASK_PATHS = {
    "session": (MAIN, "session"),
    "PILT": (MAIN, "PILT"),
    "WM": (MAIN, "WM"),
    "other": (MAIN, "other"),
    "pilt_test": (TEST, "pilt_test"),
    "wm_test": (TEST, "wm_test"),
}

TRIAL_FIELD = re.compile(r"^trial_(\d+)$")

# Fields stamped on every document by the writer; everything else on a task
# document is a trial.
META_FIELDS = {
    "participant_id", "session", "module", "firebase_uid", "task",
    "sitting_start_time", "started_at", "ended_at", "user_agent", "is_debug",
    "expCompleted", "bonus", "bonus_state", "total_time", "n_warnings",
    "last_state", "states",
}


def parse_args():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--key", default=os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"),
                   help="Path to the service-account JSON key "
                        "(defaults to $GOOGLE_APPLICATION_CREDENTIALS)")
    p.add_argument("--out", default="data", help="Output directory (default: data)")
    p.add_argument("--session", default=None,
                   help="Only download one session, e.g. wk0")
    p.add_argument("--completed-only", action="store_true",
                   help="Keep only sittings whose session document has expCompleted == 1")
    return p.parse_args()


def connect(key_path):
    if not key_path:
        sys.exit("No credentials. Pass --key or set GOOGLE_APPLICATION_CREDENTIALS.")
    if not Path(key_path).is_file():
        sys.exit(f"Key file not found: {key_path}")
    firebase_admin.initialize_app(credentials.Certificate(key_path))
    return firestore.client()


def fetch(client, task):
    """Return the raw documents for one task as {uid: dict}."""
    collection, segment = TASK_PATHS[task]
    return {d.id: d.to_dict() or {} for d in
            client.collection(collection, "tasks", segment).stream()}


def explode(docs, task):
    """Turn {uid: {meta..., trial_0000: {...}}} into one row per trial."""
    rows = []
    for uid, doc in docs.items():
        meta = {k: doc.get(k) for k in ("participant_id", "session", "firebase_uid")}
        meta["firebase_uid"] = meta.get("firebase_uid") or uid
        meta["task"] = task
        for field, value in doc.items():
            m = TRIAL_FIELD.match(field)
            if not m or not isinstance(value, dict):
                continue
            rows.append({**meta, "trial_index": int(m.group(1)), **value})
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    return df.sort_values(["participant_id", "session", "trial_index"],
                          kind="stable").reset_index(drop=True)


def main():
    args = parse_args()
    client = connect(args.key)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    # --- session metadata ---
    sessions = fetch(client, "session")
    session_rows = []
    for uid, doc in sessions.items():
        row = {k: doc.get(k) for k in sorted(META_FIELDS) if k in doc}
        row["firebase_uid"] = doc.get("firebase_uid") or uid
        session_rows.append(row)
    sessions_df = pd.DataFrame(session_rows)

    if args.session and not sessions_df.empty:
        sessions_df = sessions_df[sessions_df["session"] == args.session]
    if args.completed_only and not sessions_df.empty:
        sessions_df = sessions_df[sessions_df.get("expCompleted") == 1]

    keep_uids = set(sessions_df["firebase_uid"]) if not sessions_df.empty else set()

    if not sessions_df.empty:
        sessions_df = sessions_df.sort_values(["participant_id", "session"], kind="stable")
        sessions_df.to_csv(out / "sessions.csv", index=False)
        print(f"sessions.csv: {len(sessions_df)} sittings")
    else:
        print("sessions.csv: no sittings matched")

    # --- trial data ---
    for task in ("PILT", "WM", "pilt_test", "wm_test", "other"):
        docs = fetch(client, task)
        if keep_uids:
            docs = {u: d for u, d in docs.items() if u in keep_uids}
        df = explode(docs, task)
        if df.empty:
            print(f"{task}: no trials")
            continue
        path = out / f"{task}_trials.csv"
        df.to_csv(path, index=False)
        print(f"{path.name}: {len(df)} trials, "
              f"{df['participant_id'].nunique()} participants")

    # --- warn about repeat sittings ---
    if not sessions_df.empty:
        dupes = (sessions_df.groupby(["participant_id", "session"])
                 .size().reset_index(name="n"))
        dupes = dupes[dupes["n"] > 1]
        if not dupes.empty:
            print("\nWARNING: some participant-session pairs have more than one "
                  "sitting (a restart in a different browser mints a new UID). "
                  "Decide which is authoritative:")
            for _, r in dupes.iterrows():
                print(f"  {r['participant_id']} / {r['session']}: {r['n']} sittings")


if __name__ == "__main__":
    main()
