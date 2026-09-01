//Display.js
class Display {

    constructor() {
        this.stream = null;
        this.trackHandlers = {};
    };

    async requestVideoAccess() {
        try {

            this.stream = await navigator.mediaDevices.getDisplayMedia({
                video: {

                    //Calidad
                    width: { ideal: 1920 },
                    height: { ideal: 1080 },
                    frameRate: { ideal: 60, max: 60 },




                }
            });

            return true;

        } catch (error) {
            console.error("Error al obtener permiso para iniciar Display Share:", error, error.name);
            return false;
        };
    };


    async verificationSettingsVideo(track) {
        try {

            const settingsVideo = track.getSettings();

            console.log(settingsVideo);

            return settingsVideo;

        } catch (error) {
            console.error("Error al obtener los settings de video: ", error)
        }
    }

    async getVideoTracks() {
        try {
            return this.stream.getVideoTracks();
        } catch (error) {
            console.log("Ocurrio un error al momento de intentar obtener los tracks: ", error);
        };
    };

    async getVideoSenders(connection) {
        try {
            return connection.getSenders();
        } catch (error) {
            console.log("Ocurrio un error al momento de obtener los senders: ", error);
        };
    };

    hasVideoTrack(track, senders) {
        try {

            return senders.some((sender) => {
                return sender.track && sender.track.id === track.id;
            });

        } catch (error) {
            console.log("Ocurrio un error al querer filtrar la duplicidad de un track: ", error);
        };
    };

    async addVideoTrack(track, connection) {
        try {

            return connection.addTrack(track, this.stream);

        } catch (error) {
            console.log("Ocurrio un error al momento de añadir tracks: ", error);
        };
    };

    async configureVideoSender(sender) {
        try {

            if (sender) {
                const parameters = sender.getParameters();

                if (!parameters.encodings) {
                    parameters.encodings = [{}];
                };

                parameters.encodings[0].maxBitrate = 8_000_000;
                parameters.encodings[0].degradationPreference = "maintain-framerate"

                await sender.setParameters(parameters);
            };

        } catch (error) {
            console.log("Ocurrio un error al momento de configurar el sender: ", error);
        };
    };

    async onDisplayEnded(track, onEndDisplayShare) {
        try {

            track.onended = (event) => {
                console.log(event)
                onEndDisplayShare()
            }

        } catch (error) {
            console.error("Ocurrio un error al intentar cerrar el Display Share")
        }
    }

    async onRemoteVideoTrack(id, connection, callback, onEndDisplayShare) {
        try {

            const handler = (event) => {

                const kind = event.track.kind;

                if (kind === "video") {
                    callback(event.streams[0]);


                    const stream = event.streams[0];
                    stream.onremovetrack = (removeEvent) => {
                        console.log(removeEvent);
                        onEndDisplayShare();
                    };
                }
            };

            connection.addEventListener("track", handler);
            this.trackHandlers[id] = handler;

        } catch (error) {
            console.log("Error al recibir el track remoto:", error, error.name);
        };
    };

    async removeVideoTrackListener(id, connection) {
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
};

export default Display;
