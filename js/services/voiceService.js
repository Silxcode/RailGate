/**
 * Handles Text-to-Speech for status announcements
 */
const VoiceService = {
    speak(text) {
        if (!('speechSynthesis' in window)) return;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-IN';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);

        this.showVisualOverlay(text);
    },

    showVisualOverlay(text) {
        const overlay = document.getElementById('voice-overlay');
        const textEl = document.getElementById('voice-text');

        textEl.innerText = text;
        overlay.classList.remove('hidden');

        setTimeout(() => overlay.classList.add('hidden'), 3000);
    },

    announceStatus(gateName, status) {
        const message = `${gateName} is currently ${status}`;
        this.speak(message);
    }
};

window.VoiceService = VoiceService;
