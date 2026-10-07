# WebRTC and Signaling Glossary

Personal learning notes. This is not code documentation: it's an explanation of each
concept I use in the app, with an analogy and a snippet of my own code where it shows up.

Order: first the basics (capturing audio/video), then the peer-to-peer connection, then
sending/receiving tracks, and finally the "hard" part (renegotiation and coordination).

---

## PART 1 — Media: capturing audio and screen

### 1. MediaStream vs MediaStreamTrack

**What it is:**
- A **MediaStreamTrack** (track) is ONE single source: a microphone, a camera, or a
  screen. It's only audio or only video, never both at once.
- A **MediaStream** (stream) is a BOX that groups several tracks and keeps them together.

**Analogy:** the stream is a tray; each track is a glass on top of it. You can carry the
whole tray or pick up a single glass.

**In my code:** `this.stream` is the box the browser gives me; I pull the tracks out of it.

```js
// audio/audio.js
this.stream = await navigator.mediaDevices.getUserMedia({ audio: { ... } });

async getAudioTracks() {
    return this.stream.getTracks(); // pulls the individual tracks out of the box
}
```

Note: `getTracks()` returns all of them. `getVideoTracks()` / `getAudioTracks()` filter
by type (in `display/display.js` I use `this.stream.getVideoTracks()`).

---

### 2. getUserMedia and getDisplayMedia

- **`getUserMedia`**: requests access to the **camera and/or microphone**. Triggers the
  permission pop-up.
- **`getDisplayMedia`**: requests access to **the screen** (or a window/tab). Triggers the
  "what do you want to share?" picker.

Both are asynchronous, return a MediaStream, and can fail (the user says "no" or
cancels) — that's why they're wrapped in `try/catch` and I return `true`/`false`.

**Analogy:** `getUserMedia` is turning on your own camera. `getDisplayMedia` is pointing
the camera at your monitor.

```js
// audio/audio.js
this.stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: true, sampleRate: 96000, ... }
});
```

```js
// display/display.js
this.stream = await navigator.mediaDevices.getDisplayMedia({
    video: { width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 } }
});
```

Those `audio: {...}` and `video: {...}` objects are **constraints**: you ask for a
specific quality, but the browser decides what it can actually give you.

---

### 3. track.getSettings() — what the browser actually gave you

You ask for `1920x1080 @ 60fps` as *ideal*, but you might get less. `getSettings()` tells
you the track's real values.

**Analogy:** you ordered a large coffee; you look at the cup to see what size you got.

```js
// display/display.js
async verificationSettingsVideo(track) {
    const settingsVideo = track.getSettings();
    console.log(settingsVideo);
    return settingsVideo;
}
```

---

### 4. srcObject — how a stream is seen/heard on the page

A regular `<video>` or `<audio>` uses `src="file.mp4"`. For a live stream you use
`.srcObject = stream`.

```js
// ui/ui.js
const videoElement = document.createElement('video');
videoElement.autoplay = true;
videoElement.srcObject = src; // 'src' here is a MediaStream, not a URL
```

---

### 5. track.stop() — actually turning off the source

`stop()` on a track turns off the mic / camera / screen at the system level (the little
light goes off). It's irreversible: to get it back, you have to request the media again.

Careful: removing a track from the connection (`removeTrack`) does **not** turn off the
source. They're different things: one stops sending it, the other turns it off.

```js
// main.js — when clicking "stop sharing screen"
const tracks = await this.display.getVideoTracks();
for (const track of tracks) {
    track.stop();
}
```

---

### 6. track.onended vs stream.onremovetrack

Both signal that "the screen video is over", but on different ends:

- **`track.onended`** → fires on the side of **the one sharing**, when the source ends on
  its own. Typical case: the user clicks the browser's native "Stop sharing" button.
  You didn't trigger it from your code.
- **`stream.onremovetrack`** → fires on the side of **the one receiving**, when a track
  that was in that remote stream gets removed (because the other side called
  `removeTrack`).

**Analogy:** `onended` = the broadcaster's tape ran out. `onremovetrack` = the viewer's
channel got cut.

