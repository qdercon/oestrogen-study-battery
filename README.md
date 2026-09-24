# Oestrogen Patch Study — Task Battery

Web-based cognitive task battery for the oestrogen patch study. This is a cut-down
fork of the RELMED task battery, reduced to the two card-choosing learning tasks and
their post-learning test phases. Everything else from the original battery (vigour,
PIT, control, delay discounting, questionnaires) has been removed.

Built on jsPsych 8. Runs in the browser, writes trial-by-trial to Firestore, and is
deployed on Firebase Hosting.

## What a participant does

One sitting runs a single module, `oestrogen_battery`, defined in
[api/module-registry.js](api/module-registry.js). The order is fixed:

| # | Element | Detail |
|---|---------|--------|
| 1 | Welcome instructions | |
| 2 | **PILT** | Probabilistic instrumental learning. Two cards, pick one with the arrow keys. 15 blocks × 10 trials, one card pair per block. Outcomes are ±1p, ±50p and ±£1; blocks are reward-only, punishment-only, or mixed. |
| 3 | **WM** | Anne Collins-esque RLWM task. One card shown, choose one of three response keys. Set size 8 (8 cards in a single block), 108 trials, reward only (1p / 50p / £1). |
| 4 | Break | Experimenter-gated — press `c` to continue. |
| 5 | **Post-PILT test** | 60 trials, 4 blocks. Cards from the learning phase re-paired, no feedback. |
| 6 | **Post-WM test** | 28 trials, 1 block. Same idea for the WM stimuli. |
| 7 | Bonus screen | Shows total bonus. Experimenter-gated — press `p` to finish. |

A few behaviours worth knowing:

- **PILT blocks can end early.** A block stops once the last five choices were
  optimal for every card pair in it (at least five trials must have elapsed). The
  current sequences use one pair per block, so in practice that means five optimal
  choices in a row. 150 trials is therefore a ceiling, not the expected count.
- **Confidence ratings** are collected in both test phases, every 4th trial, on a
  1–5 scale.
- **Response deadlines** are 4 s normally, extended to 6 s after a participant has
  accrued warnings. Missing the deadline triggers a "didn't catch a response"
  message; there's a cap of 3 such warnings per task.
- **Bonus** is (currently) scaled between a £3.00 floor and a £5.00 maximum, based on where
  total earnings fall between the minimum and maximum achievable across both tasks.
  See `computeTotalBonus()` in [core/utils/bonus.js](core/utils/bonus.js).

## The three sessions

Participants complete the battery three times. The session keys used in code and in
the data are `wk0`, `wk2` and `wk4`; the launcher page presents them to experimenters
as Session 1, 2 and 3:

| Launcher label | Session key |
|----------------|-------------|
| Session 1 | `wk0` |
| Session 2 | `wk2` |
| Session 3 | `wk4` |

The structure is identical across sessions — same tasks, same trial counts, same
bonus scheme. What changes is the **stimuli and trial orderings**: each session has
its own independently generated sequence files, so participants never re-learn the
same card-outcome mappings.

```
tasks/card-choosing/sequences/
├── PILT/       trial1_wk0.js  trial1_wk2.js  trial1_wk4.js
├── WM/         trial1_wk0.js  trial1_wk2.js  trial1_wk4.js
├── PILT-test/  trial1_wk0.js  trial1_wk2.js  trial1_wk4.js
└── WM-test/    trial1_wk0.js  trial1_wk2.js  trial1_wk4.js
```

The session is picked by the `session` URL parameter, which selects the matching
sequence file for every task in the module. It defaults to `wk0` if omitted.

The only other session-dependent behaviour is the welcome text: at `wk0` it adds a
line asking participants to read the instructions carefully, since they differ from
the training session ([api/messages.js](api/messages.js)).

## Running a session

Normally, open the launcher page and fill in the form — enter the participant ID,
pick the session from the dropdown, and press start:

```
https://oestrogen-project.web.app/
```

It just builds the experiment URL for you. You can also go straight there:

```
https://oestrogen-project.web.app/experiment.html?participant_id=PPT001&session=wk0
```

| Parameter | Required | Notes |
|-----------|----------|-------|
| `participant_id` | yes | Recorded on every Firestore document. |
| `session` | no | `wk0` \| `wk2` \| `wk4`. Defaults to `wk0`. |

The experiment runs fullscreen and blocks refresh and right-click. If the participant
leaves fullscreen, they're prompted back and a warning is counted.

### Testing

Two magic strings in `participant_id` change behaviour ([experiment.html](experiment.html)):

