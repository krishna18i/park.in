# Park.in — External Round Runbook

## One-sentence position

Park.in is a shared urban curb-capacity operating layer that connects drivers, logistics fleets, parking operators and city authorities in real time.

## Five-minute speaking script

### 0:00–0:35 — Problem and vision

“Cities do not lack parking apps. They lack a shared operating layer for scarce curb capacity. A driver searching for a bay, a delivery vehicle blocking a lane, an operator managing a facility, and an authority responding to congestion are currently disconnected. Park.in connects all four.”

Show the landing animation. Point to the four stakeholder outcomes. Do not introduce Jaipur as the product boundary; describe it only as the pilot dataset.

### 0:35–1:20 — Explainable driver decision

“The driver enters a destination and vehicle type. We do not merely show the nearest facility. ParkScore ranks real capacity using distance, availability, predicted pressure, price and vehicle compatibility, then explains why the option was recommended.”

Open the mobility search and point to the score factors. The key phrase is: “explainable recommendation, not a black-box suggestion.”

### 1:20–2:05 — Logistics flow

“The same capacity network solves a larger transport problem. Delivery vehicles reserve short legal loading windows in heavy bays. That reduces double-parking, corridor blockage and uncertain dwell time while giving authorities visibility into freight demand.”

Open Logistics, choose a heavy bay and explain the 15–120 minute window. A full payment is optional during a five-minute presentation.

### 2:05–3:10 — Sensor-to-city automation

“Now we connect the physical street. This Sensor Lab represents an ultrasonic or camera edge device. An authenticated observation passes a confidence gate, changes the bay state, creates an immutable audit event and reaches every connected screen through WebSockets.”

In City Command, trigger vehicle arrival and departure. If possible, keep the operator console open in the second window so judges see both views update.

### 3:10–4:05 — Authority intervention

“Visibility is useful only when it enables action. The command centre identifies pressure, recommends a lower-load destination, and lets an authorised human approve diversion. Capacity can also be temporarily reassigned for accessible use, emergencies or logistics, with automatic expiry and a full audit trail.”

Show a diversion recommendation, then the dynamic-allocation and incident controls. Say “human-in-the-loop” explicitly.

### 4:05–4:40 — Feasibility and evidence

“This is not a collection of disconnected screens. Booking, payment, QR access, physical sensors, predictions, logistics and city governance share one tested state machine. The prototype has 66 end-to-end backend tests and a production web build.”

Return to Presentation Mode. Show the architecture and system-readiness cards. Clearly call the impact figures modelled projections, not field measurements.

### 4:40–5:00 — Close

“Our pilot begins with existing parking and low-cost edge sensors. The same platform then expands across a city without changing the citizen experience. Park.in turns parking from a destination problem into live transport infrastructure.”

Final line: “One network, four stakeholders, measurable urban movement.”

## Pre-demo checklist

1. Start the backend and frontend at least ten minutes before presenting.
2. Sign in as operator using `admin@parkin.app` / `admin123`.
3. Open `/showcase`, press **Reset scenario**, then **Confirm reset**.
4. Confirm all five readiness cards are green.
5. Run one Sensor Lab arrival/departure cycle.
6. Allow pop-ups so the operator second window can open.
7. Keep the built production version and a screen recording on the laptop.
8. Turn off operating-system notifications and browser password prompts.

## Failure-safe responses

- **Venue internet fails:** the core application, SQLite data, maps already loaded in the browser, payments simulation and sensor simulation run locally. Avoid external place search.
- **Backend temporarily stops:** Presentation Mode retains the last verified readiness snapshot and the complete speaking flow. Restart with `run-backend.ps1`, then press **Recheck**.
- **Live sensor action was already used:** press **Reset scenario** twice and repeat it.
- **Pop-up is blocked:** manually open `/admin` in another tab.
- **A judge challenges the impact numbers:** say they are transparent pilot hypotheses. Quote the displayed assumptions and state that production telemetry will replace them.

## Likely judge questions

**How is this different from a parking marketplace?**  
The marketplace is one interface. Park.in also ingests physical occupancy, coordinates freight windows, supports time-bound public allocation, forecasts pressure and gives authorities governed intervention tools.

**What is actually real?**  
The state machine, atomic bay claim, role controls, QR lifecycle, sensor ingestion, confidence gate, audit records, WebSocket updates, logistics rules, prediction endpoint and governance workflows are implemented. Hardware signals and payment settlement are simulated at documented integration seams.

**How does it scale?**  
Replace SQLite with PostgreSQL/PostGIS, move realtime fan-out to Redis or a managed event bus, partition sensor ingestion by city/zone, and retain the existing API contracts and user flows.

**What prevents authority misuse?**  
Role-gated actions, a human approval step, explicit reasons, time-bounded allocations, immutable sensor events and reversible changes. Production adds SSO, granular roles and signed audit exports.

**Why will operators participate?**  
They gain utilisation, demand visibility, prepaid reservations, simpler gate handling and logistics revenue without replacing all existing infrastructure on day one.
