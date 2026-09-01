# MCETC Real-Time Voice Connect

[![JavaScript](https://img.shields.io/badge/JavaScript-ES%20Modules-F7DF1E?logo=javascript&logoColor=000)](https://developer.mozilla.org/docs/Web/JavaScript)
[![Python](https://img.shields.io/badge/Python-3.x-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![WebRTC](https://img.shields.io/badge/WebRTC-P2P%20Audio%20%2B%20Screen-2F855A)](https://developer.mozilla.org/docs/Web/API/WebRTC_API)
[![WebSocket](https://img.shields.io/badge/WebSocket-Signaling-1C64F2)](https://developer.mozilla.org/docs/Web/API/WebSocket)
[![Version](https://img.shields.io/badge/Version-v1.1.0-6F42C1)](https://github.com/)

> A modular browser-based real-time communication platform built with vanilla JavaScript, WebRTC, and a lightweight Python WebSocket signaling server.

## Overview

MCETC Real-Time Voice Connect started as a browser-first audio communication project and has evolved into a lightweight real-time collaboration app that supports both microphone-based voice and live screen sharing. The application captures microphone input in the browser, negotiates WebRTC connections between participants, and can now add display tracks dynamically without reworking the entire call flow.

The system remains intentionally lightweight and framework-free. That makes it easy to understand, easy to debug, and straightforward to extend into a more complete communication product. In its current form, it offers real-time peer-to-peer audio, dynamic screen sharing, and automatic renegotiation for mid-call media changes — all while keeping the signaling server focused on route coordination rather than media transport.

## Features

- Real-time browser voice calls with WebRTC.
- Screen sharing support built on `getDisplayMedia()` and a dedicated `Display` module.
- Mic capture handled directly in the browser via `getUserMedia()`.
- Dynamic renegotiation for changes to the media graph after a connection is already active, including the addition of screen-share tracks mid-call.
- Peer-to-peer media transport so audio and screen content do not pass through the signaling server.
- WebSocket-based signaling for offers, answers, ICE candidates, and room presence updates, **routed to the specific recipient peer** rather than broadcast to the whole room.
- **Perfect negotiation** per peer connection (`polite` / `makingOffer` state) so concurrent offers and renegotiations do not collide.
- Multi-peer connection management using a dedicated `PeerConnection` instance per participant.
- Automatic peer creation when a new participant joins the room.
- Automatic display propagation to peers that join after the screen share has already started.
- Dynamic audio and video rendering in the DOM for remote participants, with automatic cleanup when a participant leaves, drops, or ends screen sharing.
- STUN-based connectivity support to help peers establish direct routes across networks.
- Modular code separation between audio, display, UI, connection, peer-connection, and signaling responsibilities.
- Lightweight frontend with no framework dependency or build step.
- Python backend that tracks connected clients and relays signaling messages to the correct recipient.
- Simple button-driven flow to start a call, share screen, stop sharing, and disconnect cleanly.

## Tech Stack

- HTML5 for the application shell.
- CSS3 for layout and visual styling.
- Vanilla JavaScript using ES modules.
- WebRTC for peer-to-peer audio and screen transport.
- WebSocket API for signaling coordination.
- Python 3 for the backend signaling server.
- `websockets` Python package for the async WebSocket server.
- Native browser media APIs such as `navigator.mediaDevices.getUserMedia()`, `navigator.mediaDevices.getDisplayMedia()`, and `RTCPeerConnection`.
- STUN servers from public providers to assist NAT traversal.

## Folder Structure

```text
/
├── index.html
├── main.js
├── style.css
├── audio/
│   └── audio.js
├── display/
│   └── display.js
├── connections/
│   └── connection.js
├── peerconnection/
│   └── peerconnection.js
├── signaling/
│   └── signaling.js
├── ui/
│   └── ui.js
└── server/
    ├── main.py
    ├── manejo_de_clientes/
    │   └── worker.py
    └── websocket/
        └── worker.py
```

- `index.html` contains the entry UI and loads the JavaScript module bundle.
- `main.js` holds `Orchestrator`, which coordinates microphone capture, display capture, WebRTC negotiation, signaling, and DOM updates, and routes each incoming signaling message to the right handler.
- `style.css` defines the visual appearance of the current interface and responsive media layout.
- `audio/` contains microphone permission handling, track attachment, and remote audio reception.
- `display/` contains screen-sharing permissions, display track configuration, and remote screen-stream handling.
- `connections/` contains the low-level `RTCPeerConnection` helpers: creating a connection, generating offers/answers, setting local/remote descriptions, and handling ICE negotiation state.
- `peerconnection/` contains `PeerConnection`, one instance per participant — it owns that participant's `RTCPeerConnection`, its pending ICE candidates, and its perfect-negotiation state, and borrows `Connections`/`Signaling`/`Audio`/`Display` instead of creating its own.
- `signaling/` contains the WebSocket client used to communicate with the signaling server.
- `ui/` contains DOM helpers, button state management, and the updated separated audio/video rendering logic.
- `server/` contains the Python WebSocket backend and its support modules for client tracking and message relaying.

## Dynamic Project Architecture

The application is organized around a central orchestration flow in `main.js`, with `Audio` and `Display` both feeding media into the same peer lifecycle.

```mermaid
flowchart LR
    A[Browser UI] --> B[Audio Module]
    A --> C[Display Module]
    A --> D[Orchestrator]
    D --> E[WebSocket Signaling Client]
    E <--> F[Python WebSocket Server]
    F --> G[Client Registry]
    D --> H[PeerConnection per participant]
    H --> B
    H --> C
    H --> I[RTCPeerConnection]
    I <--> J[Remote Peers]
    J --> K[Remote Audio and Screen Elements]
```

### How it works

1. The user presses the start button in the browser.
2. The app requests microphone permissions and stores the local audio stream.
3. A WebSocket connection is opened to the signaling server.
4. The server assigns a client ID and sends the current room state back to the new participant.
5. The client creates one `PeerConnection` per remote participant, which in turn creates its own `RTCPeerConnection`.
6. The app adds local audio tracks to each peer connection, and can later add a display track when the user chooses to share their screen.
7. The browser exchanges `offer`, `answer`, and `ice` messages through the signaling server — each one addressed to a specific recipient, not broadcast.
8. If both sides happen to offer media at the same moment, perfect negotiation resolves the collision instead of failing.
9. If a track is added or removed after the connection is already active, the browser fires `negotiationneeded`, and the `PeerConnection` automatically re-negotiates and re-sends the offer.
10. Once ICE negotiation succeeds, audio and screen data flow directly between browsers.
11. Remote streams are rendered dynamically as `<audio>` and `<video>` elements in the page, and removed automatically when that participant leaves or the display stream ends.

### Data flow

- `Audio` manages the local microphone stream and attaches audio tracks to each peer connection.
- `Display` manages the local screen-share stream and configures sender settings such as target bitrate and frame-rate preference for screen capture.
- `Connections` builds and configures `RTCPeerConnection` instances, including SDP and ICE handling — it has no memory of any specific peer.
- `PeerConnection` is the per-participant object: it holds one participant's `RTCPeerConnection`, id, pending ICE candidates, negotiation state, and calls into `Connections`/`Signaling`/`Audio`/`Display` to do the actual work.
- `Signaling` serializes messages through WebSocket and listens for signaling events.
- `UI` isolates button handling and DOM rendering responsibilities, including `showAudioPeer`/`showVideoPeer` and the corresponding removal logic for audio and video elements.
- `Orchestrator` coordinates the full lifecycle, keeps `connectionsList` (a `Map` of id → `PeerConnection`) in sync with the room, and dispatches each incoming message type through a handler map instead of a long `switch`.

### Adding new peers

When a new participant joins, the backend notifies existing clients with a `join_notification`. Each active browser then creates a dedicated `PeerConnection` for the newcomer, adds local audio tracks, checks whether a display stream is already active, and adds the screen-share track when needed. The resulting offer is then sent through the signaling channel — addressed to that one participant.

### Screen-sharing lifecycle

The new media flow is designed for dynamic mid-call changes:

- `PeerConnection` exposes `onNegotiationNeeded`, so a connection can renegotiate whenever a new track is added or removed.
- `Display` exposes persistent remote-track callbacks (`onRemoteVideoTrack`) rather than a single-use Promise, so the same peer can send audio and later send a screen-share stream without losing the handler.
- When sharing ends, either via the browser's native stop control or the custom button, the app removes each sender from all live peer connections, which triggers a fresh renegotiation automatically.
- On the receiving side, `stream.onremovetrack` is used to detect that a display stream is no longer available and remove the corresponding video element from the DOM.
- New peers joining after a participant has already started screen sharing receive the display stream immediately because the app checks `display.stream` during `onJoin`/`onUsers`.

### Reusing the template logic

The architecture is already modular enough to scale in the following directions:

- more call controls such as mute, unmute, and device switching,
- additional room state handling,
- participant metadata and avatars,
- recording or transcription layers,
- persistent call history,
- or a full admin dashboard around the signaling backend.

## Installation and Setup

### Prerequisites

- A modern browser with WebRTC support.
- Python 3.10+ recommended.
- The `websockets` package installed in your Python environment.
- VS Code Live Server or any local HTTP server for the frontend.

### Backend setup

1. Open a terminal in the project root.
2. Create and activate a virtual environment if you do not already have one.
3. Install the Python dependency:

```bash
pip install websockets
```

4. Start the signaling server:

```bash
python server/main.py
```

The backend listens on `localhost:8765`.

### Frontend setup

1. Serve the project with a local HTTP server such as Live Server.
2. Open `index.html` through that server, not directly with `file://`.
3. If you are running everything locally, update the WebSocket URL in `signaling/signaling.js` so it points to your local signaling server instead of the hosted tunnel currently defined in the code.
4. Accept the browser permission prompts for both microphone access and screen capture when you start a call or share your display.

### Recommended local workflow

1. Start the Python signaling server.
2. Launch the frontend through Live Server.
3. Open the page in two (or more) browser tabs or devices.
4. Grant microphone permissions.
5. Press the start button on each client and verify that audio is exchanged peer to peer.
6. Use the screen-share button to start a display stream, then stop it either through the custom button or the browser's native control to confirm renegotiation and DOM cleanup work correctly.

## Responsive Design

The current UI is intentionally minimal, but the project is structured to work across desktop, tablet, and mobile browsers. The layout uses standard HTML, a viewport meta tag, and responsive CSS rules for both the audio and video containers, which keeps the interface functional across common screen sizes.

For production use, the layout should be expanded with dedicated breakpoints, stronger spacing rules, and a more complete mobile call experience. The new `#video_site` container and dynamic `video` sizing logic are a strong base for more polished screen-sharing layouts.

## Performance and Optimization

- Audio and screen content travel directly between peers once WebRTC negotiation is complete.
- The signaling server only exchanges control messages, and now routes them to the intended recipient instead of broadcasting to every connected client — less noise, fewer chances of a message being misapplied to the wrong connection.
- The codebase is split into small modules, making the runtime easier to reason about and the app easier to maintain.
- Display capture uses configured quality settings up to 1080p at 60 FPS, with targeted bitrate control and frame-rate preference to keep the stream fluid without exhausting bandwidth.
- STUN servers are used to improve connectivity across NATs and less friendly network environments.
- The frontend is dependency-light, which keeps the payload small and the boot process fast.

## What's New in v1.0.4

- Extracted `PeerConnection`: the offer/track/answer logic that used to be duplicated across three message-handling branches now lives in one class, one instance per participant.
- Replaced the message-handling `switch` with a handler map (`{ offer: this.onOffer, ... }`) on `Orchestrator` — each message type is its own small, testable method.
- Added perfect negotiation (`polite` / `makingOffer` per `PeerConnection`) to resolve the case where two participants offer audio to each other simultaneously — previously this produced an `InvalidStateError` and a failed connection.
- Signaling messages for `offer`/`answer`/`ice` now carry a `to_client_id`, and the server routes them only to that recipient instead of broadcasting to the whole room — with three or more participants, the broadcast approach could apply a message meant for one pair to an unrelated connection.
- Fixed disconnect/reconnect: the client now actually closes the WebSocket on hangup instead of leaving it open and opening a second one on rejoin; the server's exit notification now correctly names the participant who left (it previously misidentified them due to a variable name collision) and reaches the other participants (it previously crashed trying to serialize a socket object).
- A departed participant's name and audio element are now removed from everyone else's screen, and the DOM containers used for that cleanup are cleared without accidentally destroying the placeholder elements needed for future joins.
- Renamed the frontend classes and folders to consistent, short English names (`conections/conection.js` → `connections/connection.js`, `segnaling/` → `signaling/`, etc.) — this README already reflects the current names.

## What's New in v1.1.0

- Added screen sharing support with a dedicated `Display` module and browser capture via `getDisplayMedia()`, following the same pattern as the existing audio flow.
- Introduced configurable display quality settings up to 1080p at 60 FPS, with a sender bitrate target of roughly 8 Mbps and `degradationPreference: "maintain-framerate"` to keep the stream fluid on shared screens.
- Added both a share button and a separate stop-sharing button in the UI, so users can stop screen sharing manually without relying only on the browser's native control.
- Added dynamic renegotiation by exposing `onNegotiationNeeded` on `Connections` and automatically reacting to `negotiationneeded` inside `PeerConnection`, allowing media tracks to be added or removed after the call is already active.
- Replaced the single-use remote-track Promise pattern with persistent callbacks: `onRemoteAudioTrack` and `onRemoteVideoTrack` filter by `track.kind` so the same peer can send audio now and share screen later without losing track handling.
- Extended `PeerConnection` to receive a `Display` instance and added `addDisplayTrack()`, keeping the screen-share flow symmetric with the existing audio track logic.
- Improved the screen-sharing lifecycle: when the partner ends sharing, the app removes each sender with `connection.removeTrack(sender)` to trigger automatic renegotiation; when the stream is removed remotely, it listens for `stream.onremovetrack` and removes the video from the DOM.
- Updated the UI API to use separate methods for audio and video rendering (`showAudioPeer` / `showVideoPeer`, `removeAudio` / `removeVideo`), and added a dedicated `#video_site` container with CSS rules to prevent video overflow and keep the layout responsive.
- Ensured new participants joining a room after screen sharing has already started receive the active display stream immediately by checking `display.stream` during `onJoin` and `onUsers` processing.

## Future Improvements

- Replace the hardcoded signaling URL with environment-based configuration.
- Add mute/unmute controls for microphone and call audio.
- Improve the visual design with a more premium production UI.
- Introduce room management and multiple call channels.
- Add retry and reconnection logic for transient network failures beyond the manual "leave/rejoin" flow.
- Persist participant metadata and room state on the backend.
- Add call quality telemetry and clearer RTC diagnostics.
- Implement lazy loading for any future media or UI-heavy assets.
- Add an admin or monitoring dashboard for server-side visibility.
- Migrate `sendMessage`/`send_message`'s growing list of optional positional parameters to a single options object, so adding a new field doesn't require touching the signature and every call site.

## Credits

- Built with native browser APIs: WebRTC, WebSocket, Media Capture, and screen-sharing support.
- Python backend communication powered by the `websockets` library.
- Connectivity supported by public STUN infrastructure from Google, Mozilla, Twilio, Sipgate, and Nextcloud as configured in the client.
- The project structure follows a modular, framework-free frontend pattern that keeps responsibilities separated and easy to extend.

## Notes

- The frontend is not bundled by a build tool; it is designed to run as a static module-based app.
- The current UI is a functional prototype, so the README describes the architecture and production direction rather than overstating finished polish.
- This project continues to evolve from its original voice-only design toward a broader real-time collaboration workflow without discarding the small, readable architecture that made the first version easy to maintain.
