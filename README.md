# P1 — Audio call + screen sharing app (WebRTC)

Complete README, explained from scratch. If you've never touched this code, start here and
read it in order.

Technical terms (stream, offer, ICE, etc.) are linked to the
[GLOSARIO.md](GLOSARIO.md). Ctrl + click each link the first time it appears.


NOTE---

In the editor you're seeing the raw text: Markdown tables always look misaligned there because each cell has a different width. Once rendered, they look fine.

To see it rendered in VS Code:

1. [Ctrl+Shift+V] → opens the preview in a tab.

2. Ctrl+K then V → side-by-side preview, updates while you edit.

3. The magnifier/split-screen icon at the top right of the editor.


---

## 1. What does the app do?

It's a group call in the browser:

- Each person joins with a name.
- On joining, they share their **microphone** with everyone else.
- Optionally they can **share their screen**; the others see it in a `<video>`.
- There's no media backend of our own: audio and video travel **directly between browsers**
  using [WebRTC](GLOSARIO.md#7-rtcpeerconnection).
- There's only a **signaling server** (a WebSocket) used so the browsers can find each
  other and agree on things. That server **is not in this repo**
  (it's an ngrok URL in [signaling/signaling.js:11](signaling/signaling.js#L11)).

Topology: **full mesh**. With N people, each browser keeps N‑1
[RTCPeerConnection](GLOSARIO.md#7-rtcpeerconnection)s, one for each other person. There's
no central server mixing the audio.

---

## 2. What you need for it to work

1. Serve the folder over HTTP (don't open `index.html` with a double click). ES modules and
   `getUserMedia` require `http://localhost` or `https://`.
   Example: `python -m http.server` inside the folder, then open `http://localhost:8000`.
2. The signaling server has to be up at the URL in
   [signaling/signaling.js:11](signaling/signaling.js#L11). If not, nothing happens when you
   click "Join call".
3. Allow the microphone when the browser asks.

---

## 3. File structure

```
index.html                    Visual structure + IDs the JS looks up. Loads main.js as a module.
style.css                     Styles. No logic.
main.js                       Orchestrator. Ties all the pieces together and handles button events.
signaling/signaling.js        Signaling class — talks to the server over WebSocket.
connections/connection.js     Connections class — creates and operates the RTCPeerConnection object.
audio/audio.js                Audio class — microphone: capture, send, receive.
display/display.js            Display class — screen: capture, send, receive.
peerconnection/peerconnection.js  PeerConnection class — EVERYTHING for ONE remote peer together.
ui/ui.js                      UI class — create/remove DOM elements. No networking logic.
GLOSARIO.md                   Explanation of each WebRTC concept.
```

Mental rule: **each class is a layer**. `main.js` (top) calls `PeerConnection`, which
calls `Connections` / `Audio` / `Display` / `Signaling` (bottom). The lower layers
never call upward: they receive *callbacks*.

---

## 4. The HTML: the IDs the code looks up

Everything `ui.js` and `main.js` manipulate comes from these IDs (they're in
[index.html](index.html)). If you rename an ID here, you have to rename it in the JS.

| ID | What it is | Who uses it |
|---|---|---|
| `modal_overlay` | Dark layer of the name modal | `showUsernameModal` / `hideUsernameModal` |
| `usarname_input` | Name text input *(yes, it's misspelled)* | `getUsernameInput` |
| `btn_close` | "Save" button of the modal | `bindSaveUsername` |
| `usarname_grettings` | `<h3>` that greets you by name *(misspelled)* | `showUsername` |
| `button_to_enter_into_the_call` | "Join call" button | `bindEnterCallButton` |
| `button_to_close_connection` | "Leave call" button | `bindExitCallButton` |
| `button_to_share_display` | "Share screen" button | `bindShareDisplayButton` |
| `button_to_stop_share_display` | "Stop sharing" button | `bindStopShareDisplayButton` |
| `audio_from` | `<h3>` listing the names of who you can hear | `showAudioPeer` / `removeText` |
| `audio_site` | Container for the remote `<audio>` elements | `showAudioPeer` / `removeAudio` |
| `video_site` | Container for the remote `<video>` elements | `showVideoPeer` / `removeVideo` |

`main.js` is loaded like this: `<script src="main.js" type="module" defer></script>`
([index.html:65](index.html#L65)). When the module loads, the last line of `main.js`
(`const app = new Orchestrator()`) starts everything.

---

## 5. THE PIPELINE (flow of a call, from start to finish)

This is the important part. Read all of it even if you don't understand every step; the
reference for each method (section 6) clears it up afterwards.

### 5.1 Page startup

1. `main.js` loads → `new Orchestrator()` runs
   ([main.js:378](main.js#L378)).
2. The constructor creates **one** instance of each shared class (`Audio`, `Display`,
   `UI`, `Connections`, `Signaling`) and an empty `Map` `connectionsList` (peer id →
   `PeerConnection` object). Then it calls `init()`.
3. `init()`:
   - If there's no name in `localStorage`, it shows the modal and waits for you to save one.
   - If there is one, it greets you and stores the name in `this.userName`.
   - Leaves the leave and screen buttons **disabled**.
   - "Binds" the 4 buttons to their functions.
   - Registers `beforeunload` to notify the server if you close the tab.

At this point the app is idle, waiting for you to click **Join call**.

### 5.2 Joining the call

When clicking **Join call** ([main.js:64](main.js#L64)):

1. Enables the "Share screen" button.
2. `audio.requestMicrophoneAccess()` → requests the mic with
   [getUserMedia](GLOSARIO.md#2-getusermedia-and-getdisplaymedia). Returns `true`/`false`.
   The mic's [MediaStream](GLOSARIO.md#1-mediastream-vs-mediastreamtrack) is stored in
   `audio.stream`.
3. If permission was granted:
   - `signaling.connect(...)` → opens the **WebSocket**
     ([signaling](GLOSARIO.md#8-signaling--and-why-a-separate-server-is-needed)).
   - `signaling.sendMessage(null, null, username)` → sends your name to the server to
     register you.
   - `listenForMessages()` → hooks up the "router" that reacts to each message from the
     server.
   - Disables "Join", enables "Leave".

### 5.3 The server introduces you to the others

The server replies with messages that land in the router in
`listenForMessages()` ([main.js:301](main.js#L301)). The types:

| Server message | Handler | What it causes |
|---|---|---|
| `users_in_connection` | `onUsers(data)` | `data` is the list of ids already present. You create a full `PeerConnection` for each one. |
| `join_notification` | `onJoin(id)` | Someone **new** joined. You create their full `PeerConnection`. |
| `id_notification` | `onId(id)` | You create a **basic** `PeerConnection` (no tracks or listeners yet). |
| `offer` | `onOffer(id, data)` | You received an [offer](GLOSARIO.md#9-offer--answer--sdp). You add your audio and reply with an answer. |
| `answer` | `onAnswer(id, data)` | Reply to your offer. You apply it as the remote description. |
| `ice` | `onIce(id, data)` | An [ICE candidate](GLOSARIO.md#11-ice-candidate-stun-ice-servers) from the other side. You add it (or queue it). |
| `exit_notification` | `onExit(data)` | Someone left. You clean up their connection and their UI. |
| `error` | `onError(data)` | `alert(data)`. |

### 5.4 Setting up a connection with another peer (the heart of it)

When you create a "full" `PeerConnection` (`onJoin` / `onUsers`):

1. `new PeerConnection(id, userName, signaling, connections, audio, display)` — stores the
   remote peer's id and the dependencies.
2. `peer.connect()`:
   - Creates the actual [RTCPeerConnection](GLOSARIO.md#7-rtcpeerconnection) with the list
     of [STUN](GLOSARIO.md#11-ice-candidate-stun-ice-servers) servers.
   - Hooks [onicecandidate](GLOSARIO.md#12-onicecandidate): each candidate the browser
     discovers is sent to the other side through signaling (`sendMessage("ice", ...)`).
   - Hooks [onnegotiationneeded](GLOSARIO.md#18-negotiationneeded-renegotiation): whenever
     (re)negotiation is needed, it creates an offer and sends it.
3. `peer.addAudioTracks()`:
   - Takes the mic's [tracks](GLOSARIO.md#1-mediastream-vs-mediastreamtrack).
   - For each one not already added: `connection.addTrack(track, stream)`
     ([addTrack](GLOSARIO.md#14-addtrack--removetrack)) → returns a
     [sender](GLOSARIO.md#15-rtcrtpsender--rtcrtpreceiver-sender--receiver).
   - `configureAudioSender(sender)` sets its max bitrate.
   - **That `addTrack` triggers `negotiationneeded`** → the offer is created automatically
     and sent over the WebSocket.
4. If you were already sharing your screen (`display.stream` exists), also
   `peer.addDisplayTrack()`.
5. `peer.onRemoteAudio(cb)` / `peer.onRemoteVideo(cb, cbEnd)`:
   - Hook the [track](GLOSARIO.md#17-ontrack-track-event-and-eventstreams) event. When
     the other side's media starts arriving, the callback receives the `stream` and `ui`
     creates the `<audio>` or `<video>`.
6. `peer.monitorState(cb)`:
   - Hooks [onconnectionstatechange](GLOSARIO.md#22-connectionstate--onconnectionstatechange).
     If the connection goes to `failed` / `disconnected` / `closed`,
     `removeDeadConnection(id)` is called.

### 5.5 The offer/answer/ICE round trip

Between the two browsers, over the WebSocket, this happens (it can overlap in time):

```
BROWSER A                               SERVER                   BROWSER B
  |-- addTrack triggers negotiationneeded ---------------------------> |
  |-- sendMessage("offer", SDP) ---------> relay ----> onOffer(A, SDP) |
  |                                                    addAudioTracks()|
  |                                                    createAnswer()  |
  | onAnswer(B, SDP) <---- relay <-------- sendMessage("answer", SDP) --|
  |                                                                    |
  |-- onicecandidate x N: sendMessage("ice", c) --> relay --> onIce ---> |
  | <---- relay <---- onicecandidate x N: sendMessage("ice", c) --------|
  |                                                                    |
  |   (when a candidate pair works)                                    |
  |   connectionState = "connected"  →  audio now flows directly       |
```

- The offer comes from `createOffer()` →
  [setLocalDescription](GLOSARIO.md#10-setlocaldescription--setremotedescription).
- `onOffer` on B:
  [setRemoteDescription](GLOSARIO.md#10-setlocaldescription--setremotedescription)(offer)
  → `createAnswer()` → `setLocalDescription`(answer) → sends the answer.
- `onAnswer` on A: `setRemoteDescription`(answer). Negotiation closed
  ([signalingState](GLOSARIO.md#21-signalingstate) goes back to `stable`).
- ICE candidates that arrive **before** there's a `remoteDescription` are stored in
  `pendingIceCandidates` and applied later
  ([candidate queue](GLOSARIO.md#13-ice-candidates-that-arrive-too-early-pendingicecandidates)).

### 5.6 Sharing the screen (renegotiation)

When clicking **Share screen** ([main.js:93](main.js#L93)):

1. `display.requestVideoAccess()` →
   [getDisplayMedia](GLOSARIO.md#2-getusermedia-and-getdisplaymedia). The native picker
   appears.
2. For **each** already connected peer: `peer.addDisplayTrack()` → video `addTrack` →
   **each one triggers `negotiationneeded`** → a new offer per peer →
   [renegotiation](GLOSARIO.md#18-negotiationneeded-renegotiation).
3. `display.onDisplayEnded(track, cb)` hooks
   [track.onended](GLOSARIO.md#6-trackonended-vs-streamonremovetrack): if you stop
   sharing from the browser's native button, `stopSharingDisplay()` is called.

On the receiving side: the `track` event with `kind === "video"` creates the `<video>`,
and it also hooks
[stream.onremovetrack](GLOSARIO.md#6-trackonended-vs-streamonremovetrack) to know when
the other side stops sharing.

### 5.7 Stopping screen sharing

When clicking **Stop sharing** ([main.js:126](main.js#L126)) or when closing it from the
browser:

1. `stopSharingDisplay()`: for each peer it finds the video
   [sender](GLOSARIO.md#15-rtcrtpsender--rtcrtpreceiver-sender--receiver) and calls
   `connection.removeTrack(sender)` ([removeTrack](GLOSARIO.md#14-addtrack--removetrack)).
   That triggers another renegotiation and, on the other side, `stream.onremovetrack`.
2. `track.stop()` on the screen tracks to actually turn off the capture
   ([track.stop()](GLOSARIO.md#5-trackstop--actually-turning-off-the-source)).

### 5.8 Leaving the call

When clicking **Leave call** ([main.js:143](main.js#L143)):

1. Disables the 3 action buttons.
2. `peer.close()` on each peer: removes the audio/video listeners and closes the
   `RTCPeerConnection`.
3. Sends `exit_notification` to the server, empties `connectionsList`, closes the WebSocket.
4. Enables "Join", empties the audio and video containers in the DOM
   (`replaceChildren()`).

### 5.9 Someone drops or the server dies

- **A peer drops**: its `onconnectionstatechange` → `removeDeadConnection(id)` → `close()`
  + delete from the `Map` + delete its UI. An `exit_notification` also arrives → `onExit`
  does the same.
- **The server goes down**: the WebSocket fires `onclose` → `handleServerDown()` → closes
  all peers and cleans up (no one can be notified, the channel is dead).

---

## 6. Reference class by class, method by method

### 6.1 `Signaling` — [signaling/signaling.js](signaling/signaling.js)

The only bridge to the server. Speaks **JSON over WebSocket**.

| Member | What it does |
|---|---|
| `this.socket` | The `WebSocket` object. `null` until connected. |
| `connect(handleServerDown)` | Returns a `Promise`. Opens the WebSocket to the fixed URL. `onopen` → `resolve()`. `onerror` → `reject()`. `onclose` → calls `handleServerDown()` (the server died). |
| `disconect()` | *(yes, it's missing an "n")* Closes the socket. Used when leaving the call. |
| `sendMessage(type, data, username = null, to_client_id = null)` | If the socket is `OPEN`, builds `{ type, data }`, and if you pass `username` or `to_client_id` it adds them to the object. Sends `JSON.stringify(message)`. `to_client_id` = "this message is for this peer". |
| `onMessage(callback)` | Sets `socket.onmessage`. Parses `{ type, data, id }` from the incoming message and calls `callback(type, data, id)`. `id` = who originated it. If the JSON is invalid, it ignores it. |

**Outgoing** message format: `{ type, data, username?, to_client_id? }`.
**Incoming** format: `{ type, data, id }`.

### 6.2 `Connections` — [connections/connection.js](connections/connection.js)

Thin wrapper over the [RTCPeerConnection](GLOSARIO.md#7-rtcpeerconnection). Holds no
state; receives the `connection` as a parameter in almost every method.

| Method | What it does |
|---|---|
| `createConnection()` | `new RTCPeerConnection({ iceServers: [...] })` with 9 public [STUN](GLOSARIO.md#11-ice-candidate-stun-ice-servers) servers. Returns the object. **There's no TURN** → if both peers are behind a very strict NAT, the connection may fail. |
| `monitorState(id, connection, onDeadConnection)` | Sets `connection.onconnectionstatechange`. Reads `connection.connectionState`; if it's `failed`, `disconnected` or `closed`, calls `onDeadConnection(id)`. See [connectionState](GLOSARIO.md#22-connectionstate--onconnectionstatechange). |
| `createOffer(connection)` | `await connection.createOffer()`. Returns the [offer](GLOSARIO.md#9-offer--answer--sdp) SDP. |
| `createAnswer(connection)` | `await connection.createAnswer()`. Returns the answer SDP. |
| `setLocalDescription(connection, description)` | `await connection.setLocalDescription(description)`. See [descriptions](GLOSARIO.md#10-setlocaldescription--setremotedescription). |
| `setRemoteDescription(connection, description)` | `await connection.setRemoteDescription(description)`. |
| `onIceCandidate(connection, callback)` | Sets `connection.onicecandidate`. Only calls `callback(event.candidate)` if `event.candidate` isn't `null` (null = "I'm done gathering"). See [onicecandidate](GLOSARIO.md#12-onicecandidate). |
| `onNegotiationNeeded(connection, callback)` | Sets `connection.onnegotiationneeded`; calls `callback()` with no arguments. See [negotiationneeded](GLOSARIO.md#18-negotiationneeded-renegotiation). |
| `getStats(connection)` | Debug only. `await connection.getStats()`, iterates and prints each entry. See [getStats()](GLOSARIO.md#23-getstats--looking-inside-debugging). |

### 6.3 `Audio` — [audio/audio.js](audio/audio.js)

Everything about the microphone. A single instance for the whole app (one mic, many peers).

| Member | What it does |
|---|---|
| `this.stream` | The mic's [MediaStream](GLOSARIO.md#1-mediastream-vs-mediastreamtrack). `null` until permission is requested. |
| `this.trackHandlers` | Object `{ peerId: handler }`. Stores the function listening to each peer's `track` event, so it can be removed later. |
| `requestMicrophoneAccess()` | [getUserMedia](GLOSARIO.md#2-getusermedia-and-getdisplaymedia) with audio constraints (echo cancel off, noise suppression on, 96 kHz, 24 bits, stereo, latency 0). Stores it in `this.stream`. Returns `true` if permission was granted, `false` if not. |
| `getAudioTracks()` | `this.stream.getTracks()` — returns **all** the stream's tracks (here there's only audio). |
| `getAudioSenders(connection)` | `connection.getSenders()` — the current [senders](GLOSARIO.md#15-rtcrtpsender--rtcrtpreceiver-sender--receiver) of that connection. |
| `hasAudioTrack(track, senders)` | `true` if any sender is already sending that track (compares by `track.id`). Used to avoid adding the same track twice. |
| `addAudioTrack(track, connection)` | `connection.addTrack(track, this.stream)`. Returns the sender. Triggers [negotiationneeded](GLOSARIO.md#18-negotiationneeded-renegotiation). |
| `configureAudioSender(sender)` | Reads `sender.getParameters()`, ensures `encodings[0]`, sets `maxBitrate = 510000`, applies with `setParameters()`. See [setParameters](GLOSARIO.md#16-sendergetparameters--setparameters--send-quality). |
| `onRemoteAudioTrack(id, connection, callback)` | Creates a handler for the [track](GLOSARIO.md#17-ontrack-track-event-and-eventstreams) event; if `event.track.kind === "audio"`, calls `callback(event.streams[0])`. Hooks it with `addEventListener("track", handler)` and stores it in `trackHandlers[id]`. |
| `removeAudioTrackListener(id, connection)` | Takes the stored handler, calls `removeEventListener("track", handler)` and deletes it from `trackHandlers`. |

### 6.4 `Display` — [display/display.js](display/display.js)

Same as `Audio` but for the screen. Same patterns, with one extra: detecting the end of
sharing on **both** sides.

| Member | What it does |
|---|---|
| `this.stream` / `this.trackHandlers` | Same as in `Audio`, but for video. |
| `requestVideoAccess()` | [getDisplayMedia](GLOSARIO.md#2-getusermedia-and-getdisplaymedia) requesting 1920×1080 @ 60fps *ideal*. Stores it in `this.stream`. Returns `true`/`false`. |
| `verificationSettingsVideo(track)` | `track.getSettings()` → prints and returns what the browser **actually** gave (may be less than requested). See [getSettings](GLOSARIO.md#3-trackgetsettings--what-the-browser-actually-gave-you). *(Nobody calls it right now; it's a debug utility.)* |
| `getVideoTracks()` | `this.stream.getVideoTracks()`. |
| `getVideoSenders(connection)` | `connection.getSenders()`. |
| `hasVideoTrack(track, senders)` | Same as `hasAudioTrack`. |
| `addVideoTrack(track, connection)` | `connection.addTrack(track, this.stream)`. Returns the sender. |
| `configureVideoSender(sender)` | `maxBitrate = 8_000_000` and `degradationPreference = "maintain-framerate"` (if the network is bad, it prefers losing sharpness over smoothness). |
| `onDisplayEnded(track, onEndDisplayShare)` | Sets `track.onended`. Fires **on the one sharing** when they stop from the browser's native button. See [onended](GLOSARIO.md#6-trackonended-vs-streamonremovetrack). |
| `onRemoteVideoTrack(id, connection, callback, onEndDisplayShare)` | Handler for the `track` event with `kind === "video"`: calls `callback(event.streams[0])` to render the `<video>`, and also sets `stream.onremovetrack = () => onEndDisplayShare()` to detect when the other side stops sharing. Stores the handler in `trackHandlers[id]`. |
| `removeVideoTrackListener(id, connection)` | Same as in `Audio`. |

### 6.5 `PeerConnection` — [peerconnection/peerconnection.js](peerconnection/peerconnection.js)

**The key class.** One instance = the whole relationship with **one** remote peer. `main.js`
stores these instances in the `Map` `connectionsList`.

| Member | What it is |
|---|---|
| `this.id` | The **remote** peer's id (the one the server assigns). |
| `this.connection` | The actual [RTCPeerConnection](GLOSARIO.md#7-rtcpeerconnection). `null` until `connect()`. |
| `this.pendingIceCandidates` | Queue of [ICE candidates](GLOSARIO.md#13-ice-candidates-that-arrive-too-early-pendingicecandidates) that arrived before there was a `remoteDescription`. |
| `this.userName` | **Your** name (not the peer's). |
| `this.polite` | `this.userName < this.id` (string comparison). Defines who gives way in an offer collision. See [polite/impolite](GLOSARIO.md#19-perfect-negotiation--polite-and-impolite-peers). |
| `this.makingOffer` | `true` while you're creating your offer. Used to detect collisions. See [makingOffer](GLOSARIO.md#20-makingoffer-and-collision-detection). |
| `this.signaling` / `this.connections` / `this.audio` / `this.display` | **Shared** dependencies, received in the constructor, not created here. |

| Method | What it does |
|---|---|
| `constructor(id, userName, signaling, connections, audio, display)` | Just stores everything above. Doesn't touch the network. |
| `connect()` | Creates `this.connection` with `connections.createConnection()`. Hooks `onIceCandidate` → `sendMessage("ice", candidate.toJSON())`. Hooks `onNegotiationNeeded` → `createOffer()` + `sendMessage("offer", offer)`. **This is where offers get generated on their own.** |
| `addAudioTracks()` | For each mic track not already in the connection: `addAudioTrack` + `configureAudioSender`. |
| `addDisplayTrack()` | Same with the screen tracks. |
| `onRemoteAudio(callback)` | Delegates to `audio.onRemoteAudioTrack(this.id, this.connection, callback)`. |
| `onRemoteVideo(callback, onEndDisplayShare)` | Delegates to `display.onRemoteVideoTrack(...)`. |
| `createOffer()` | `makingOffer = true` → `connections.createOffer` → `setLocalDescription` → returns the offer. In `finally`, `makingOffer = false`. |
| `createAnswer(offerReceived)` | Computes `collision = makingOffer \|\| signalingState !== "stable"`. `ignoreOffer = !polite && collision`. If `ignoreOffer` → returns `null` (I ignore your offer, I keep mine). Otherwise: `setRemoteDescription(offer)` → `createAnswer` → `setLocalDescription(answer)` → returns the answer. See [perfect negotiation](GLOSARIO.md#19-perfect-negotiation--polite-and-impolite-peers). |
| `applyAnswer(data)` | `setRemoteDescription(data)`. Closes a negotiation you started. |
| `addIceCandidate(candidate)` | If there's already a `remoteDescription`: first flushes `pendingIceCandidates`, then adds the new one. If not: pushes it into `pendingIceCandidates`. |
| `sendMessage(type, data)` | Shortcut: `signaling.sendMessage(type, data, null, this.id)` (always addressed to this peer). |
| `monitorState(onDead)` | Delegates to `connections.monitorState(this.id, this.connection, onDead)`. |
| `close()` | `audio.removeAudioTrackListener` + `display.removeVideoTrackListener` + `this.connection.close()`. |

### 6.6 `UI` — [ui/ui.js](ui/ui.js)

DOM only. Knows nothing about WebRTC. Receives ready-made data and creates/removes elements.

| Method | What it does |
|---|---|
| `bindEnterCallButton` / `bindExitCallButton` / `bindShareDisplayButton` / `bindStopShareDisplayButton(id, callback)` | Find the button by id and set `element.onclick = () => callback()`. All 4 are identical. |
| `getElementById(id)` | `document.getElementById`, with a `console.log` if it doesn't exist. |
| `createVideoElement(src, id)` | Creates `<video autoplay>`, `srcObject = src` (a [stream](GLOSARIO.md#4-srcobject--how-a-stream-is-seenheard-on-the-page)), `dataset.id = id`, tries `play()`. Returns the element. |
| `createAudioElement(src, id)` | Same with `<audio autoplay>`. |
| `createTextElement(id)` | Creates an `<h3>` with `textContent = id` and `id = id`. *(Receives a 2nd argument it doesn't use.)* |
| `disableButton(id)` / `enableButton(id)` | `element.disabled = true / false`. |
| `appendAudio(container, el)` / `appendVideo(container, el)` | `container.appendChild(el)` and `el.controls = true`. |
| `appendText(container, el)` | Just `appendChild`. |
| `removeAudio(id)` | `querySelector('audio[data-id="id"]')` and `.remove()`. |
| `removeVideo(id)` | Same with `video[data-id="id"]`. |
| `removeText(id)` | `getElementById(id)` and `.remove()`. |
| `showAudioPeer(id, audioStream)` | Creates the `<audio>` in `audio_site` **and** an `<h3>` with the id in `audio_from`. |
| `showVideoPeer(id, videoStream)` | Creates the `<video>` in `video_site`. |
| `showUsernameModal(id)` / `hideUsernameModal(id)` | Adds/removes the `activo` class on the overlay (the CSS does the rest). |
| `getUsername()` | `localStorage.getItem('username')`. |
| `bindSaveUsername(id, callback)` | `onclick` of the modal's "Save" button. |
| `getUsernameInput(id)` | `.value` of the input. |
| `showUsername(id, username)` | Sets `textContent = "klk " + username` on the greeting `<h3>`. |

### 6.7 `Orchestrator` — [main.js](main.js)

The conductor. Holds the global state and connects signaling ↔ peers ↔ UI.

| Member | What it is |
|---|---|
| `this.connectionsList` | `Map` of `peer id → PeerConnection`. The source of truth for "who am I connected to". |
| `this.userName` | Your name. |
| `this.audio` / `this.display` / `this.ui` / `this.connections` / `this.signaling` | The single shared instances. |

| Method | What it does |
|---|---|
| `constructor()` | Creates the `Map`, the 5 instances, and calls `init()`. |
| `init()` | Handles the name (modal or `localStorage`), sets the buttons to their initial state and "binds" the 4 buttons + `beforeunload`. See the details of each button in section 5. |
| `onOffer(id, data)` | Looks up the peer. `await peer.addAudioTracks()` (ensures your audio is included in the answer). `peer.createAnswer(data)`. If it returned something (wasn't ignored), sends `answer` to the server. |
| `onAnswer(id, data)` | `peer.applyAnswer(data)`. |
| `onIce(id, data)` | `peer.addIceCandidate(data)`. |
| `onExit(data)` | `removeDeadConnection(data)`. |
| `onJoin(id)` | **Full** peer: `new PeerConnection` → `connect()` → store in the `Map` → `addAudioTracks()` → (if you're sharing your screen) `addDisplayTrack()` → `onRemoteAudio` / `onRemoteVideo` → `monitorState`. |
| `onId(id)` | **Basic** peer: `new PeerConnection` → `connect()` → store in the `Map`. Nothing else. *(Doesn't hook tracks or UI listeners; see notes in section 8.)* |
| `onUsers(data)` | Iterates over `data` (list of ids already present) and does the same as `onJoin` for each one. |
| `onError(data)` | `alert(data)`. |
| `listenForMessages()` | Registers `signaling.onMessage`. Inside there's a `handlers` object that maps each `type` to its method. If the type doesn't exist, `console.log("Tipo de solicitud invalida.")`. |
| `removeDeadConnection(id)` | `peer.close()` → `connectionsList.delete(id)` → `ui.removeAudio` / `removeText` / `removeVideo`. |
| `handleServerDown()` | Closes all peers, empties the `Map`, re-enables "Join". Called from the WebSocket's `onclose`. |
| `notifyExit()` | Used in `beforeunload`: sends `exit_notification` with `connectionsList.keys()[0]` and empties the `Map`. |
| `stopSharingDisplay()` | For each peer: finds the video sender and `connection.removeTrack(sender)`. Then enables "Share screen". |

Also, outside the class:
- `function onLoad()` — defines an alternative startup but **nobody calls it**.
- `const app = new Orchestrator()` ([main.js:378](main.js#L378)) — **this** is the real startup.

---

## 7. Full scenarios (with real names)

### Ana joins first (empty room)

1. Mic permission OK → WebSocket open → sends her name.
2. The server sends her `users_in_connection` with an **empty** list → `onUsers([])` does
   nothing.
3. Ana is alone, waiting. Her buttons: "Leave" and "Share screen" enabled.

### Beto joins afterwards

1. Beto: permission OK → WebSocket → name.
2. Server to **Beto**: `users_in_connection: ["ana-id"]` → `onUsers` creates Ana's full
   `PeerConnection`. `addAudioTracks()` triggers `negotiationneeded` → Beto
   sends an **offer** to Ana.
3. Server to **Ana**: `join_notification: "beto-id"` → `onJoin` creates Beto's full
   `PeerConnection`. `addAudioTracks()` triggers `negotiationneeded` → Ana sends an
   **offer** to Beto.
4. **Collision**: both sent an offer.
   [Perfect negotiation](GLOSARIO.md#19-perfect-negotiation--polite-and-impolite-peers)
   kicks in: the `impolite` one ignores the offer it received (`createAnswer` returns
   `null`), the `polite` one gives way and answers. **One** valid offer/answer remains.
5. ICE candidates crossing in both directions → when one works,
   `connectionState = "connected"`.
6. Each one receives the other's `track` event → an `<audio>` appears with the other's id.

### Ana shares her screen

1. `getDisplayMedia` → picker → Ana chooses a window.
2. `peer.addDisplayTrack()` for Beto → `negotiationneeded` → new offer (only video is
   added) → Beto answers.
3. Beto receives `track` with `kind === "video"` → Ana's `<video>` appears.
4. Beto also hooks `stream.onremovetrack`.

### Ana stops sharing (browser's native button)

1. `track.onended` on Ana → `stopSharingDisplay()`.
2. `removeTrack(senderVideo)` for Beto → renegotiation.
3. Beto: `stream.onremovetrack` → `ui.removeVideo("ana-id")`.

### Beto closes the tab

1. `beforeunload` → `notifyExit()` → sends `exit_notification`.
2. Server notifies Ana: `exit_notification` → `onExit` → `removeDeadConnection("beto-id")`
   → closes the connection and removes Beto's `<audio>`.
3. If the message didn't arrive, that connection's `connectionState` would go to
   `disconnected` / `failed` and `monitorState` would do the same cleanup.

### The signaling server dies

1. WebSocket `onclose` → `handleServerDown()`.
2. All `PeerConnection`s are closed, the `Map` is emptied, "Join" is enabled again.
3. Audio calls that were already `connected` might keep going for a while (WebRTC is
   direct), but the app has already cleared its state, so in practice the call ends.

---

## 8. Notes and fragile spots (so they don't surprise you)

Things that work but are worth knowing:

- **No TURN server.** There's only STUN. On corporate networks or CGNAT, some connections
  never reach `connected`.
- **`polite` compares different values on each side.** One peer does
  `myName < otherId` and the other does `theirName < myId`. It's not the canonical
  pattern (which compares the same pair on both sides), so in theory both could end up
  `polite` or both `impolite`. See
  [glossary #19](GLOSARIO.md#19-perfect-negotiation--polite-and-impolite-peers).
- **`exit_notification` sends `connectionsList.keys()[0]`**, which is the id of **another**
  peer, not your own id. It only works if the server identifies who's leaving by their
  socket and not by that `data`.
- **The `id_notification` → `onId` → `onOffer` path doesn't hook `onRemoteAudio` /
  `onRemoteVideo` or `monitorState`.** If that flow is used, that peer connects but its
  `<audio>` is never created and its drop isn't detected. The `onJoin` / `onUsers` paths
  do all of it.
- **`onOffer` calls `addAudioTracks()` on every received offer.** It doesn't duplicate
  tracks (`hasAudioTrack` prevents that), but it can chain another `negotiationneeded`.
- **Misspelled IDs in the HTML** (`usarname_input`, `usarname_grettings`): they're like
  that on purpose to match the JS. Don't "fix" them on only one side.
- **`Signaling.disconect()`** — name missing the second "n". It's like that throughout
  the code.
- **`verificationSettingsVideo`** exists but nobody calls it; it's a debug utility, just
  like `Connections.getStats()`.

---

## 9. Quick glossary of internal variables

| Variable | Where | What it holds |
|---|---|---|
| `connectionsList` | `Orchestrator` | `Map` id→`PeerConnection`. Who you're connected to. |
| `audio.stream` / `display.stream` | `Audio` / `Display` | Your local [MediaStream](GLOSARIO.md#1-mediastream-vs-mediastreamtrack) (mic / screen). |
| `trackHandlers` | `Audio` / `Display` | peer id → function listening to its `track` event. So it can be unhooked. |
| `connection` | `PeerConnection` | The [RTCPeerConnection](GLOSARIO.md#7-rtcpeerconnection) to that peer. |
| `pendingIceCandidates` | `PeerConnection` | [ICE candidates](GLOSARIO.md#13-ice-candidates-that-arrive-too-early-pendingicecandidates) waiting for `remoteDescription`. |
| `polite` | `PeerConnection` | Whether you give way in an offer collision or not. |
| `makingOffer` | `PeerConnection` | Whether you're generating an offer right now. |
| `socket` | `Signaling` | The WebSocket to the signaling server. |
| `userName` | `Orchestrator` and `PeerConnection` | Your name. |

---

## 10. Where to start reading the code

1. [index.html](index.html) — look at the IDs.
2. [main.js](main.js) — `constructor` and `init()`. Understand the 4 buttons.
3. [peerconnection/peerconnection.js](peerconnection/peerconnection.js) — `connect()`,
   `createOffer()`, `createAnswer()`.
4. [connections/connection.js](connections/connection.js) — how the
   `RTCPeerConnection` is wrapped.
5. [audio/audio.js](audio/audio.js) and [display/display.js](display/display.js) — they're
   twins.
6. [signaling/signaling.js](signaling/signaling.js) — the shortest one.
7. [GLOSARIO.md](GLOSARIO.md) — whenever a term doesn't make sense.
