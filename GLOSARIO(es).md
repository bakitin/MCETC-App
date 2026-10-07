# Glosario de WebRTC y Señalización

Notas personales de aprendizaje. No es documentación del código: es una explicación de
cada concepto que uso en la app, con una analogía y un trozo de mi propio código donde
aparece.

Orden: primero lo básico (capturar audio/video), luego la conexión entre pares, luego
enviar/recibir tracks, y al final la parte "difícil" (renegociación y coordinación).

---

## PARTE 1 — Medios: capturar audio y pantalla

### 1. MediaStream vs MediaStreamTrack

**Qué es:**
- Un **MediaStreamTrack** (track) es UNA sola fuente: un micrófono, una cámara, o una
  pantalla. Es solo audio, o solo video, nunca los dos a la vez.
- Un **MediaStream** (stream) es una CAJA que agrupa varios tracks y los mantiene juntos.

**Analogía:** el stream es una bandeja; cada track es un vaso encima. Puedes llevar la
bandeja entera o coger un vaso suelto.

**En mi código:** `this.stream` es la caja que me da el navegador; de ahí saco los tracks.

```js
// audio/audio.js
this.stream = await navigator.mediaDevices.getUserMedia({ audio: { ... } });

async getAudioTracks() {
    return this.stream.getTracks(); // saca los tracks individuales de la caja
}
```

Nota: `getTracks()` los devuelve todos. `getVideoTracks()` / `getAudioTracks()` filtran
por tipo (en `display/display.js` uso `this.stream.getVideoTracks()`).

---

### 2. getUserMedia y getDisplayMedia

- **`getUserMedia`**: pide acceso a **cámara y/o micrófono**. Dispara el pop-up de permiso.
- **`getDisplayMedia`**: pide acceso a **la pantalla** (o una ventana/pestaña). Dispara el
  selector de "¿qué quieres compartir?".

Las dos son asíncronas, devuelven un MediaStream, y pueden fallar (el usuario dice "no" o
cancela) — por eso van en `try/catch` y devuelvo `true`/`false`.

**Analogía:** `getUserMedia` es encender tu propia cámara. `getDisplayMedia` es apuntar la
cámara a tu monitor.

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

Esos objetos `audio: {...}` y `video: {...}` son **constraints** (restricciones): pides
una calidad concreta, pero el navegador decide qué puede darte de verdad.

---

### 3. track.getSettings() — lo que el navegador te dio de verdad

Pides `1920x1080 @ 60fps` como *ideal*, pero quizá te da menos. `getSettings()` te dice
los valores reales del track.

**Analogía:** pediste un café grande; miras la taza para ver de qué tamaño te lo dieron.

```js
// display/display.js
async verificationSettingsVideo(track) {
    const settingsVideo = track.getSettings();
    console.log(settingsVideo);
    return settingsVideo;
}
```

---

### 4. srcObject — cómo se ve/oye un stream en la página

Un `<video>` o `<audio>` normal usa `src="archivo.mp4"`. Para un stream en vivo se usa
`.srcObject = stream`.

```js
// ui/ui.js
const videoElement = document.createElement('video');
videoElement.autoplay = true;
videoElement.srcObject = src; // 'src' aquí es un MediaStream, no una URL
```

---

### 5. track.stop() — apagar la fuente de verdad

`stop()` en un track apaga el micro / cámara / pantalla a nivel de sistema (se apaga la
lucecita). Es irreversible: para volver, hay que pedir el medio otra vez.

Ojo: quitar un track de la conexión (`removeTrack`) **no** apaga la fuente. Son cosas
distintas: uno deja de enviarlo, el otro lo apaga.

```js
// main.js — al pulsar "dejar de compartir pantalla"
const tracks = await this.display.getVideoTracks();
for (const track of tracks) {
    track.stop();
}
```

---

### 6. track.onended vs stream.onremovetrack

Los dos avisan de que "el video de pantalla se acabó", pero en puntas distintas:

