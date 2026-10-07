# P1 — App de llamada de audio + pantalla compartida (WebRTC)

README completo, explicado desde cero. Si nunca tocaste este código, empieza por aquí y
léelo en orden.

Los términos técnicos (stream, offer, ICE, etc.) están enlazados al
[GLOSARIO.md](GLOSARIO.md). Haz ctrl + clic en cada enlace la primera vez que aparezca.


ACLARACION---

En el editor estás viendo el texto crudo: las tablas de Markdown siempre se ven desalineadas ahí porque cada celda tiene distinto ancho. Al renderizarlas se ven bien.

Para verlo renderizado en VS Code:

1. [Ctrl+Shift+V] → abre la vista previa en una pestaña.

2. Ctrl+K y luego V → vista previa al lado, se actualiza mientras editas.

3. El icono de lupa/pantalla dividida arriba a la derecha del editor.


---

## 1. ¿Qué hace la app?

Es una llamada grupal por el navegador:

- Cada persona entra con un nombre.
- Al entrar, comparte su **micrófono** con todos los demás.
- Opcionalmente puede **compartir su pantalla**; los demás la ven en un `<video>`.
- No hay backend propio de media: el audio y el video viajan **directo entre navegadores**
  usando [WebRTC](GLOSARIO.md#7-rtcpeerconnection).
- Solo hay un **servidor de señalización** (un WebSocket) que sirve para que los
  navegadores se encuentren y se pongan de acuerdo. Ese servidor **no está en este repo**
  (es una URL de ngrok en [signaling/signaling.js:11](signaling/signaling.js#L11)).

Topología: **malla completa** (full mesh). Con N personas, cada navegador mantiene N‑1
[RTCPeerConnection](GLOSARIO.md#7-rtcpeerconnection), una por cada otra persona. No hay
servidor central que mezcle el audio.

---

## 2. Qué necesitas para que funcione

1. Servir la carpeta por HTTP (no abrir `index.html` con doble clic). Los módulos ES y
   `getUserMedia` necesitan `http://localhost` o `https://`.
   Ejemplo: `python -m http.server` dentro de la carpeta, y abrir `http://localhost:8000`.
2. El servidor de señalización tiene que estar vivo en la URL de
   [signaling/signaling.js:11](signaling/signaling.js#L11). Si no, no pasa nada al pulsar
   "Entrar a llamada".
3. Permitir el micrófono cuando el navegador lo pida.

---

## 3. Estructura de archivos

```
index.html                    Estructura visual + IDs que el JS busca. Carga main.js como módulo.
style.css                     Estilos. Nada de lógica.
main.js                       Orquestador. Une todas las piezas y maneja los eventos de botones.
signaling/signaling.js        Clase Signaling — habla con el servidor por WebSocket.
connections/connection.js     Clase Connections — crea y opera el objeto RTCPeerConnection.
audio/audio.js                Clase Audio — micrófono: capturar, enviar, recibir.
display/display.js            Clase Display — pantalla: capturar, enviar, recibir.
peerconnection/peerconnection.js  Clase PeerConnection — TODO lo de UN peer remoto junto.
ui/ui.js                      Clase UI — crear/borrar elementos del DOM. Sin lógica de red.
GLOSARIO.md                   Explicación de cada concepto WebRTC.
```

Regla mental: **cada clase es una capa**. `main.js` (arriba) llama a `PeerConnection`, que
llama a `Connections` / `Audio` / `Display` / `Signaling` (abajo). Las capas de abajo
nunca llaman hacia arriba: reciben *callbacks*.

---

## 4. El HTML: los IDs que el código busca

Todo lo que `ui.js` y `main.js` manipulan sale de estos IDs (están en
[index.html](index.html)). Si renombras un ID aquí, hay que renombrarlo en el JS.

| ID | Qué es | Quién lo usa |
|---|---|---|
| `modal_overlay` | Capa oscura del modal de nombre | `showUsernameModal` / `hideUsernameModal` |
| `usarname_input` | Input de texto del nombre *(sí, está mal escrito)* | `getUsernameInput` |
| `btn_close` | Botón "Guardar" del modal | `bindSaveUsername` |
| `usarname_grettings` | `<h3>` que saluda con tu nombre *(mal escrito)* | `showUsername` |
| `button_to_enter_into_the_call` | Botón "Entrar a llamada" | `bindEnterCallButton` |
| `button_to_close_connection` | Botón "Salir de llamada" | `bindExitCallButton` |
| `button_to_share_display` | Botón "Compartir pantalla" | `bindShareDisplayButton` |
| `button_to_stop_share_display` | Botón "Dejar de compartir" | `bindStopShareDisplayButton` |
| `audio_from` | `<h3>` donde se listan los nombres de quienes se oyen | `showAudioPeer` / `removeText` |
| `audio_site` | Contenedor de los `<audio>` remotos | `showAudioPeer` / `removeAudio` |
| `video_site` | Contenedor de los `<video>` remotos | `showVideoPeer` / `removeVideo` |

`main.js` se carga así: `<script src="main.js" type="module" defer></script>`
([index.html:65](index.html#L65)). Al cargarse el módulo, la última línea de `main.js`
(`const app = new Orchestrator()`) arranca todo.

---

## 5. EL PIPELINE (flujo de una llamada, de principio a fin)

Esta es la parte importante. Léela entera aunque no entiendas cada paso; luego la
referencia de cada método (sección 6) la aclara.

### 5.1 Arranque de la página

1. Se carga `main.js` → se ejecuta `new Orchestrator()`
   ([main.js:378](main.js#L378)).
2. El constructor crea **una** instancia de cada clase compartida (`Audio`, `Display`,
   `UI`, `Connections`, `Signaling`) y un `Map` vacío `connectionsList` (id del peer →
   objeto `PeerConnection`). Luego llama a `init()`.
3. `init()`:
   - Si no hay nombre en `localStorage`, muestra el modal y espera a que guardes uno.
   - Si ya hay, te saluda y guarda el nombre en `this.userName`.
   - Deja **deshabilitados** los botones de salir y de pantalla.
   - "Ata" (bind) los 4 botones a sus funciones.
   - Registra `beforeunload` para avisar al servidor si cierras la pestaña.

En este punto la app está quieta, esperando que pulses **Entrar a llamada**.

### 5.2 Entrar a la llamada

Al pulsar **Entrar a llamada** ([main.js:64](main.js#L64)):

1. Habilita el botón "Compartir pantalla".
2. `audio.requestMicrophoneAccess()` → pide el micro con
   [getUserMedia](GLOSARIO.md#2-getusermedia-y-getdisplaymedia). Devuelve `true`/`false`.
   El [MediaStream](GLOSARIO.md#1-mediastream-vs-mediastreamtrack) del micro queda en
   `audio.stream`.
3. Si dio permiso:
   - `signaling.connect(...)` → abre el **WebSocket**
     ([signaling](GLOSARIO.md#8-signaling-señalización--y-por-qué-hace-falta-un-servidor-aparte)).
   - `signaling.sendMessage(null, null, username)` → manda tu nombre al servidor para
     registrarte.
   - `listenForMessages()` → engancha el "router" que reacciona a cada mensaje del
     servidor.
   - Deshabilita "Entrar", habilita "Salir".

### 5.3 El servidor te presenta a los demás

El servidor responde con mensajes que caen en el router de
`listenForMessages()` ([main.js:301](main.js#L301)). Los tipos:

| Mensaje del servidor | Handler | Qué provoca |
|---|---|---|
| `users_in_connection` | `onUsers(data)` | `data` es la lista de ids ya presentes. Creas un `PeerConnection` completo por cada uno. |
| `join_notification` | `onJoin(id)` | Alguien **nuevo** entró. Creas su `PeerConnection` completo. |
| `id_notification` | `onId(id)` | Creas un `PeerConnection` **básico** (sin tracks ni listeners todavía). |
| `offer` | `onOffer(id, data)` | Te llegó una [offer](GLOSARIO.md#9-offer--answer--sdp). Agregas tu audio y respondes con una answer. |
| `answer` | `onAnswer(id, data)` | Respuesta a tu offer. La aplicas como descripción remota. |
| `ice` | `onIce(id, data)` | Un [ICE candidate](GLOSARIO.md#11-ice-candidate-stun-servidores-ice) del otro. Lo agregas (o lo pones en cola). |
| `exit_notification` | `onExit(data)` | Alguien salió. Limpias su conexión y su UI. |
| `error` | `onError(data)` | `alert(data)`. |

### 5.4 Montar una conexión con otro peer (el corazón)

Cuando creas un `PeerConnection` "completo" (`onJoin` / `onUsers`):

1. `new PeerConnection(id, userName, signaling, connections, audio, display)` — guarda el
   id del peer remoto y las dependencias.
2. `peer.connect()`:
   - Crea el [RTCPeerConnection](GLOSARIO.md#7-rtcpeerconnection) real con la lista de
     servidores [STUN](GLOSARIO.md#11-ice-candidate-stun-servidores-ice).
   - Engancha [onicecandidate](GLOSARIO.md#12-onicecandidate): cada candidato que el
     navegador descubre se manda al otro por señalización (`sendMessage("ice", ...)`).
   - Engancha [onnegotiationneeded](GLOSARIO.md#18-negotiationneeded-renegociación): cuando
     haga falta (re)negociar, crea una offer y la manda.
3. `peer.addAudioTracks()`:
   - Coge los [tracks](GLOSARIO.md#1-mediastream-vs-mediastreamtrack) del micro.
   - Por cada uno que no esté ya puesto: `connection.addTrack(track, stream)`
     ([addTrack](GLOSARIO.md#14-addtrack--removetrack)) → devuelve un
     [sender](GLOSARIO.md#15-rtcrtpsender--rtcrtpreceiver-sender--receiver).
   - `configureAudioSender(sender)` le pone bitrate máximo.
   - **Ese `addTrack` dispara `negotiationneeded`** → se crea la offer automáticamente y se
     manda por el WebSocket.
4. Si tú ya estabas compartiendo pantalla (`display.stream` existe), también
   `peer.addDisplayTrack()`.
5. `peer.onRemoteAudio(cb)` / `peer.onRemoteVideo(cb, cbFin)`:
   - Enganchan el evento [track](GLOSARIO.md#17-ontrack-evento-track-y-eventstreams). Cuando
     el media del otro empieza a llegar, el callback recibe el `stream` y `ui` crea el
     `<audio>` o `<video>`.
6. `peer.monitorState(cb)`:
   - Engancha [onconnectionstatechange](GLOSARIO.md#22-connectionstate--onconnectionstatechange).
     Si la conexión pasa a `failed` / `disconnected` / `closed`, se llama a
     `removeDeadConnection(id)`.

### 5.5 El ida y vuelta offer/answer/ICE

Entre los dos navegadores, por el WebSocket, pasa esto (puede solaparse en el tiempo):

```
NAV A                                   SERVIDOR                 NAV B
  |-- addTrack dispara negotiationneeded ----------------------------> |
  |-- sendMessage("offer", SDP) ---------> relay ----> onOffer(A, SDP) |
  |                                                    addAudioTracks()|
  |                                                    createAnswer()  |
  | onAnswer(B, SDP) <---- relay <-------- sendMessage("answer", SDP) --|
  |                                                                    |
  |-- onicecandidate x N: sendMessage("ice", c) --> relay --> onIce ---> |
  | <---- relay <---- onicecandidate x N: sendMessage("ice", c) --------|
  |                                                                    |
  |   (cuando un par de candidatos funciona)                           |
  |   connectionState = "connected"  →  el audio ya fluye directo      |
```

- La offer sale de `createOffer()` →
  [setLocalDescription](GLOSARIO.md#10-setlocaldescription--setremotedescription).
- `onOffer` en B:
  [setRemoteDescription](GLOSARIO.md#10-setlocaldescription--setremotedescription)(offer)
  → `createAnswer()` → `setLocalDescription`(answer) → manda la answer.
- `onAnswer` en A: `setRemoteDescription`(answer). Negociación cerrada
  ([signalingState](GLOSARIO.md#21-signalingstate) vuelve a `stable`).
- Los ICE candidates que lleguen **antes** de tener `remoteDescription` se guardan en
  `pendingIceCandidates` y se aplican después
  ([cola de candidatos](GLOSARIO.md#13-candidatos-ice-que-llegan-antes-de-tiempo-pendingicecandidates)).

### 5.6 Compartir pantalla (renegociación)

Al pulsar **Compartir pantalla** ([main.js:93](main.js#L93)):

1. `display.requestVideoAccess()` →
   [getDisplayMedia](GLOSARIO.md#2-getusermedia-y-getdisplaymedia). Sale el selector nativo.
2. Por **cada** peer ya conectado: `peer.addDisplayTrack()` → `addTrack` del video →
   **cada uno dispara `negotiationneeded`** → una offer nueva por peer →
   [renegociación](GLOSARIO.md#18-negotiationneeded-renegociación).
3. `display.onDisplayEnded(track, cb)` engancha
   [track.onended](GLOSARIO.md#6-trackonended-vs-streamonremovetrack): si paras la
   compartición desde el botón nativo del navegador, se llama a `stopSharingDisplay()`.

Del lado que recibe: el evento `track` con `kind === "video"` crea el `<video>`, y además
se engancha
[stream.onremovetrack](GLOSARIO.md#6-trackonended-vs-streamonremovetrack) para saber
cuándo el otro deja de compartir.

### 5.7 Dejar de compartir

Al pulsar **Dejar de compartir** ([main.js:126](main.js#L126)) o al cerrar desde el
navegador:

1. `stopSharingDisplay()`: por cada peer busca el
   [sender](GLOSARIO.md#15-rtcrtpsender--rtcrtpreceiver-sender--receiver) de video y hace
   `connection.removeTrack(sender)` ([removeTrack](GLOSARIO.md#14-addtrack--removetrack)).
   Eso dispara otra renegociación y, en el otro lado, `stream.onremovetrack`.
2. `track.stop()` sobre los tracks de pantalla para apagar la captura de verdad
   ([track.stop()](GLOSARIO.md#5-trackstop--apagar-la-fuente-de-verdad)).

### 5.8 Salir de la llamada

Al pulsar **Salir de llamada** ([main.js:143](main.js#L143)):

1. Deshabilita los 3 botones de acción.
2. `peer.close()` en cada peer: quita los listeners de audio/video y cierra el
   `RTCPeerConnection`.
3. Manda `exit_notification` al servidor, vacía `connectionsList`, cierra el WebSocket.
4. Habilita "Entrar", vacía los contenedores de audio y video del DOM
   (`replaceChildren()`).

### 5.9 Alguien se cae o el servidor muere

- **Un peer se cae**: su `onconnectionstatechange` → `removeDeadConnection(id)` → `close()`
  + borrar del `Map` + borrar su UI. También llega `exit_notification` → `onExit` hace lo
  mismo.
- **El servidor se cae**: el WebSocket dispara `onclose` → `handleServerDown()` → cierra
  todos los peers y limpia (no se puede avisar a nadie, el canal murió).

---

## 6. Referencia clase por clase, método por método

### 6.1 `Signaling` — [signaling/signaling.js](signaling/signaling.js)

El único puente con el servidor. Habla **JSON por WebSocket**.

| Miembro | Qué hace |
|---|---|
| `this.socket` | El objeto `WebSocket`. `null` hasta conectar. |
| `connect(handleServerDown)` | Devuelve una `Promise`. Abre el WebSocket a la URL fija. `onopen` → `resolve()`. `onerror` → `reject()`. `onclose` → llama `handleServerDown()` (el servidor murió). |
| `disconect()` | *(sí, falta una "s")* Cierra el socket. Se usa al salir de la llamada. |
| `sendMessage(type, data, username = null, to_client_id = null)` | Si el socket está `OPEN`, arma `{ type, data }`, y si le pasas `username` o `to_client_id` los añade al objeto. Manda `JSON.stringify(message)`. `to_client_id` = "este mensaje es para tal peer". |
| `onMessage(callback)` | Pone `socket.onmessage`. Parsea `{ type, data, id }` del mensaje entrante y llama `callback(type, data, id)`. `id` = quién lo originó. Si el JSON es inválido, lo ignora. |

Formato de mensaje **que sale**: `{ type, data, username?, to_client_id? }`.
Formato **que entra**: `{ type, data, id }`.

### 6.2 `Connections` — [connections/connection.js](connections/connection.js)

Envoltorio fino sobre el [RTCPeerConnection](GLOSARIO.md#7-rtcpeerconnection). No guarda
estado; recibe la `connection` como parámetro en casi todos los métodos.

| Método | Qué hace |
|---|---|
| `createConnection()` | `new RTCPeerConnection({ iceServers: [...] })` con 9 servidores [STUN](GLOSARIO.md#11-ice-candidate-stun-servidores-ice) públicos. Devuelve el objeto. **No hay TURN** → si ambos peers están tras NAT muy cerrado, la conexión puede fallar. |
| `monitorState(id, connection, onDeadConnection)` | Pone `connection.onconnectionstatechange`. Lee `connection.connectionState`; si es `failed`, `disconnected` o `closed`, llama `onDeadConnection(id)`. Ver [connectionState](GLOSARIO.md#22-connectionstate--onconnectionstatechange). |
| `createOffer(connection)` | `await connection.createOffer()`. Devuelve el SDP de [offer](GLOSARIO.md#9-offer--answer--sdp). |
| `createAnswer(connection)` | `await connection.createAnswer()`. Devuelve el SDP de answer. |
| `setLocalDescription(connection, description)` | `await connection.setLocalDescription(description)`. Ver [descripciones](GLOSARIO.md#10-setlocaldescription--setremotedescription). |
| `setRemoteDescription(connection, description)` | `await connection.setRemoteDescription(description)`. |
| `onIceCandidate(connection, callback)` | Pone `connection.onicecandidate`. Solo llama `callback(event.candidate)` si `event.candidate` no es `null` (null = "ya terminé de buscar"). Ver [onicecandidate](GLOSARIO.md#12-onicecandidate). |
| `onNegotiationNeeded(connection, callback)` | Pone `connection.onnegotiationneeded`; llama `callback()` sin argumentos. Ver [negotiationneeded](GLOSARIO.md#18-negotiationneeded-renegociación). |
| `getStats(connection)` | Solo debug. `await connection.getStats()`, recorre e imprime cada entrada. Ver [getStats()](GLOSARIO.md#23-getstats--mirar-por-dentro-debugging). |

### 6.3 `Audio` — [audio/audio.js](audio/audio.js)

Todo lo del micrófono. Una sola instancia para toda la app (un micro, muchos peers).

| Miembro | Qué hace |
|---|---|
| `this.stream` | El [MediaStream](GLOSARIO.md#1-mediastream-vs-mediastreamtrack) del micro. `null` hasta pedir permiso. |
| `this.trackHandlers` | Objeto `{ idPeer: handler }`. Guarda la función que escucha el evento `track` de cada peer, para poder quitarla luego. |
| `requestMicrophoneAccess()` | [getUserMedia](GLOSARIO.md#2-getusermedia-y-getdisplaymedia) con constraints de audio (echo cancel off, noise suppression on, 96 kHz, 24 bits, estéreo, latencia 0). Guarda en `this.stream`. Devuelve `true` si hubo permiso, `false` si no. |
| `getAudioTracks()` | `this.stream.getTracks()` — devuelve **todos** los tracks del stream (aquí solo hay audio). |
| `getAudioSenders(connection)` | `connection.getSenders()` — los [senders](GLOSARIO.md#15-rtcrtpsender--rtcrtpreceiver-sender--receiver) actuales de esa conexión. |
| `hasAudioTrack(track, senders)` | `true` si algún sender ya está enviando ese track (compara por `track.id`). Sirve para no añadir el mismo track dos veces. |
| `addAudioTrack(track, connection)` | `connection.addTrack(track, this.stream)`. Devuelve el sender. Dispara [negotiationneeded](GLOSARIO.md#18-negotiationneeded-renegociación). |
| `configureAudioSender(sender)` | Lee `sender.getParameters()`, garantiza `encodings[0]`, pone `maxBitrate = 510000`, aplica con `setParameters()`. Ver [setParameters](GLOSARIO.md#16-sendergetparameters--setparameters--calidad-de-envío). |
| `onRemoteAudioTrack(id, connection, callback)` | Crea un handler para el evento [track](GLOSARIO.md#17-ontrack-evento-track-y-eventstreams); si `event.track.kind === "audio"`, llama `callback(event.streams[0])`. Lo engancha con `addEventListener("track", handler)` y lo guarda en `trackHandlers[id]`. |
| `removeAudioTrackListener(id, connection)` | Coge el handler guardado, hace `removeEventListener("track", handler)` y lo borra de `trackHandlers`. |

### 6.4 `Display` — [display/display.js](display/display.js)

Igual que `Audio` pero para la pantalla. Mismos patrones, con un extra: detectar el fin de
la compartición por los **dos** lados.

| Miembro | Qué hace |
|---|---|
| `this.stream` / `this.trackHandlers` | Igual que en `Audio`, pero para video. |
| `requestVideoAccess()` | [getDisplayMedia](GLOSARIO.md#2-getusermedia-y-getdisplaymedia) pidiendo 1920×1080 @ 60fps *ideal*. Guarda en `this.stream`. Devuelve `true`/`false`. |
| `verificationSettingsVideo(track)` | `track.getSettings()` → imprime y devuelve lo que el navegador **realmente** dio (puede ser menos que lo pedido). Ver [getSettings](GLOSARIO.md#3-trackgetsettings--lo-que-el-navegador-te-dio-de-verdad). *(No lo llama nadie ahora mismo; es utilidad de debug.)* |
| `getVideoTracks()` | `this.stream.getVideoTracks()`. |
| `getVideoSenders(connection)` | `connection.getSenders()`. |
| `hasVideoTrack(track, senders)` | Igual que `hasAudioTrack`. |
| `addVideoTrack(track, connection)` | `connection.addTrack(track, this.stream)`. Devuelve el sender. |
| `configureVideoSender(sender)` | `maxBitrate = 8_000_000` y `degradationPreference = "maintain-framerate"` (si va mal la red, prefiere perder nitidez antes que fluidez). |
| `onDisplayEnded(track, onEndDisplayShare)` | Pone `track.onended`. Se dispara **en quien comparte** cuando para desde el botón nativo del navegador. Ver [onended](GLOSARIO.md#6-trackonended-vs-streamonremovetrack). |
| `onRemoteVideoTrack(id, connection, callback, onEndDisplayShare)` | Handler del evento `track` con `kind === "video"`: llama `callback(event.streams[0])` para pintar el `<video>`, y además pone `stream.onremovetrack = () => onEndDisplayShare()` para detectar cuándo el otro deja de compartir. Guarda el handler en `trackHandlers[id]`. |
| `removeVideoTrackListener(id, connection)` | Igual que en `Audio`. |

### 6.5 `PeerConnection` — [peerconnection/peerconnection.js](peerconnection/peerconnection.js)

**La clase clave.** Una instancia = toda la relación con **un** peer remoto. `main.js`
guarda estas instancias en el `Map` `connectionsList`.

| Miembro | Qué es |
|---|---|
| `this.id` | El id del peer **remoto** (el que da el servidor). |
| `this.connection` | El [RTCPeerConnection](GLOSARIO.md#7-rtcpeerconnection) real. `null` hasta `connect()`. |
| `this.pendingIceCandidates` | Cola de [ICE candidates](GLOSARIO.md#13-candidatos-ice-que-llegan-antes-de-tiempo-pendingicecandidates) que llegaron antes de tener `remoteDescription`. |
| `this.userName` | **Tu** nombre (no el del peer). |
| `this.polite` | `this.userName < this.id` (comparación de strings). Define quién cede en una colisión de offers. Ver [polite/impolite](GLOSARIO.md#19-perfect-negotiation--peer-polite-e-impolite). |
| `this.makingOffer` | `true` mientras estás creando tu offer. Sirve para detectar colisión. Ver [makingOffer](GLOSARIO.md#20-makingoffer-y-la-detección-de-colisión). |
| `this.signaling` / `this.connections` / `this.audio` / `this.display` | Dependencias **compartidas**, se reciben en el constructor, no se crean aquí. |

| Método | Qué hace |
|---|---|
| `constructor(id, userName, signaling, connections, audio, display)` | Solo guarda todo lo de arriba. No toca la red. |
| `connect()` | Crea `this.connection` con `connections.createConnection()`. Engancha `onIceCandidate` → `sendMessage("ice", candidate.toJSON())`. Engancha `onNegotiationNeeded` → `createOffer()` + `sendMessage("offer", offer)`. **Aquí es donde las offers se generan solas.** |
| `addAudioTracks()` | Por cada track del micro que no esté ya en la conexión: `addAudioTrack` + `configureAudioSender`. |
| `addDisplayTrack()` | Lo mismo con los tracks de pantalla. |
| `onRemoteAudio(callback)` | Delega en `audio.onRemoteAudioTrack(this.id, this.connection, callback)`. |
| `onRemoteVideo(callback, onEndDisplayShare)` | Delega en `display.onRemoteVideoTrack(...)`. |
| `createOffer()` | `makingOffer = true` → `connections.createOffer` → `setLocalDescription` → devuelve la offer. En `finally`, `makingOffer = false`. |
| `createAnswer(offerReceived)` | Calcula `collision = makingOffer \|\| signalingState !== "stable"`. `ignoreOffer = !polite && collision`. Si `ignoreOffer` → devuelve `null` (ignoro tu offer, sigo con la mía). Si no: `setRemoteDescription(offer)` → `createAnswer` → `setLocalDescription(answer)` → devuelve la answer. Ver [perfect negotiation](GLOSARIO.md#19-perfect-negotiation--peer-polite-e-impolite). |
| `applyAnswer(data)` | `setRemoteDescription(data)`. Cierra una negociación que iniciaste tú. |
| `addIceCandidate(candidate)` | Si ya hay `remoteDescription`: primero vacía `pendingIceCandidates`, luego añade el nuevo. Si no: lo mete en `pendingIceCandidates`. |
| `sendMessage(type, data)` | Atajo: `signaling.sendMessage(type, data, null, this.id)` (siempre dirigido a este peer). |
| `monitorState(onDead)` | Delega en `connections.monitorState(this.id, this.connection, onDead)`. |
| `close()` | `audio.removeAudioTrackListener` + `display.removeVideoTrackListener` + `this.connection.close()`. |

### 6.6 `UI` — [ui/ui.js](ui/ui.js)

Solo DOM. No sabe nada de WebRTC. Recibe datos ya listos y crea/borra elementos.

| Método | Qué hace |
|---|---|
| `bindEnterCallButton` / `bindExitCallButton` / `bindShareDisplayButton` / `bindStopShareDisplayButton(id, callback)` | Buscan el botón por id y ponen `element.onclick = () => callback()`. Los 4 son idénticos. |
| `getElementById(id)` | `document.getElementById`, con `console.log` si no existe. |
| `createVideoElement(src, id)` | Crea `<video autoplay>`, `srcObject = src` (un [stream](GLOSARIO.md#4-srcobject--cómo-se-veoye-un-stream-en-la-página)), `dataset.id = id`, intenta `play()`. Devuelve el elemento. |
| `createAudioElement(src, id)` | Igual con `<audio autoplay>`. |
| `createTextElement(id)` | Crea un `<h3>` con `textContent = id` e `id = id`. *(Recibe un 2º argumento que no usa.)* |
| `disableButton(id)` / `enableButton(id)` | `element.disabled = true / false`. |
| `appendAudio(container, el)` / `appendVideo(container, el)` | `container.appendChild(el)` y `el.controls = true`. |
| `appendText(container, el)` | Solo `appendChild`. |
| `removeAudio(id)` | `querySelector('audio[data-id="id"]')` y `.remove()`. |
| `removeVideo(id)` | Igual con `video[data-id="id"]`. |
| `removeText(id)` | `getElementById(id)` y `.remove()`. |
| `showAudioPeer(id, audioStream)` | Crea el `<audio>` en `audio_site` **y** un `<h3>` con el id en `audio_from`. |
| `showVideoPeer(id, videoStream)` | Crea el `<video>` en `video_site`. |
| `showUsernameModal(id)` / `hideUsernameModal(id)` | Añade/quita la clase `activo` del overlay (el CSS hace el resto). |
| `getUsername()` | `localStorage.getItem('username')`. |
| `bindSaveUsername(id, callback)` | `onclick` del botón "Guardar" del modal. |
| `getUsernameInput(id)` | `.value` del input. |
| `showUsername(id, username)` | Pone `textContent = "klk " + username` en el `<h3>` de saludo. |

### 6.7 `Orchestrator` — [main.js](main.js)

El director de orquesta. Tiene el estado global y conecta señalización ↔ peers ↔ UI.

| Miembro | Qué es |
|---|---|
| `this.connectionsList` | `Map` de `id del peer → PeerConnection`. La fuente de verdad de "con quién estoy conectado". |
| `this.userName` | Tu nombre. |
| `this.audio` / `this.display` / `this.ui` / `this.connections` / `this.signaling` | Las instancias únicas compartidas. |

| Método | Qué hace |
|---|---|
| `constructor()` | Crea el `Map`, las 5 instancias, y llama `init()`. |
| `init()` | Gestiona el nombre (modal o `localStorage`), deja los botones en su estado inicial y "ata" los 4 botones + el `beforeunload`. Ver el detalle de cada botón en la sección 5. |
| `onOffer(id, data)` | Busca el peer. `await peer.addAudioTracks()` (asegura que tu audio va incluido en la answer). `peer.createAnswer(data)`. Si devolvió algo (no fue ignorada), manda `answer` al servidor. |
| `onAnswer(id, data)` | `peer.applyAnswer(data)`. |
| `onIce(id, data)` | `peer.addIceCandidate(data)`. |
| `onExit(data)` | `removeDeadConnection(data)`. |
| `onJoin(id)` | Peer **completo**: `new PeerConnection` → `connect()` → guardar en el `Map` → `addAudioTracks()` → (si compartes pantalla) `addDisplayTrack()` → `onRemoteAudio` / `onRemoteVideo` → `monitorState`. |
| `onId(id)` | Peer **básico**: `new PeerConnection` → `connect()` → guardar en el `Map`. Nada más. *(No engancha tracks ni listeners de UI; ver notas en la sección 8.)* |
| `onUsers(data)` | Recorre `data` (lista de ids ya presentes) y hace por cada uno lo mismo que `onJoin`. |
| `onError(data)` | `alert(data)`. |
| `listenForMessages()` | Registra `signaling.onMessage`. Dentro hay un objeto `handlers` que mapea cada `type` a su método. Si el tipo no existe, `console.log("Tipo de solicitud invalida.")`. |
| `removeDeadConnection(id)` | `peer.close()` → `connectionsList.delete(id)` → `ui.removeAudio` / `removeText` / `removeVideo`. |
| `handleServerDown()` | Cierra todos los peers, vacía el `Map`, rehabilita "Entrar". Se llama desde el `onclose` del WebSocket. |
| `notifyExit()` | Usado en `beforeunload`: manda `exit_notification` con `connectionsList.keys()[0]` y vacía el `Map`. |
| `stopSharingDisplay()` | Por cada peer: encuentra el sender de video y `connection.removeTrack(sender)`. Luego habilita "Compartir pantalla". |

Además, fuera de la clase:
- `function onLoad()` — define un arranque alternativo pero **nadie lo llama**.
- `const app = new Orchestrator()` ([main.js:378](main.js#L378)) — **este** es el arranque real.

---

## 7. Escenarios completos (con nombres reales)

### Ana entra primero (sala vacía)

1. Permiso de micro OK → WebSocket abierto → manda su nombre.
2. El servidor le manda `users_in_connection` con lista **vacía** → `onUsers([])` no hace
   nada.
3. Ana está sola, esperando. Sus botones: "Salir" y "Compartir pantalla" habilitados.

### Beto entra después

1. Beto: permiso OK → WebSocket → nombre.
2. Servidor a **Beto**: `users_in_connection: ["ana-id"]` → `onUsers` crea el
   `PeerConnection` completo de Ana. `addAudioTracks()` dispara `negotiationneeded` → Beto
   manda **offer** a Ana.
3. Servidor a **Ana**: `join_notification: "beto-id"` → `onJoin` crea el `PeerConnection`
   completo de Beto. `addAudioTracks()` dispara `negotiationneeded` → Ana manda **offer** a
   Beto.
4. **Colisión**: los dos mandaron offer. Entra
   [perfect negotiation](GLOSARIO.md#19-perfect-negotiation--peer-polite-e-impolite): el
   `impolite` ignora la offer que le llegó (`createAnswer` devuelve `null`), el `polite`
   cede y responde. Queda **una** offer/answer válida.
5. ICE candidates cruzando en ambos sentidos → cuando uno funciona,
   `connectionState = "connected"`.
6. Cada uno recibe el evento `track` del otro → aparece un `<audio>` con el id del otro.

### Ana comparte pantalla

1. `getDisplayMedia` → selector → Ana elige una ventana.
2. `peer.addDisplayTrack()` para Beto → `negotiationneeded` → offer nueva (solo video se
   añade) → Beto responde.
3. Beto recibe `track` con `kind === "video"` → aparece el `<video>` de Ana.
4. Beto además engancha `stream.onremovetrack`.

### Ana deja de compartir (botón nativo del navegador)

1. `track.onended` en Ana → `stopSharingDisplay()`.
2. `removeTrack(senderVideo)` para Beto → renegociación.
3. Beto: `stream.onremovetrack` → `ui.removeVideo("ana-id")`.

### Beto cierra la pestaña

1. `beforeunload` → `notifyExit()` → manda `exit_notification`.
2. Servidor avisa a Ana: `exit_notification` → `onExit` → `removeDeadConnection("beto-id")`
   → cierra la conexión y borra el `<audio>` de Beto.
3. Si el mensaje no llegara, el `connectionState` de esa conexión pasaría a
   `disconnected` / `failed` y `monitorState` haría la misma limpieza.

### El servidor de señalización muere

1. WebSocket `onclose` → `handleServerDown()`.
2. Todas las `PeerConnection` se cierran, el `Map` se vacía, vuelve a estar habilitado
   "Entrar".
3. Las llamadas de audio que ya estaban `connected` podrían seguir un rato (WebRTC es
   directo), pero la app ya limpió su estado, así que en la práctica la llamada termina.

---

## 8. Notas y puntos frágiles (para que no te sorprendan)

Cosas que funcionan pero conviene conocer:

- **Sin servidor TURN.** Solo hay STUN. En redes corporativas o CGNAT, algunas conexiones
  nunca llegan a `connected`.
- **`polite` compara valores distintos en cada lado.** Un peer hace
  `miNombre < idDelOtro` y el otro hace `suNombre < idMío`. No es el patrón canónico
  (que compara el mismo par en ambos lados), así que en teoría los dos podrían salir
  `polite` o los dos `impolite`. Ver
  [glosario #19](GLOSARIO.md#19-perfect-negotiation--peer-polite-e-impolite).
- **`exit_notification` manda `connectionsList.keys()[0]`**, que es el id de **otro** peer,
  no un id tuyo. Funciona solo si el servidor identifica al que sale por su socket y
  no por ese `data`.
- **El camino `id_notification` → `onId` → `onOffer` no engancha `onRemoteAudio` /
  `onRemoteVideo` ni `monitorState`.** Si ese flujo se usa, ese peer se conecta pero su
  `<audio>` nunca se crea y su caída no se detecta. Los caminos `onJoin` / `onUsers` sí lo
  hacen todo.
- **`onOffer` hace `addAudioTracks()` en cada offer recibida.** No duplica tracks (lo evita
  `hasAudioTrack`), pero sí puede encadenar otra `negotiationneeded`.
- **IDs mal escritos en el HTML** (`usarname_input`, `usarname_grettings`): están así a
  propósito para que coincidan con el JS. No los "arregles" solo en un lado.
- **`Signaling.disconect()`** — nombre sin la segunda "s". Está así en todo el código.
- **`verificationSettingsVideo`** existe pero nadie la llama; es utilidad de debug, igual
  que `Connections.getStats()`.

---

## 9. Glosario rápido de variables internas

| Variable | Dónde | Qué guarda |
|---|---|---|
| `connectionsList` | `Orchestrator` | `Map` id→`PeerConnection`. Con quién estás conectado. |
| `audio.stream` / `display.stream` | `Audio` / `Display` | Tu [MediaStream](GLOSARIO.md#1-mediastream-vs-mediastreamtrack) local (micro / pantalla). |
| `trackHandlers` | `Audio` / `Display` | id del peer → función que escucha su evento `track`. Para poder desengancharla. |
| `connection` | `PeerConnection` | El [RTCPeerConnection](GLOSARIO.md#7-rtcpeerconnection) hacia ese peer. |
| `pendingIceCandidates` | `PeerConnection` | [ICE candidates](GLOSARIO.md#13-candidatos-ice-que-llegan-antes-de-tiempo-pendingicecandidates) en espera de `remoteDescription`. |
| `polite` | `PeerConnection` | Si cedes o no ante una colisión de offers. |
| `makingOffer` | `PeerConnection` | Si ahora mismo estás generando una offer. |
| `socket` | `Signaling` | El WebSocket con el servidor de señalización. |
| `userName` | `Orchestrator` y `PeerConnection` | Tu nombre. |

---

## 10. Por dónde empezar a leer el código

1. [index.html](index.html) — mira los IDs.
2. [main.js](main.js) — `constructor` e `init()`. Entiende los 4 botones.
3. [peerconnection/peerconnection.js](peerconnection/peerconnection.js) — `connect()`,
   `createOffer()`, `createAnswer()`.
4. [connections/connection.js](connections/connection.js) — cómo se envuelve el
   `RTCPeerConnection`.
5. [audio/audio.js](audio/audio.js) y [display/display.js](display/display.js) — son
   gemelos.
6. [signaling/signaling.js](signaling/signaling.js) — el más corto.
7. [GLOSARIO.md](GLOSARIO.md) — cada vez que un término no te cuadre.
