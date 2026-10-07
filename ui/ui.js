//ui.js

class UI {
    constructor() {
    }

    bindEnterCallButton(id, callback) {
        const element = document.getElementById(id);
        if (!element) {
            console.log("Elemento no encontrado: ", id);
            return;
        }
        element.onclick = () => callback();
    };

    bindExitCallButton(id, callback) {
        const element = document.getElementById(id);
        if (!element) {
            console.log("Elemento no encontrado: ", id);
            return;
        }
        element.onclick = () => callback();
    };

    bindShareDisplayButton(id, callback) {
        const element = document.getElementById(id);
        if (!element) {
            console.log("Elemento no encontrado: ", id);
            return;
        }
        element.onclick = () => callback();
    };

    bindStopShareDisplayButton(id, callback) {
        const element = document.getElementById(id);
        if (!element) {
            console.log("Elemento no encontrado: ", id);
            return;
        }
        element.onclick = () => callback();
    };

    bindSendMessageButton(id, callback) {
        const element = document.getElementById(id);
        if (!element) {
            console.log("Elemento no encontrado: ", id);
            return;
        }
        element.addEventListener("submit", (event) => {
            event.preventDefault();
            callback();
        });
    };

    bindMuteCallButton(id, callback) {
        const element = document.getElementById(id);
        if (!element) {
            console.log("Elemento no encontrado: ", id);
            return;
        }
        element.onclick = () => callback();
    };

    getElementById(id) {
        const element = document.getElementById(id);
        if (!element) {
            console.log("Elemento no encontrado: ", id);
            return;
        }
        return element;
    }

    createVideoElement(src, id) {
        const videoElement = document.createElement('video');
        videoElement.autoplay = true;
        videoElement.srcObject = src;
        videoElement.dataset.id = id;

        videoElement.play().catch(error => {
            console.warn("Video bloqueado: ", error);
        });

        return videoElement;
    };
    createAudioElement(src, id) {
        const audioElement = document.createElement('audio');
        audioElement.autoplay = true;
        audioElement.srcObject = src;
        audioElement.dataset.id = id;

        audioElement.play().catch(error => {
            console.warn("Autoplay bloqueado: ", error);
        });

        return audioElement;
    };

    createTextElementToAudio(id) {
        const textElement = document.createElement('h3');
        textElement.textContent = id;
        textElement.id = id;
        return textElement;
    };

    createTextElementToChat(id, message, isOwn) {
        const wrapper = document.createElement('div');
        wrapper.className = `chat_message ${isOwn ? 'chat_message--own' : 'chat_message--peer'}`;

        const author = document.createElement('span');
        author.className = 'chat_message_author';
        author.textContent = id;

        const text = document.createElement('span');
        text.className = 'chat_message_text';
        text.textContent = message;

        wrapper.append(author, text);
        return wrapper;
    };

    disableButton(id) {
        const element = document.getElementById(id);
        if (!element) {
            console.log("Elemento no encontrado: ", id);
            return;
        }
        element.disabled = true;
    };

    enableButton(id) {
        const element = document.getElementById(id);
        if (!element) {
            console.log("Elemento no encontrado: ", id);
            return;
        }
        element.disabled = false;
    };

    appendAudio(audioContainer, audioElement) {
        audioContainer.appendChild(audioElement);
        audioElement.controls = true;
    };

    appendVideo(videoContainer, videoElement) {
        videoContainer.appendChild(videoElement);
        videoElement.controls = true;
    };

    appendText(textContainer, textElement) {
        textContainer.appendChild(textElement);
    };

    removeAudio(id) {
        const audio = document.querySelector(`audio[data-id = "${id}"]`);
        if (audio) audio.remove();
    };

    removeVideo(id) {
        const video = document.querySelector(`video[data-id="${id}"]`);
        console.log("intentando borrar video de:", id, "encontrado:", video);   // ← agrega esto
        if (video) video.remove();
    };

    removeText(id) {
        const text = document.getElementById(id);
        if (text) text.remove();
    };

    showAudioPeer(id, audioStream) {
        const audioContainer = this.getElementById("audio_site");
        const audioElement = this.createAudioElement(audioStream, id);
        this.appendAudio(audioContainer, audioElement);

        const textContainer = this.getElementById("audio_from");
        const textElement = this.createTextElementToAudio(id, " Audio");
        this.appendText(textContainer, textElement);
    };

    showVideoPeer(id, videoStream) {
        const videoContainer = this.getElementById("video_site");
        const videoElement = this.createVideoElement(videoStream, id);
        this.appendVideo(videoContainer, videoElement);
    };

    showUsernameModal(id) {
        const overlay = document.getElementById(id);
        overlay.classList.add("activo");
    };

    hideUsernameModal(id) {
        const overlay = document.getElementById(id);
        overlay.classList.remove("activo");
    };

    getUsername() {
        return localStorage.getItem('username');
    };

    bindSaveUsername(id, callback) {
        const element = document.getElementById(id);
        if (element) {
            element.onclick = () => callback();
        };
    };

    getUsernameInput(id) {
        return document.getElementById(id).value;
    };

    showUsername(id, username) {
        const element = document.getElementById(id);
        element.textContent = "klk " + username;
    };

    showChatPeer(id, message, isOwn = false) {
        const chatContainer = this.getElementById("chat_global");
        chatContainer.appendChild(this.createTextElementToChat(id, message, isOwn));
        chatContainer.scrollTop = chatContainer.scrollHeight;
    };

    getInputValue(id){
        const input = document.getElementById(id).value;
        return input
    };

    clearInput(id){
        document.getElementById(id).value = "";
    };

    switchIcon(id, state){
        const element = document.getElementById(id)
        if (!element) {
            console.log("Elemento no encontrado: ", id);
            return;
        };
        const icon = element.querySelector("i");

        if (!icon) {
            console.log("Icono no encontrado");
            return
        };
        
        if (state === false) {
            //cambia muteado
            icon.classList.remove("fa-microphone");
            icon.classList.add("fa-microphone-slash");
            element.classList.add("is-muted");
        }else{
            //cambia a desmuetear
            icon.classList.remove("fa-microphone-slash");
            icon.classList.add("fa-microphone");
            element.classList.remove("is-muted");
        }

    };
};

export default UI;