- **`track.onended`** → se dispara del lado de **quien comparte**, cuando la fuente termina
  sola. Caso típico: el usuario pulsa el botón nativo del navegador "Dejar de compartir".
  No lo provocaste desde tu código.
- **`stream.onremovetrack`** → se dispara del lado de **quien recibe**, cuando un track que
  estaba en ese stream remoto se quita (porque el otro hizo `removeTrack`).

**Analogía:** `onended` = al que transmite se le acabó la cinta. `onremovetrack` = al que
está mirando se le cortó ese canal.

En mi app conviven, uno en cada lado:

```js
// display/display.js — lado que COMPARTE
track.onended = (event) => {
    onEndDisplayShare();
}
```

```js
// display/display.js — lado que RECIBE (dentro del handler del evento "track")
const stream = event.streams[0];
stream.onremovetrack = (removeEvent) => {
    onEndDisplayShare();
};
```

Y quien dispara ese `onremovetrack` remoto es este `removeTrack` del otro peer:

```js
// main.js
if (videoSender) peer.connection.removeTrack(videoSender);
```

---

## PARTE 2 — La conexión entre pares

### 7. RTCPeerConnection

Es EL objeto central de WebRTC. Representa la conexión directa de audio/video entre mi
navegador y el de otra persona (*peer* = par, igual). Todo pasa por aquí: agregar tracks,
crear offers, recibir el media del otro, saber si sigue viva.

**Analogía:** es la línea telefónica privada entre dos personas. La operadora (el servidor
de señalización) solo ayuda a montar la llamada; una vez conectados, hablan directo.

```js
// connections/connection.js
const connection = new RTCPeerConnection({
    iceServers: [{ urls: [ "stun:stun.l.google.com:19302", ... ] }]
});
```

En mi app, cada persona remota tiene su propia `RTCPeerConnection`, guardada dentro de mi
clase `PeerConnection`:

```js
// peerconnection/peerconnection.js
this.connection = await this.connections.createConnection();
```

---

### 8. Signaling (señalización) — y por qué hace falta un servidor aparte

Dos navegadores que nunca se han hablado no tienen forma de encontrarse. Antes necesitan
intercambiar unos "papeles": qué códecs soportan, qué IPs y puertos tienen, etc. WebRTC
**genera** esos papeles pero **no los transporta** por ti. Tú tienes que llevarlos de un
lado a otro por un canal que ya funcione.

Ese canal es el **servidor de señalización**. En mi caso, un WebSocket.

**Analogía:** quieres quedar con alguien para hablar en persona. Primero os mandáis
mensajes por WhatsApp ("estoy en tal sitio, a tal hora") — eso es la señalización. Luego
os veis y ya habláis sin WhatsApp — esa es la conexión WebRTC directa.

Qué viaja por mi señalización: `offer`, `answer`, `ice`, y avisos (`join_notification`,
`exit_notification`, `users_in_connection`...).

```js
// signaling/signaling.js
this.socket = new WebSocket("wss://unshackle-think-return.ngrok-free.dev");

async sendMessage(type, data, username = null, to_client_id = null) {
    const message = { type, data };
    if (to_client_id !== null) message.to_client_id = to_client_id;
    this.socket.send(JSON.stringify(message));
}
```

El "router" que decide qué hacer con cada mensaje que llega:

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

Para ponerse de acuerdo, un lado manda una **offer** (oferta) y el otro contesta con una
**answer** (respuesta). Ambas son objetos **SDP** (*Session Description Protocol*): un
texto largo que describe "esto es lo que voy a enviar y cómo" — códecs, resolución,
cifrado, etc.

- **Offer**: "propongo hablar así".
- **Answer**: "de acuerdo; y yo por mi parte, así".

**Analogía:** acordar el idioma antes de una reunión. Uno: "¿en español y por
videollamada?". El otro: "vale, español, y yo además comparto pantalla".

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

