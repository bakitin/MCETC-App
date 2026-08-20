//peerconnection.js
class PeerConnection {

    constructor(id, userName, signaling, connections, audio) {
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
    };



    async connect() {
        this.connection = await this.connections.createConnection();

        this.connections.onIceCandidate(this.connection, (candidate) => {
            this.signaling.sendMessage("ice", candidate.toJSON(), null, this.id);
        });
    };

    async addLocalTracks() {
        const tracks = await this.audio.getTracks();
        const senders = await this.audio.getSenders(this.connection);

        for (const track of tracks) {
            const alreadyAdded = await this.audio.hasTrack(track, senders);

            if (!alreadyAdded) {
                const sender = await this.audio.addTrack(track, this.connection);
                await this.audio.configureSender(sender);
            };
        };
    };

    waitForRemoteAudio() {
        return this.audio.waitForRemoteTrack(this.id, this.connection);
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

    monitorState(onDead) {
        this.connections.monitorState(this.id, this.connection, onDead);
    };

    close() {
        this.audio.removeTrackListener(this.id, this.connection);
        this.connection.close();
    };
};

export default PeerConnection;
