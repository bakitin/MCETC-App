//peerconnection.js
class PeerConnection {

    constructor(id, userName, signaling, connections, audio, display) {
        // Estado propio de este peer
        this.id = id;
        this.connection = null;
        this.pendingIceCandidates = [];
        this.userName = userName;
        this.polite = this.userName < this.id;
        this.makingOffer = false


        // Dependencias compartidas por toda la app, recibidas, no creadas
        this.signaling = signaling;
        this.connections = connections;
        this.audio = audio;
        this.display = display;
    };



    async connect() {
        this.connection = await this.connections.createConnection();

        this.connections.onIceCandidate(this.connection, (candidate) => {
            this.sendMessage("ice", candidate.toJSON())
        });


        this.connections.onNegotiationNeeded(this.connection, async () => {
            console.log("negociación disparada de nuevo");   // ← agrega esto
            const offer = await this.createOffer();
            await this.sendMessage("offer", offer);
        });
    };

    async addAudioTracks() {
        const tracks = await this.audio.getAudioTracks();
        const senders = await this.audio.getAudioSenders(this.connection);

        for (const track of tracks) {
            const alreadyAdded = await this.audio.hasAudioTrack(track, senders);

            if (!alreadyAdded) {
                const sender = await this.audio.addAudioTrack(track, this.connection);
                await this.audio.configureAudioSender(sender);
            };
        };
    };

    async addDisplayTrack() {
        const tracks = await this.display.getVideoTracks();
        const senders = await this.display.getVideoSenders(this.connection);

        for (const track of tracks) {
            const alreadyAdded = await this.display.hasVideoTrack(track, senders);

            if (!alreadyAdded) {
                const sender = await this.display.addVideoTrack(track, this.connection);
                await this.display.configureVideoSender(sender);
            };
        };
    };

    onRemoteAudio(callback) {
        this.audio.onRemoteAudioTrack(this.id, this.connection, callback)
    };

    onRemoteVideo(callback, onEndDisplayShare) {
        this.display.onRemoteVideoTrack(this.id, this.connection, callback, onEndDisplayShare)
    };

    async createOffer() {
        try {

            this.makingOffer = true;

            const offer = await this.connections.createOffer(this.connection);
            await this.connections.setLocalDescription(this.connection, offer);
            return offer;

        } catch (error) {
            console.log("Ocurrio un error: ", error)
        } finally {

            this.makingOffer = false;

        }

    };

    async createAnswer(offerReceived) {
        const collision = this.makingOffer || this.connection.signalingState !== "stable";
        const ignoreOffer = !this.polite && collision;

        if (ignoreOffer) {
            return null
        }

        await this.connections.setRemoteDescription(this.connection, offerReceived);
        const answer = await this.connections.createAnswer(this.connection);
        await this.connections.setLocalDescription(this.connection, answer);
        return answer;
    };

    async applyAnswer(data) {
        await this.connections.setRemoteDescription(this.connection, data);
    };

    async addIceCandidate(candidate) {
        try {

            if (this.connection.remoteDescription) {
                for (const pending of this.pendingIceCandidates) {
                    await this.connection.addIceCandidate(pending);
                };
                this.pendingIceCandidates = [];

                await this.connection.addIceCandidate(candidate);
            } else {
                this.pendingIceCandidates.push(candidate);
            };

        } catch (error) {
            console.log("Ocurrio un error: ", error)
        }

    };

    async sendMessage(type, data) {
        await this.signaling.sendMessage(type, data, null, this.id);
    };

    monitorState(onDead) {
        this.connections.monitorState(this.id, this.connection, onDead);
    };

    close() {
        this.audio.removeAudioTrackListener(this.id, this.connection);
        this.display.removeVideoTrackListener(this.id, this.connection);
        this.connection.close();
    };
};

export default PeerConnection;