Cada peer guarda DOS descripciones SDP:
- **local description**: la mía (mi offer o mi answer). Se fija con `setLocalDescription`.
- **remote description**: la del otro. Se fija con `setRemoteDescription`.

Hasta que las dos están puestas, la negociación no está cerrada.

**Analogía:** un contrato con dos firmas. La local es tu firma; la remota es la del otro.
Sin las dos, no hay trato.

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

### 11. ICE candidate, STUN, servidores ICE

**El problema:** tu PC no sabe con qué IP y puerto es alcanzable desde internet (estás
detrás de un router, NAT, etc.).

- **Servidor STUN**: le preguntas "¿cómo me ves desde fuera?" y te devuelve tu IP:puerto
  público.
- **ICE candidate**: cada posible dirección por la que te pueden contactar (tu IP local,
  tu IP pública vía STUN, etc.). Se generan varias y se prueban hasta encontrar una que
  funcione entre los dos peers.
- **iceServers**: la lista de servidores STUN (y TURN, si hubiera) que le pasas a la
  `RTCPeerConnection` al crearla.

**Analogía:** quieres que un mensajero te lleve un paquete. Le das varias direcciones:
"casa", "oficina", "portería del edificio". Él prueba cuál funciona. STUN es preguntarle a
un amigo "¿cuál es mi dirección vista desde la calle?".

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

Nota: solo tengo STUN. Si dos peers están en redes muy cerradas, haría falta un servidor
**TURN** (reenvía el tráfico por él mismo). Con solo STUN, algunas conexiones pueden
fallar.

---

### 12. onicecandidate

Evento de la `RTCPeerConnection`: se dispara cada vez que el navegador **descubre un nuevo
ICE candidate tuyo**. Tú lo coges y se lo mandas al otro peer por señalización. Van
llegando poco a poco (a esto se le llama *trickle ICE*: gotean).

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

`candidate.toJSON()` lo convierte en un objeto plano para poder mandarlo como JSON por el
WebSocket.

---

### 13. Candidatos ICE que llegan antes de tiempo (pendingIceCandidates)

Problema de orden: a veces te llega un ICE candidate del otro **antes** de que hayas
puesto su `remoteDescription`. Si lo agregas en ese momento, error. Solución: guardarlos en
una cola y agregarlos cuando ya exista la `remoteDescription`.

**Analogía:** te llegan las llaves de una casa que todavía no has comprado. Las metes en un
cajón; cuando firmas la compra, las usas.

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
        this.pendingIceCandidates.push(candidate); // a la cola
    }
}
```

---

## PARTE 3 — Enviar y recibir tracks

### 14. addTrack / removeTrack

- **`addTrack(track, stream)`**: mete uno de tus tracks (micro, pantalla) en la conexión
  para que empiece a viajar al otro. Devuelve un **RTCRtpSender**.
- **`removeTrack(sender)`**: deja de enviar ese track. Se le pasa el **sender**, no el
  track.

Cambiar lo que envías (agregar o quitar) obliga a **renegociar** (ver punto 18).

**Analogía:** `addTrack` es abrir un grifo hacia el otro; `removeTrack` es cerrarlo.

```js
// audio/audio.js
async addAudioTrack(track, connection) {
    return connection.addTrack(track, this.stream); // devuelve el sender
}
```

```js
// main.js
if (videoSender) peer.connection.removeTrack(videoSender);
```

---

### 15. RTCRtpSender / RTCRtpReceiver ("sender" / "receiver")

- **Sender**: representa un track TUYO que se está enviando. Lo obtienes al hacer
  `addTrack`, o con `connection.getSenders()`. Sirve para controlar cómo se envía (bitrate,
  etc.) o para quitarlo.
- **Receiver**: la contraparte — un track que estás RECIBIENDO. En mi código no lo toco
  directamente; me llega ya envuelto en el evento `track`.

**Analogía:** el sender es tu antena emisora; el receiver, la del otro apuntando hacia ti.

```js
// audio/audio.js
async getAudioSenders(connection) {
    return connection.getSenders();
}

