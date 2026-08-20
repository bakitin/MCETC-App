//main.js
import Audio from "./audio/audio.js";
import UI from "./ui/ui.js";
import Connections from "./connections/connection.js";
import Signaling from "./signaling/signaling.js";
import PeerConnection from "./peerconnection/peerconnection.js";



function onLoad() {
    const app = new Orchestrator();
};


class Orchestrator {

    constructor() {

        //Estado propio
        this.connectionsList = new Map(); // id -> PeerConnection
        this.userName = ""

        // Dependencias compartidas por toda la app
        this.audio = new Audio();
        this.ui = new UI();
        this.connections = new Connections();
        this.signaling = new Signaling();
        

        this.init();
    }

    //Inicializador del programa
    async init() {

        //Verificacion de Username y asigna userName a variable global de la clase
        if (this.ui.getUsername() == null) {
            this.ui.showUsernameModal("modal_overlay");

            this.ui.bindSaveUsername("btn_close", () => {
                const username = this.ui.getUsernameInput("usarname_input");
                localStorage.setItem('username', username);
                this.ui.hideUsernameModal("modal_overlay");
                this.userName = username
            });

        } else {
            const username = this.ui.getUsername();
            this.ui.showUsername("usarname_grettings", username);
            this.userName = username
        };


        //Desactiva el boton de salir de llamada
        this.ui.disableButton("button_to_close_connection");


        this.ui.bindEnterCallButton("button_to_enter_into_the_call", async () => {
            try {
                

                const microphone = await this.audio.requestMicrophoneAccess();

                if (microphone == true) {
                    await this.signaling.connect(() => {
                        this.handleServerDown();
                    });
                    
                    const username = this.ui.getUsername();
                    this.signaling.sendMessage(null, null, username);

                    await this.listenForMessages();

                    this.ui.disableButton("button_to_enter_into_the_call");
                    this.ui.enableButton("button_to_close_connection");
                } else {
                    alert("Debe permitir el acceso al microfono");
                };

            } catch (error) {
                console.log("Hubo un error a la hora de ejecutar el script en init(): ", error);
            };
        });//Boton UI de empezar llamada


        this.ui.bindExitCallButton("button_to_close_connection", async () => {
            try {
                //CLOSE CONNECTIONS------------------------------------------
                for (const peer of this.connectionsList.values()) {
                    if (peer) peer.close();
                };
                //------------------------------------------------------------>

                //DELETE ID----------------------------------------------------
                const keysList = [...this.connectionsList.keys()];
                const keyToSendToServer = keysList[0];
                await this.signaling.sendMessage("exit_notification", keyToSendToServer);
                console.log("Mensaje enviado para eliminar cliente");
                this.connectionsList.clear();
                this.signaling.disconect()
                this.ui.enableButton("button_to_enter_into_the_call");
                this.ui.disableButton("button_to_close_connection");
                //------------------------------------------------------------>

                document.getElementById("audio_site").replaceChildren();
                document.getElementById("audio_from").replaceChildren();

            } catch (error) {
                console.log("Ocurrio un error al momento de intentar salir de la llamada", error);
            };
        });//Boton UI de cerrar llamada


        //En caso de cerrar el navegador enviar un mensaje de salida de llamada
        window.addEventListener("beforeunload", () => {
            this.notifyExit();
        });


    };//Init

    async onOffer(id, data) {
        if (!id) return;

        
        const peer = this.connectionsList.get(id);
        if (!peer) return;

        await peer.addLocalTracks();

        
        const answer = await peer.createAnswer(data);
        if (answer) {
            await this.signaling.sendMessage("answer", answer, null, id);
        }
        
        
    };

    async onAnswer(id, data) {
        if (!id) return;

        const peer = this.connectionsList.get(id);
        if (!peer) return;

        await peer.applyAnswer(data);
    };

    async onIce(id, data) {
        if (!id) return;

        const peer = this.connectionsList.get(id);
        if (!peer) return;

        await peer.addIceCandidate(data);
    };

    onExit(data) {
        // El servidor no manda "id" en este mensaje, el peer que salio viene en "data".
        if (!data) return;

        this.removeDeadConnection(data);
    };

    async onJoin(id) {
        if (!id) return;

        const peer = new PeerConnection(id, this.userName, this.signaling, this.connections, this.audio);
        await peer.connect();
        this.connectionsList.set(id, peer);

        await peer.addLocalTracks();

        const audioPromise = peer.waitForRemoteAudio();
        const offer = await peer.createOffer();
        await this.signaling.sendMessage("offer", offer, null, id);

        const audio = await audioPromise;
        this.ui.showPeer(id, audio);

        peer.monitorState((deadId) => this.removeDeadConnection(deadId));
    };