In my app both coexist, one on each side:

```js
// display/display.js — SHARING side
track.onended = (event) => {
    onEndDisplayShare();
}
```

```js
// display/display.js — RECEIVING side (inside the "track" event handler)
const stream = event.streams[0];
stream.onremovetrack = (removeEvent) => {
    onEndDisplayShare();
};
```

And what triggers that remote `onremovetrack` is this `removeTrack` from the other peer:

```js
// main.js
if (videoSender) peer.connection.removeTrack(videoSender);
```

---

## PART 2 — The peer-to-peer connection

### 7. RTCPeerConnection

It's THE central WebRTC object. It represents the direct audio/video connection between
my browser and another person's (*peer* = equal). Everything goes through here: adding
tracks, creating offers, receiving the other side's media, knowing if it's still alive.

**Analogy:** it's the private phone line between two people. The operator (the signaling
server) only helps set up the call; once connected, they talk directly.

```js
// connections/connection.js
const connection = new RTCPeerConnection({
    iceServers: [{ urls: [ "stun:stun.l.google.com:19302", ... ] }]
});
```

In my app, each remote person has their own `RTCPeerConnection`, stored inside my
`PeerConnection` class:

```js
// peerconnection/peerconnection.js
this.connection = await this.connections.createConnection();
```

---

### 8. Signaling — and why a separate server is needed

Two browsers that have never talked have no way of finding each other. First they need
to exchange some "paperwork": which codecs they support, which IPs and ports they have,
etc. WebRTC **generates** that paperwork but **doesn't carry it** for you. You have to
move it from one side to the other through a channel that already works.

That channel is the **signaling server**. In my case, a WebSocket.

**Analogy:** you want to meet someone to talk in person. First you text each other on
WhatsApp ("I'm at this place, at this time") — that's signaling. Then you meet and talk
without WhatsApp — that's the direct WebRTC connection.

What travels through my signaling: `offer`, `answer`, `ice`, and notifications
(`join_notification`, `exit_notification`, `users_in_connection`...).

```js
// signaling/signaling.js
this.socket = new WebSocket("wss://unshackle-think-return.ngrok-free.dev");

async sendMessage(type, data, username = null, to_client_id = null) {
    const message = { type, data };
    if (to_client_id !== null) message.to_client_id = to_client_id;
    this.socket.send(JSON.stringify(message));
}
```

The "router" that decides what to do with each incoming message:

```js
// main.js
const handlers = {
    offer:  (id, data) => this.onOffer(id, data),
    answer: (id, data) => this.onAnswer(id, data),
    ice:    (id, data) => this.onIce(id, data),
    // ...
};
if (handlers[type]) await handlers[type](id, data);
```

---

### 9. Offer / Answer / SDP

To reach an agreement, one side sends an **offer** and the other replies with an
**answer**. Both are **SDP** objects (*Session Description Protocol*): a long text that
describes "this is what I'm going to send and how" — codecs, resolution, encryption, etc.

- **Offer**: "I propose we talk like this".
- **Answer**: "agreed; and on my side, like this".

**Analogy:** agreeing on the language before a meeting. One: "in Spanish and over video
call?". The other: "ok, Spanish, and I'll also share my screen".

```js
// peerconnection/peerconnection.js
async createOffer() {
    this.makingOffer = true;
    const offer = await this.connections.createOffer(this.connection);
    await this.connections.setLocalDescription(this.connection, offer);
    return offer;
}
```

```js
// peerconnection/peerconnection.js
async createAnswer(offerReceived) {
    // ...
    await this.connections.setRemoteDescription(this.connection, offerReceived);
    const answer = await this.connections.createAnswer(this.connection);
    await this.connections.setLocalDescription(this.connection, answer);
    return answer;
}
```

---

### 10. setLocalDescription / setRemoteDescription

Each peer stores TWO SDP descriptions:
- **local description**: mine (my offer or my answer). Set with `setLocalDescription`.
- **remote description**: the other side's. Set with `setRemoteDescription`.