hasAudioTrack(track, senders) {
    return senders.some((sender) => sender.track && sender.track.id === track.id);
}
```

Ese `hasAudioTrack` recorre los senders para no meter dos veces el mismo track.

---

### 16. sender.getParameters() / setParameters() — calidad de envío

El sender permite ajustar cómo sale el track: bitrate máximo, y si la red va mal si
prefiere bajar resolución o bajar fps. Se lee con `getParameters()`, se modifica el objeto,
y se vuelve a aplicar con `setParameters()`.

```js
// display/display.js
const parameters = sender.getParameters();
if (!parameters.encodings) parameters.encodings = [{}];
parameters.encodings[0].maxBitrate = 8_000_000;
parameters.encodings[0].degradationPreference = "maintain-framerate";
await sender.setParameters(parameters);
```

En `audio/audio.js` hago lo mismo con `maxBitrate = 510000` para el micro.

---

### 17. ontrack (evento "track") y event.streams

Se dispara en tu `RTCPeerConnection` cuando **empieza a llegar un track del otro peer**. El
evento trae:
- `event.track`: el track en sí. Tiene `.kind`: `"audio"` o `"video"`.
- `event.streams[0]`: el stream al que pertenece — lo que enchufas al `<audio>` / `<video>`.

**Analogía:** suena el timbre (`track`) y abres para recibir el paquete (`streams[0]`).

```js
// audio/audio.js
const handler = (event) => {
    const kind = event.track.kind;
    if (kind === "audio") {
        callback(event.streams[0]); // este stream va al <audio>
    }
};
connection.addEventListener("track", handler);
this.trackHandlers[id] = handler;
```

Filtro por `kind` porque audio y video llegan por el mismo evento, y cada módulo
(Audio / Display) solo quiere el suyo.

Uso `addEventListener("track", handler)` en vez de `connection.ontrack = ...` porque
guardo el handler en `this.trackHandlers[id]` para poder **quitarlo** después, por peer:

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

## PARTE 4 — Renegociación y coordinación (lo difícil)

### 18. negotiationneeded (renegociación)

La primera negociación offer/answer no es la única. Cada vez que **cambias lo que envías**
— agregas pantalla, la quitas — WebRTC dispara el evento `negotiationneeded` para avisar:
"hay que volver a ponerse de acuerdo". Tú reaccionas creando una offer nueva.

**Analogía:** ya estabas en la reunión, pero ahora quieres proyectar diapositivas. Tienes
que avisar: "esperad, voy a compartir algo más".

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

Por eso en mi app, al entrar a la llamada solo agrego audio; y cuando pulso "compartir
pantalla", el `addDisplayTrack()` provoca `negotiationneeded` → offer nueva automática.

---

### 19. Perfect negotiation / peer "polite" e "impolite"

**El problema (colisión de offers):** si los dos peers mandan una offer casi a la vez, la
negociación se rompe — los dos quedan esperando una answer que nadie manda.

**La solución ("perfect negotiation"):** decidir de antemano quién cede. Uno es **polite**
(educado) y el otro **impolite** (maleducado):
- El **polite** cede: si le llega una offer mientras él también estaba ofertando, tira la
  suya y acepta la del otro.
- El **impolite** no cede: ignora la offer que le llegó y sigue con la suya.

La regla tiene que ser la misma en las dos puntas y dar resultados opuestos. En mi código
comparo el nombre de usuario contra el id del peer:

```js
// peerconnection/peerconnection.js
this.polite = this.userName < this.id;
```

**Analogía:** dos personas llegan a la vez a una puerta. Regla acordada: "quien tenga el
nombre más corto alfabéticamente, pasa; el otro espera". Sin regla, los dos se quedan
diciendo "tú primero".

---

### 20. makingOffer y la detección de colisión

Para aplicar la regla de arriba, cuando te llega una offer necesitas saber si TÚ estabas
también en mitad de ofertar. Dos señales:
- **`this.makingOffer`**: bandera que pones a `true` mientras creas y fijas tu offer (y a
  `false` en el `finally`).
- **`signalingState !== "stable"`**: la conexión no está en reposo, hay una negociación a
  medias.

Si hay colisión y eres **impolite**, ignoras la offer entrante.

```js
// peerconnection/peerconnection.js
async createOffer() {
    this.makingOffer = true;
    // ... crear y fijar la offer ...
    finally { this.makingOffer = false; }
}

