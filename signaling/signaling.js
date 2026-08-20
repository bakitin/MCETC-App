// signaling.js
class Signaling {

    constructor() {
        this.socket = null;
    };

    async connect(onServerDead) {

        return new Promise((resolve, reject) => {
            this.socket = new WebSocket("wss://unshackle-think-return.ngrok-free.dev");

            this.socket.onopen = () => {
                console.log("WebSocket conectado al servidor");
                resolve();
            };

            this.socket.onerror = (error) => {
                console.log("Error en WebSocket:", error);
                reject(error);
            };

            this.socket.onclose = (error) => {
                console.log("WebSocket cerrado: ", error);
                onServerDead();
            };
        });

    };

    async disconect(){
        this.socket.close()
    }

    async sendMessage(type, data, username = null, to_client_id = null) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            const message = {
                type: type,
                data: data
            };

            if (username !== null) {
                message.username = username;
            };

            if (to_client_id !== null) {
                message.to_client_id = to_client_id;
            };

            this.socket.send(JSON.stringify(message));
        };
    };

    async onMessage(callback) {

        this.socket.onmessage = async (event) => {
            try {
                const { type, data, id } = JSON.parse(event.data);
                await callback(type, data, id);
            } catch (error) {
                console.log("Mensaje invalido: ", error);
                return;
            };
        };
    };

};

export default Signaling;