    async onId(id) {
        if (!id) return;

        const peer = new PeerConnection(id, this.userName, this.signaling, this.connections, this.audio);
        await peer.connect();
        this.connectionsList.set(id, peer);
    };

    async onUsers(data) {
        for (const peerId of data) {
            const peer = new PeerConnection(peerId, this.userName, this.signaling, this.connections, this.audio);
            await peer.connect();
            this.connectionsList.set(peerId, peer);

            await peer.addLocalTracks();

            const audioPromise = peer.waitForRemoteAudio();
            const offer = await peer.createOffer();
            await this.signaling.sendMessage("offer", offer, null, peerId);

            const audio = await audioPromise;
            this.ui.showPeer(peerId, audio);

            peer.monitorState((deadId) => this.removeDeadConnection(deadId));
        };
    };

    onError(data) {
        alert(data);
    };

    //Escucha los mensajes del servidor y arma/actualiza el PeerConnection de cada peer segun el caso.
    async listenForMessages() {
        try {
            await this.signaling.onMessage(async (type, data, id) => {

                const handlers = {
                    offer: (id, data) => this.onOffer(id, data),
                    answer: (id, data) => this.onAnswer(id, data),
                    ice: (id, data) => this.onIce(id, data),
                    exit_notification: (id, data) => this.onExit(data),
                    join_notification: (id, data) => this.onJoin(id),
                    id_notification: (id, data) => this.onId(id),
                    users_in_connection: (id, data) => this.onUsers(data),
                    error: (id, data) => this.onError(data)
                };

                if (handlers[type]) {
                    await handlers[type](id, data);
                } else {
                    console.log("Tipo de solicitud invalida.");
                };
            });
        } catch (error) {
            console.log("Hubo un error a la hora de ejecutarse el router de mensajes: ", error);
        };
    };

    //Cuando un peer se cae (o el servidor avisa que salio), se cierra su conexion y se limpia del mapa/DOM.
    removeDeadConnection(id) {
        const peer = this.connectionsList.get(id);
        if (peer) peer.close();
        this.connectionsList.delete(id);
        this.ui.removeAudio(id);
        this.ui.removeText(id);
    };

    //Se ejecuta cuando el WebSocket se cierra (el servidor se cayo): limpia el estado local, no se le puede avisar al server.
    handleServerDown() {
        try {
            for (const peer of this.connectionsList.values()) {
                if (peer) peer.close();
            };
            this.connectionsList.clear();

            this.ui.enableButton("button_to_enter_into_the_call");
            this.ui.disableButton("button_to_close_connection");
        } catch (error) {
            console.log("Ocurrio un error al momento de reaccionar a la caida del servidor: ", error);
        };
    };

    //Funcion que se encarga de avisarle al servidor si el cliente cerro la pestaña o el navegador
    notifyExit() {
        try {
            const keysList = [...this.connectionsList.keys()];
            const keyToSendToServer = keysList[0];
            this.signaling.sendMessage("exit_notification", keyToSendToServer);
            console.log("Mensaje enviado para eliminar cliente");
            this.connectionsList.clear();

        } catch (error) {
            console.log("Ocurrio un error al momento de enviar el mensaje de cierre del navegador por parte del cliente al servidor: ", error);
        };
    };

};//Class

const app = new Orchestrator();

// El audio nunca pasa por el servidor — solo viaja directamente entre los navegadores una vez que ICE establece la ruta.

// PIPELINE GENERAL DEL SISTEMA
// 1. La UI dispara `init()` del Orchestrator.
// 2. El usuario pulsa entrar a la llamada.
// 3. `Audio` solicita permiso al microfono y expone tracks/senders.
// 4. `Signaling` abre el WebSocket y empieza a escuchar mensajes del servidor.
// 5. Por cada peer, `PeerConnection` encapsula su propio RTCPeerConnection, tracks, offer/answer e ICE pendiente.
// 6. `listenForMessages()` es el unico lugar que decide, segun el tipo de mensaje, que metodos de PeerConnection llamar.
// 7. El servidor solo coordina el signaling; el audio viaja directo entre pares.


//SOLUCIONADO:
// Toca crear el sistema que detecte cuando una persona cierra el navegador o lo actualiza y sacarlo de la llamada.
// Toca mejorar el diseño.
// Toca limpiar el codigo, hacerlo mas legible para mi.
// Refactorizar Codigo
// Toca crear el sistema que permita tener nombres personalizables.
// Toca crear el sistema para subir-bajar el volumen a alguien.
// Toca crear el sistema para mutear el microfono.


//POR SOLUCIONAR:
// Portearlo a otras pc's para ver si funciona.