async createAnswer(offerReceived) {
    const collision  = this.makingOffer || this.connection.signalingState !== "stable";
    const ignoreOffer = !this.polite && collision;
    if (ignoreOffer) return null;
    // ... procesar la offer normalmente ...
}
```

Cuando `createAnswer` devuelve `null`, en `main.js` el `if (answer)` evita mandar
respuesta:

```js
// main.js
const answer = await peer.createAnswer(data);
if (answer) {
    await this.signaling.sendMessage("answer", answer, null, id);
}
```

---

### 21. signalingState

Estado de la **negociación** (no de la conexión de media). Los valores que me importan:
- `"stable"`: no hay negociación pendiente, todo acordado. Punto de reposo.
- otros (`"have-local-offer"`, `"have-remote-offer"`...): hay una offer puesta esperando su
  answer.

Lo uso solo para detectar colisión: si no está `"stable"`, hay algo a medias.

```js
// peerconnection/peerconnection.js
const collision = this.makingOffer || this.connection.signalingState !== "stable";
```

---

### 22. connectionState / onconnectionstatechange

Estado de la **conexión de media real**: ¿está fluyendo el audio/video? Valores: `"new"`,
`"connecting"`, `"connected"`, `"disconnected"`, `"failed"`, `"closed"`.

`onconnectionstatechange` se dispara cada vez que cambia. Lo uso para detectar que un peer
se cayó y limpiarlo (cerrar su conexión, quitar su `<audio>`/`<video>` del DOM).

**Analogía:** `signalingState` = "¿ya acordamos cómo hablar?". `connectionState` = "¿de
verdad nos estamos escuchando ahora mismo?".

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

### 23. getStats() — mirar por dentro (debugging)

Devuelve un informe con métricas en vivo de la conexión: bitrate real, paquetes perdidos,
resolución, latencia (RTT), qué par de ICE candidates ganó, etc. Solo para depurar.

```js
// connections/connection.js
const statsReport = await connection.getStats();
statsReport.forEach((stat) => {
    console.log(stat.type, stat);
});
```

---

## Resumen del flujo completo en mi app

1. Entro a la llamada → `getUserMedia` me da el **MediaStream** del micro.
2. El WebSocket (**signaling**) me avisa de otros peers → creo una **RTCPeerConnection**
   por cada uno.
3. `addTrack` mete mi audio → se dispara **negotiationneeded** → creo una **offer** (SDP) y
   la mando por signaling.
4. El otro pone mi offer como **remoteDescription**, crea su **answer**, me la manda, yo la
   pongo como mi remoteDescription.
5. En paralelo, ambos generan **ICE candidates** (con ayuda de **STUN**) y se los pasan por
   signaling (**onicecandidate** → mensaje `ice`).
6. Cuando un par de candidatos funciona, **connectionState** pasa a `"connected"` y el
   audio empieza a fluir.
7. El otro recibe mi audio por el evento **track** (**ontrack**) y lo enchufa a un
   `<audio>` con `srcObject`.
8. Si comparto pantalla, otro `addTrack` (de video) → otra vez **negotiationneeded** →
   renegociación.
9. Si dos offers chocan, **perfect negotiation** (polite / impolite + `makingOffer` +
   `signalingState`) decide quién cede.
10. Si un peer se cae, **onconnectionstatechange** lo detecta → cierro su conexión y limpio
    el DOM.
