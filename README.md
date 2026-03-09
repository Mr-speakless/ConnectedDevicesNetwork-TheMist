# TheMist

TheMist is a small VOC monitoring dashboard for a kitchen scenario:

- Arduino samples the sensor continuously.
- Arduino averages the last `15s` of sensor readings.
- Arduino publishes one MQTT message every `15s`.
- A Node.js server subscribes to MQTT, detects cooking events, persists state, and exposes REST APIs.
- A React frontend polls those APIs and renders three cards:
  - live VOC status
  - recent cooking event detail
  - clean reminder / clean acknowledgement

## Current Data Shape

Each MQTT reading is treated as one aggregated sample:

- `voc`
- `temperature`
- `humidity`
- `time` / `deviceTime`
- server receive time:
  - `receivedAt`
  - `realTimestamp`
  - `realTimestampIso`

Important assumption:

- one uploaded point already represents a `15s` average
- event detection therefore works on `15s` averaged samples, not on raw second-level spikes

## Current Event Detection

The current detector is implemented in `server/eventDetection.js`.

It uses a two-layer model:

1. Detect short burst fragments.
2. Merge nearby fragments into one cooking session.

### 1. Burst Fragment Detection

The detector first builds two local descriptors for each sample:

- `baseline`
  - rolling median of the previous `12` samples
  - about `3 minutes` of local background
- `range`
  - `max(voc) - min(voc)` over the recent `3` samples
  - about `45 seconds` of local volatility

Then it computes:

- `levelDelta = voc - baseline`

A sample is considered `burst high` only if both are true:

- `levelDelta >= 25`
- `range >= 30`

This means:

- high but smooth plateaus should not trigger events
- only elevated and visibly unstable segments count as cooking bursts

Fragment boundaries:

- fragment start:
  - `2` consecutive burst-high samples
  - about `30s`
- fragment end:
  - `3` consecutive calm samples
  - calm means `range < 30`
  - about `45s`

Default parameters:

- `sampleIntervalMs = 15000`
- `baselineWindowSamples = 12`
- `rangeWindowSamples = 3`
- `fragmentEnterDelta = 25`
- `fragmentEnterRange = 30`
- `fragmentStartConfirmSamples = 2`
- `fragmentCalmRange = 30`
- `fragmentEndConfirmSamples = 3`

### 2. Cooking Session Merge

After fragments are found, the backend merges them into one event if the gap is short:

- `mergeGapMs = 900000`
- this is `15 minutes`

Merge rule:

- if `nextFragment.startTime - previousFragment.endTime < 15 minutes`
- both fragments belong to the same cooking session

The merged event stores:

- `startTime`
- `endTime`
- `durationMs`
- `fragmentCount`
- `burstDurationMs`
- `peakVoc`
- `avgVoc`
- `peakDelta`
- `avgDelta`
- `exposureScore`

## Pending Merge Behavior

The realtime server does not immediately finalize a session when a fragment ends.

Instead:

- while a fragment is actively happening:
  - `activeEvent` is the active fragment
- after a fragment ends:
  - the merged session becomes `pending_merge`
- if another fragment appears within `15 minutes`:
  - it is merged back into the same session
- if `15 minutes` pass without a new fragment:
  - the session is finalized and moved into `recentEvents`

This avoids cutting one cooking session into many separate events.

## Current Behavior On `log0223Evening.json`

The current implementation was tuned against `tests/log0223Evening.json`.

Expected fragment detection on that file:

- `783444 -> 845447`
- `891948 -> 938448`
- `1077957 -> 1186464`
- `1434483 -> 1527495`

Expected merged result:

- one cooking event
- `startTime = 783444`
- `endTime = 1527495`
- `fragmentCount = 4`

Important observed behavior:

- the later smooth high plateau around `3.39M` should not be classified as a cooking event
- this is intentional and is one of the main reasons the detector uses `volatility` as part of the trigger

## Current Backend API

### `GET /api/air-quality`

Used for the live dashboard.

Returns:

- `connected`
- `lastMessageAt`
- `signals`
- `eventConfig`
- `eventSummary`
- `cleanState`
- `activeEvent`
- `currentSession`
- `pendingMergeEvent`
- `latest`
- `stats`
- `points`

### `GET /api/events?limit=N`

Used for recent event browsing.

Returns:

- `summary`
- `activeEvent`
- `currentSession`
- `pendingMergeEvent`
- `cleanState`
- `recentEvents`

### `GET /api/events/:id`

Used for event detail charts.

Returns:

- one event or session detail
- `samples`
- `fragments`
- `summary`
- `activeEvent`
- `currentSession`
- `pendingMergeEvent`

### `POST /api/clean`

Records a clean acknowledgement.

It does not delete historical events.  
It only resets the clean baseline used for the clean reminder card.

## Frontend Integration Status

The current frontend already works with the new backend without mandatory interface changes.

Why:

- the fields it already consumes are still present
- the new session logic is mostly additive

Current frontend usage:

- `DurationCard`
  - uses `/api/air-quality`
  - consumes:
    - `connected`
    - `latest.voc`
    - `eventSummary.totalEventDurationMs`
    - `eventSummary.totalEventCount`
    - `points`
- `AvgCard`
  - uses `/api/events`
  - uses `/api/events/:id`
  - consumes:
    - `currentSession`
    - `recentEvents`
    - selected event `samples`
    - selected event `avgVoc`
    - selected event `startTime`
- `CleanSliderCard`
  - uses `cleanState`
  - uses `POST /api/clean`

So for the current UI:

- no required frontend API change, as long as the backend exposes `currentSession`

Only if you want new UI states for:

- `pending_merge`
- fragment-by-fragment visualization
- separate session vs fragment labels

then small frontend mapping changes will be needed.

## Persistence

The backend persists event state to:

- `data/event-store.json`

Stored state includes:

- summary counters
- recent completed events
- recent detailed events
- `currentSession`
- `activeFragment`
- clean state

If the server restarts:

- pending session state can be restored
- if a pending merge window has already expired, the session is finalized on restore

## Useful Commands

Install dependencies:

```bash
npm install
```

Run the backend:

```bash
npm run server
```

Run tests:

```bash
npm run test
```

Replay a historical log:

```bash
node scripts/replay-events.js tests/log0223Evening.json --compare
```