Until both are set, the negotiation isn't closed.

**Analogy:** a contract with two signatures. The local one is your signature; the remote
one is the other person's. Without both, there's no deal.

```js
// connections/connection.js
async setLocalDescription(connection, description) {
    await connection.setLocalDescription(description);
}
async setRemoteDescription(connection, description) {
    await connection.setRemoteDescription(description);
}
```

---

### 11. ICE candidate, STUN, ICE servers

**The problem:** your PC doesn't know which IP and port it's reachable at from the
internet (you're behind a router, NAT, etc.).

- **STUN server**: you ask it "how do you see me from outside?" and it returns your
  public IP:port.
- **ICE candidate**: each possible address you can be reached at (your local IP, your
  public IP via STUN, etc.). Several are generated and tried until one works between the
  two peers.
- **iceServers**: the list of STUN (and TURN, if any) servers you pass to the
  `RTCPeerConnection` when creating it.

**Analogy:** you want a courier to bring you a package. You give them several addresses:
"home", "office", "building front desk". They try which one works. STUN is asking a
friend "what's my address as seen from the street?".

```js
// connections/connection.js
iceServers: [{
    urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        // ...
    ]
}]
```

Note: I only have STUN. If two peers are on very locked-down networks, a **TURN** server
would be needed (it relays the traffic through itself). With STUN only, some connections
may fail.

---

### 12. onicecandidate

An `RTCPeerConnection` event: it fires every time the browser **discovers a new ICE
candidate of yours**. You take it and send it to the other peer through signaling. They
arrive little by little (this is called *trickle ICE*: they trickle in).

```js
// connections/connection.js
connection.onicecandidate = (event) => {
    if (event.candidate) {
        callback(event.candidate);
    }
};
```

```js
// peerconnection/peerconnection.js
this.connections.onIceCandidate(this.connection, (candidate) => {
    this.sendMessage("ice", candidate.toJSON());
});
```

`candidate.toJSON()` turns it into a plain object so it can be sent as JSON over the
WebSocket.

---

### 13. ICE candidates that arrive too early (pendingIceCandidates)

Ordering problem: sometimes you get an ICE candidate from the other side **before** you've
set its `remoteDescription`. If you add it at that moment, error. Solution: store them in
a queue and add them once the `remoteDescription` exists.

**Analogy:** you receive the keys to a house you haven't bought yet. You put them in a
drawer; when you sign the purchase, you use them.

```js
// peerconnection/peerconnection.js
async addIceCandidate(candidate) {
    if (this.connection.remoteDescription) {
        for (const pending of this.pendingIceCandidates) {
            await this.connection.addIceCandidate(pending);
        }
        this.pendingIceCandidates = [];
        await this.connection.addIceCandidate(candidate);
    } else {
        this.pendingIceCandidates.push(candidate); // into the queue
    }
}
```

---

## PART 3 — Sending and receiving tracks

### 14. addTrack / removeTrack

- **`addTrack(track, stream)`**: puts one of your tracks (mic, screen) into the
  connection so it starts traveling to the other side. Returns an **RTCRtpSender**.
- **`removeTrack(sender)`**: stops sending that track. You pass it the **sender**, not the
  track.

Changing what you send (adding or removing) forces a **renegotiation** (see item 18).

**Analogy:** `addTrack` is opening a tap toward the other person; `removeTrack` is
closing it.

```js
// audio/audio.js
async addAudioTrack(track, connection) {
    return connection.addTrack(track, this.stream); // returns the sender
}
```

```js
// main.js
if (videoSender) peer.connection.removeTrack(videoSender);
```

---

### 15. RTCRtpSender / RTCRtpReceiver ("sender" / "receiver")

- **Sender**: represents a track of YOURS that's being sent. You get it when calling
  `addTrack`, or with `connection.getSenders()`. It's used to control how it's sent
  (bitrate, etc.) or to remove it.
- **Receiver**: the counterpart — a track you're RECEIVING. In my code I don't touch it
  directly; it comes to me already wrapped in the `track` event.

**Analogy:** the sender is your transmitting antenna; the receiver is the other person's,
pointed at you.

```js
// audio/audio.js
async getAudioSenders(connection) {
    return connection.getSenders();
}

hasAudioTrack(track, senders) {
    return senders.some((sender) => sender.track && sender.track.id === track.id);
}
```

That `hasAudioTrack` goes through the senders so the same track isn't added twice.

---

### 16. sender.getParameters() / setParameters() — send quality

The sender lets you tune how the track goes out: max bitrate, and whether, if the network
is bad, it prefers lowering resolution or lowering fps. You read it with
`getParameters()`, modify the object, and apply it again with `setParameters()`.

```js
// display/display.js
const parameters = sender.getParameters();
if (!parameters.encodings) parameters.encodings = [{}];
parameters.encodings[0].maxBitrate = 8_000_000;
parameters.encodings[0].degradationPreference = "maintain-framerate";
await sender.setParameters(parameters);
```

In `audio/audio.js` I do the same with `maxBitrate = 510000` for the mic.

---

### 17. ontrack ("track" event) and event.streams

Fires on your `RTCPeerConnection` when **a track from the other peer starts arriving**.
The event carries:
- `event.track`: the track itself. It has `.kind`: `"audio"` or `"video"`.
- `event.streams[0]`: the stream it belongs to — what you plug into the `<audio>` /
  `<video>`.

**Analogy:** the doorbell rings (`track`) and you open the door to get the package
(`streams[0]`).

```js
// audio/audio.js
const handler = (event) => {
    const kind = event.track.kind;
    if (kind === "audio") {
        callback(event.streams[0]); // this stream goes to the <audio>
    }
};
connection.addEventListener("track", handler);
this.trackHandlers[id] = handler;
```

I filter by `kind` because audio and video arrive through the same event, and each module
(Audio / Display) only wants its own.

I use `addEventListener("track", handler)` instead of `connection.ontrack = ...` because
I store the handler in `this.trackHandlers[id]` so I can **remove** it later, per peer:

```js
// audio/audio.js
async removeAudioTrackListener(id, connection) {
    const handlerToDelete = this.trackHandlers[id];
    if (handlerToDelete) {
        connection.removeEventListener("track", handlerToDelete);
        delete this.trackHandlers[id];
    }
}
```

---

## PART 4 — Renegotiation and coordination (the hard part)

### 18. negotiationneeded (renegotiation)

The first offer/answer negotiation isn't the only one. Every time you **change what you
send** — add the screen, remove it — WebRTC fires the `negotiationneeded` event to say:
"we need to agree again". You react by creating a new offer.

**Analogy:** you were already in the meeting, but now you want to project slides. You
have to let them know: "wait, I'm going to share something else".

```js
// connections/connection.js
connection.onnegotiationneeded = (event) => {
    callback();
};
```

```js
// peerconnection/peerconnection.js
this.connections.onNegotiationNeeded(this.connection, async () => {
    const offer = await this.createOffer();
    await this.sendMessage("offer", offer);
});
```

That's why in my app, when joining the call I only add audio; and when I click "share
screen", `addDisplayTrack()` triggers `negotiationneeded` → automatic new offer.

---

### 19. Perfect negotiation / "polite" and "impolite" peers

**The problem (offer collision):** if both peers send an offer at almost the same time,
the negotiation breaks — both end up waiting for an answer nobody sends.

**The solution ("perfect negotiation"):** decide ahead of time who gives way. One is
**polite** and the other is **impolite**:
- The **polite** one gives way: if it receives an offer while it was also offering, it
  drops its own and accepts the other's.
- The **impolite** one doesn't give way: it ignores the incoming offer and keeps its own.

The rule has to be the same on both ends and give opposite results. In my code I compare
the username against the peer's id:

```js
// peerconnection/peerconnection.js
this.polite = this.userName < this.id;
```

**Analogy:** two people reach a door at the same time. Agreed rule: "whoever's name comes
first alphabetically goes through; the other waits". Without a rule, both stay there
saying "after you".

---

### 20. makingOffer and collision detection

To apply the rule above, when an offer arrives you need to know whether YOU were also in
the middle of offering. Two signals:
- **`this.makingOffer`**: a flag you set to `true` while creating and setting your offer
  (and to `false` in the `finally`).
- **`signalingState !== "stable"`**: the connection isn't at rest, there's a
  half-finished negotiation.

If there's a collision and you're **impolite**, you ignore the incoming offer.

```js
// peerconnection/peerconnection.js
async createOffer() {
    this.makingOffer = true;
    // ... create and set the offer ...
    finally { this.makingOffer = false; }
}

async createAnswer(offerReceived) {
    const collision  = this.makingOffer || this.connection.signalingState !== "stable";
    const ignoreOffer = !this.polite && collision;
    if (ignoreOffer) return null;
    // ... process the offer normally ...
}
```

When `createAnswer` returns `null`, in `main.js` the `if (answer)` avoids sending a
response:

```js
// main.js
const answer = await peer.createAnswer(data);
if (answer) {
    await this.signaling.sendMessage("answer", answer, null, id);
}
```

---

### 21. signalingState

State of the **negotiation** (not of the media connection). The values I care about:
- `"stable"`: no pending negotiation, everything agreed. Resting point.
- others (`"have-local-offer"`, `"have-remote-offer"`...): there's an offer set, waiting
  for its answer.

I only use it to detect collisions: if it's not `"stable"`, something is half-done.

```js
// peerconnection/peerconnection.js
const collision = this.makingOffer || this.connection.signalingState !== "stable";
```

---

### 22. connectionState / onconnectionstatechange

State of the **actual media connection**: is the audio/video flowing? Values: `"new"`,
`"connecting"`, `"connected"`, `"disconnected"`, `"failed"`, `"closed"`.

`onconnectionstatechange` fires every time it changes. I use it to detect that a peer
dropped and clean it up (close its connection, remove its `<audio>`/`<video>` from the
DOM).

**Analogy:** `signalingState` = "have we agreed on how to talk?". `connectionState` = "are
we actually hearing each other right now?".

```js
// connections/connection.js
connection.onconnectionstatechange = () => {
    const state = connection.connectionState;
    console.log("connectionState:", id, state);
    if (state === "failed" || state === "disconnected" || state === "closed") {
        onDeadConnection(id);
    }
};
```

```js
// peerconnection/peerconnection.js
monitorState(onDead) {
    this.connections.monitorState(this.id, this.connection, onDead);
}
```

---

### 23. getStats() — looking inside (debugging)

Returns a report with live connection metrics: real bitrate, lost packets, resolution,
latency (RTT), which ICE candidate pair won, etc. Debugging only.

```js
// connections/connection.js
const statsReport = await connection.getStats();
statsReport.forEach((stat) => {
    console.log(stat.type, stat);
});
```

---

## Summary of the full flow in my app

1. I join the call → `getUserMedia` gives me the mic's **MediaStream**.
2. The WebSocket (**signaling**) tells me about other peers → I create one
   **RTCPeerConnection** for each.
3. `addTrack` adds my audio → **negotiationneeded** fires → I create an **offer** (SDP)
   and send it through signaling.
4. The other side sets my offer as its **remoteDescription**, creates its **answer**,
   sends it to me, and I set it as my remoteDescription.
5. In parallel, both generate **ICE candidates** (with help from **STUN**) and pass them
   through signaling (**onicecandidate** → `ice` message).
6. When a candidate pair works, **connectionState** becomes `"connected"` and the audio
   starts flowing.
7. The other side receives my audio through the **track** event (**ontrack**) and plugs
   it into an `<audio>` with `srcObject`.
8. If I share my screen, another `addTrack` (video) → **negotiationneeded** again →
   renegotiation.
9. If two offers collide, **perfect negotiation** (polite / impolite + `makingOffer` +
   `signalingState`) decides who gives way.
10. If a peer drops, **onconnectionstatechange** detects it → I close its connection and
    clean up the DOM.
