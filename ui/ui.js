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

    bindMuteMicButton(id, callback) {
        const element = document.getElementById(id);
        if (!element) {
            console.log("Elemento no encontrado: ", id);
            return;
        }
        element.onclick = () => callback();
    };

    bindMuteCallButton(id, callback) {
        const element = document.getElementById(id);
        if (!element) {
            console.log("Elemento no encontrado: ", id);
            return;
        }
        element.onclick = () => callback();
    };

    getAudioContainer(id) {
        const element = document.getElementById(id);
        if (!element) {
            console.log("Elemento no encontrado: ", id);
            return;
        }
        return element;
    };

    getTextContainer(id) {
        const element = document.getElementById(id);
        if (!element) {
            console.log("Elemento no encontrado: ", id);
            return;
        }
        return element;
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

    createTextElement(id) {
        const textElement = document.createElement('h3');
        textElement.textContent = id;
        textElement.id = id;
        return textElement;
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

    appendText(textContainer, textElement) {
        textContainer.appendChild(textElement);
    };

    removeAudio(id) {
        const audio = document.querySelector(`[data-id = "${id}"]`);
        if (audio) audio.remove();
    };

    removeText(id) {
        const text = document.getElementById(id);
        if (text) text.remove();
    };

    showPeer(id, audioStream) {
        const audioContainer = this.getAudioContainer("audio_site");
        const audioElement = this.createAudioElement(audioStream, id);
        this.appendAudio(audioContainer, audioElement);

        const textContainer = this.getTextContainer("audio_from");
        const textElement = this.createTextElement(id);
        this.appendText(textContainer, textElement);
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
        element.textContent = "keloke " + username;
    };
};

export default UI;
