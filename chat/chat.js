//chat.js
class Chat {

    constructor(signaling) {
        this.signaling = signaling;
    };

    // método para mandar
    async sendChatMessage(text) {
    try {
        await this.signaling.sendMessage("chat_message", text, null, null);
    } catch (error) {
        console.log("Error al enviar mensaje de chat: ", error);
    };
};
    // método para recibir
};

export default Chat;