- **`debug`** — no fullscreen enforcement, no navigation blocking. Also flags the
  session document with `is_debug: true`.
- **`simulate`** — jsPsych auto-plays the whole battery. Writes are logged to the
  console instead of hitting Firestore, *unless* you add `&firebase=1`.

```
# dry run, nothing written to Firestore
...?participant_id=debug_simulate_01&session=wk0

# simulated run that does write to Firestore
...?participant_id=debug_simulate_01&session=wk0&firebase=1
```

Use a `participant_id` containing both `debug` and `simulate` for test runs, so the
data is filterable later via the `is_debug` flag.

The launcher form can't add `&firebase=1`, so use a direct `experiment.html?...` URL
when you want a simulated run to actually write.

## Data

### Firestore

Trials are written continuously, one document field per trial, keyed by zero-padded
jsPsych trial index. Document IDs are the participant's anonymous auth UID.

```
pilt-wm-main/tasks/session/{uid}     session metadata, bonus, completion flag
pilt-wm-main/tasks/PILT/{uid}        PILT learning trials
pilt-wm-main/tasks/WM/{uid}          WM learning trials
pilt-wm-main/tasks/other/{uid}       instructions, inter-block screens, etc.
pilt-wm-test/tasks/pilt_test/{uid}   post-PILT test + confidence ratings
pilt-wm-test/tasks/wm_test/{uid}     post-WM test + confidence ratings
```

Writes are batched to at most one per second per document to stay within Firestore's
per-document write limit, and failed writes are retried with backoff rather than
dropped. If saving fails repeatedly a red banner appears telling the participant to
fetch the experimenter. See [core/utils/saveData.js](core/utils/saveData.js).

A session is only marked `expCompleted: 1` once the participant reaches the end and
the server acknowledges every pending write.

### Local CSV backup

At the end of every session the browser also downloads a full CSV
(`{participant_id}_{timestamp}.csv`). This is written *before* the final Firestore
flush, so there's always a local copy even if the network fails.

### Getting the data out

[scripts/download_data.py](scripts/download_data.py) pulls everything into tidy CSVs
using the Admin SDK:

```bash
pip install -r scripts/requirements.txt
python scripts/download_data.py --key path/to/serviceAccountKey.json
python scripts/download_data.py --key ... --session wk0 --completed-only
```

The service account key is **not** in this repo and must never be committed or
deployed — it bypasses all Firestore security rules.

## Repository structure

```
├── experiment.html          # the entry point participants load
├── index.html               # launcher form (participant ID + session dropdown)
├── firebase.json            # hosting config + deploy ignore list
├── firestore.rules          # each UID may only touch its own documents
├── api/
│   ├── module-registry.js   # the oestrogen_battery module definition
│   ├── task-registry.js     # per-task config and sequence file mapping
│   ├── messages.js          # welcome and break screen text
│   └── utils.js             # timeline assembly
├── core/
│   ├── utils/               # firebase, saveData, bonus, data handling, guards
│   └── jspsych/             # jsPsych 8 library and plugins
├── tasks/card-choosing/     # the only task module left in this fork
│   ├── plugin-card-choosing.js
│   ├── timeline.js, utils.js, instructions.js
│   └── sequences/           # per-session trial sequences (see above)
├── assets/images/           # card stimuli and coin images
├── examples/                # standalone single-task pages, not deployed
└── scripts/                 # data download, not deployed
```

## Deploying

```bash
firebase deploy --only hosting
```

Hosting serves the repo root, so the `ignore` list in
[firebase.json](firebase.json) is what keeps credentials, `.git/`, `scripts/` and
`examples/` off the public site. If you add anything sensitive to the repo root,
add it there too.

Rules and indexes are deployed separately (`--only firestore:rules`) and rarely
need to change.

## Making changes

- **Adjust trial counts, deadlines, or bonus** — [api/task-registry.js](api/task-registry.js)
  (`defaultConfig` per task, plus `globalConfig` at the bottom) and `max_bonus` /
  `min_prop_bonus` in [api/module-registry.js](api/module-registry.js).
- **Change task order or add a task** — the `elements` array in
  [api/module-registry.js](api/module-registry.js).
- **Change instruction or break text** — [api/messages.js](api/messages.js).
- **Add a new session** — drop in sequence files and add the key to each task's
  `sequences` map in the task registry.

`examples/` has standalone pages (`PILT.html`, `WM.html`, `post-PILT-test.html`) for
running a single task in isolation, which is the quickest way to check a change
without sitting through the whole battery.
