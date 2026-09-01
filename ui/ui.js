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

    // bindMuteCallButton(id, callback) {
    //     const element = document.getElementById(id);
    //     if (!element) {
    //         console.log("Elemento no encontrado: ", id);
    //         return;
    //     }
    //     element.onclick = () => callback();
    // };

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
        const textElement = this.createTextElement(id, " Audio");
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
};

export default UI;