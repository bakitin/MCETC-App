//connection.js
class Connections {

    constructor() {

    };

    async createConnection() {
        try {

            //Se hace esto para que se retorne el RTCPeerConnection y poder almacenarlo
            const connection = new RTCPeerConnection({

                iceServers: [{
                    urls: [
                        "stun:stun.l.google.com:19302",
                        "stun:stun1.l.google.com:19302",
                        "stun:stun2.l.google.com:19302",
                        "stun:stun3.l.google.com:19302",
                        "stun:stun4.l.google.com:19302",
                        "stun:stun.services.mozilla.com:3478",
                        "stun:stun.sipgate.net:3478",
                        "stun:stun.nextcloud.com:443",
                        "stun:global.stun.twilio.com:3478"
                    ]
                }]
            });

            return connection;

        } catch (error) {
            console.log("Error al intentar realizar conexion:", error, error.name);
        };
    };

    monitorState(id, connection, onDeadConnection) {
        try {

            connection.onconnectionstatechange = () => {
                const state = connection.connectionState;

                console.log("connectionState:", id, state);

                if (state === "failed" || state === "disconnected" || state === "closed") {
                    onDeadConnection(id);
                };
            };

        } catch (error) {
            console.log("Ocurrio un error al momento de monitorear la conexion: ", error);
        };
    };

    async createOffer(connection) {
        try {
            return await connection.createOffer();
        } catch (error) {
            console.log("Error al crear la oferta:", error, error.name);
        };
    };

    async createAnswer(connection) {
        try {
            return await connection.createAnswer();
        } catch (error) {
            console.log("Error al realizar la respuesta:", error, error.name);
        };
    };

    async setLocalDescription(connection, description) {
        try {
            await connection.setLocalDescription(description);
        } catch (error) {
            console.log("Error al crear la descripcion propia:", error, error.name);
        };
    };

    async setRemoteDescription(connection, description) {
        try {
            await connection.setRemoteDescription(description);
        } catch (error) {
            console.log("Error al crear la descripcion externa:", error, error.name);
        };
    };

    async onIceCandidate(connection, callback) {
        try {

            connection.onicecandidate = (event) => {
                if (event.candidate) {
                    callback(event.candidate);
                };
            };

        } catch (error) {
            console.log("Error al inicializar los ice:", error, error.name);
        };
    };

    async onNegotiationNeeded(connection, callback) {
        try {
            connection.onnegotiationneeded = (event) => {
                callback();
            };
        } catch (error) {
            console.log("...", error, error.name);
        };
    };

    // METODOS DE DEBUGGING

    async getStats(connection) {
        try {

            const statsReport = await connection.getStats();

            statsReport.forEach((stat) => {
                console.log(stat.type, stat);
            });

            return statsReport;
        } catch (error) {
            console.log("Error al obtener stats de la conexión:", error);
        };
    };
};

export default Connections;
