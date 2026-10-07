//audio.js
class Audio {

    constructor() {
        this.stream = null;
        this.trackHandlers = {};
    };

    async requestMicrophoneAccess() {
        try {

            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {

                    echoCancellation: false,
                    noiseSuppression: true,
                    autoGainControl: true,

                    //Calidad

                    sampleRate: 96000,
                    sampleSize: 24,
                    channelCount: 2,

                    //Latencia

                    latency: 0,

                }
            });

            return true;

        } catch (error) {
            console.error("Error al obtener permiso para usar el microfono:", error, error.name);
            return false;
        };
    };

    async getAudioTracks() {
        try {
            return this.stream.getTracks();
        } catch (error) {
            console.log("Ocurrio un error al momento de intentar obtener los tracks: ", error);
        };
    };

    async getAudioSenders(connection) {
        try {
            return connection.getSenders();
        } catch (error) {
            console.log("Ocurrio un error al momento de obtener los senders: ", error);
        };
    };

    hasAudioTrack(track, senders) {
        try {

            return senders.some((sender) => {
                return sender.track && sender.track.id === track.id;
            });

        } catch (error) {
            console.log("Ocurrio un error al querer filtrar la duplicidad de un track: ", error);
        };
    };

    async addAudioTrack(track, connection) {
        try {

            return connection.addTrack(track, this.stream);

        } catch (error) {
            console.log("Ocurrio un error al momento de añadir tracks: ", error);
        };
    };

    async configureAudioSender(sender) {
        try {

            if (sender) {
                const parameters = sender.getParameters();

                if (!parameters.encodings) {
                    parameters.encodings = [{}];
                };

                parameters.encodings[0].maxBitrate = 510000;

                await sender.setParameters(parameters);
            };

        } catch (error) {
            console.log("Ocurrio un error al momento de configurar el sender: ", error);
        };
    };

    async onRemoteAudioTrack(id, connection, callback) {
        try {
            const handler = (event) => {
                const kind = event.track.kind;
                const tracksInStream = event.streams[0].getTracks().length;

                if (kind === "audio" && tracksInStream === 1) {
                    callback(event.streams[0]);
                }
            };

            connection.addEventListener("track", handler);
            this.trackHandlers[id] = handler;
        } catch (error) {
            console.log("Error al recibir el track remoto:", error, error.name);
        };
    };

    async removeAudioTrackListener(id, connection) {
        try {

            const handlerToDelete = this.trackHandlers[id];

            if (handlerToDelete) {
                connection.removeEventListener("track", handlerToDelete);
                delete this.trackHandlers[id];
            };

        } catch (error) {
            console.log("Ocurrio un error al intentar eliminar el track del listener");
        };
    };

    async setMicronoMuteOrUnmuted() {
        try {
            const tracks = await this.getAudioTracks();
            const nuevoEstado = !tracks[0]?.enabled;

            for (const track of tracks) {
                track.enabled = nuevoEstado;
            };

            return nuevoEstado;
        } catch (error) {
            console.log("Ocurrio un error al intentar mutear el microfono: ", error);
        };
    };
};

export default Audio;
