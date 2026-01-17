/* Bundle of app logic to allow file:// execution */

// --- utils.js ---
function gaussianRandom() {
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); 
    while(v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function getGaussianPitch(baseFreq, varianceCents) {
    if (varianceCents == 0) return baseFreq;
    const z = gaussianRandom(); 
    const deviation = z * varianceCents; 
    // 1200 cents = 1 octave (factor of 2)
    return baseFreq * Math.pow(2, deviation / 1200);
}

// --- notes.js ---
const notes = [
    { note: "C4",  freq: 261.63, type: "white", key: "a" },
    { note: "C#4", freq: 277.18, type: "black", key: "w" },
    { note: "D4",  freq: 293.66, type: "white", key: "s" },
    { note: "D#4", freq: 311.13, type: "black", key: "e" },
    { note: "E4",  freq: 329.63, type: "white", key: "d" },
    { note: "F4",  freq: 349.23, type: "white", key: "f" },
    { note: "F#4", freq: 369.99, type: "black", key: "t" },
    { note: "G4",  freq: 392.00, type: "white", key: "g" },
    { note: "G#4", freq: 415.30, type: "black", key: "y" },
    { note: "A4",  freq: 440.00, type: "white", key: "h" },
    { note: "A#4", freq: 466.16, type: "black", key: "u" },
    { note: "B4",  freq: 493.88, type: "white", key: "j" },
    { note: "C5",  freq: 523.25, type: "white", key: "k" },
    { note: "C#5", freq: 554.37, type: "black", key: "o" },
    { note: "D5",  freq: 587.33, type: "white", key: "l" },
    { note: "D#5", freq: 622.25, type: "black", key: "p" },
    { note: "E5",  freq: 659.25, type: "white", key: ";" } // For US keyboards
];

// --- synth.js ---
class Synth {
    constructor() {
        this.audioCtx = null;
        this.activeVoices = {};
    }

    init() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    playNote(freq, keyId, settings) {
        if (!this.audioCtx) return;
        if (this.activeVoices[keyId]) return; // Monophonic per key

        const { variance, waveType, cutoff, octaveShift } = settings;
        
        // Shift base frequency by octave: freq * 2^shift
        const baseFreq = freq * Math.pow(2, parseInt(octaveShift) || 0);
        const finalFreq = getGaussianPitch(baseFreq, variance);
        const now = this.audioCtx.currentTime;

        // 1. Oscillator (Source)
        const osc = this.audioCtx.createOscillator();
        osc.type = waveType;
        osc.frequency.setValueAtTime(finalFreq, now);

        // 2. Filter (Tone)
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(cutoff, now);
        filter.Q.value = 1; // Slight resonance for flavor

        // 3. Amplifier (Envelope)
        const gainNode = this.audioCtx.createGain();
        
        // Envelope: Attack (no click) -> Sustain
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.02); // 20ms attack
        
        // Wiring: Osc -> Filter -> Gain -> Output
        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.audioCtx.destination);
        
        osc.start();

        this.activeVoices[keyId] = { osc, gainNode };
    }

    stopNote(keyId) {
        if (!this.activeVoices[keyId]) return;

        const { osc, gainNode } = this.activeVoices[keyId];
        // Check if audioCtx is still available/valid
        if (!this.audioCtx) return;
        
        const now = this.audioCtx.currentTime;

        // Release envelope: Fade out over 0.15s
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        
        osc.stop(now + 0.16);

        delete this.activeVoices[keyId];
    }
}

// --- main.js ---

// Ensure DOM is loaded
document.addEventListener('DOMContentLoaded', () => {

    const synth = new Synth();
    let octaveShift = 0;

    function getSettings() {
        return {
            variance: document.getElementById('variance').value,
            waveType: document.getElementById('waveform').value,
            cutoff: document.getElementById('cutoff').value,
            octaveShift: octaveShift
        };
    }

    function updateOctaveDisplay() {
        document.getElementById('octaveVal').innerText = (octaveShift > 0 ? "+" : "") + octaveShift;
    }

    // Visuals
    function setKeyActive(keyId, isActive) {
        const el = document.getElementById('key-' + keyId);
        if (el) {
            if (isActive) el.classList.add('active');
            else el.classList.remove('active');
        }
    }

    function play(freq, key) {
        synth.playNote(freq, key, getSettings());
        setKeyActive(key, true);
    }

    function stop(key) {
        synth.stopNote(key);
        setKeyActive(key, false);
    }

    // Build Piano UI
    const pianoDiv = document.getElementById('piano');

    notes.forEach((n, idx) => {
        const div = document.createElement('div');
        div.id = 'key-' + n.key;
        div.classList.add('key');
        
        // Classes for styling
        if (n.type === 'white') {
            div.classList.add('white-key');
        } else {
            div.classList.add('black-key');
            // Positioning logic
            if(idx === 1) div.classList.add('bk-1');
            if(idx === 3) div.classList.add('bk-2');
            if(idx === 6) div.classList.add('bk-3');
            if(idx === 8) div.classList.add('bk-4');
            if(idx === 10) div.classList.add('bk-5');
            if(idx === 13) div.classList.add('bk-6');
            if(idx === 15) div.classList.add('bk-7');
        }

        // Label
        div.innerHTML = `<span class="key-hint">${n.key.toUpperCase()}</span>`;

        // Mouse Interaction
        div.addEventListener('mousedown', () => play(n.freq, n.key));
        div.addEventListener('mouseup', () => stop(n.key));
        div.addEventListener('mouseleave', () => stop(n.key));

        pianoDiv.appendChild(div);
    });

    // Keyboard Interaction
    window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        const k = e.key.toLowerCase();
        
        // Octave shortcuts
        if (k === 'z') {
            octaveShift--;
            updateOctaveDisplay();
            return;
        }
        if (k === 'x') {
            octaveShift++;
            updateOctaveDisplay();
            return;
        }

        const noteData = notes.find(n => n.key === k);
        if (noteData) play(noteData.freq, k);
    });

    window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (notes.find(n => n.key === k)) stop(k);
    });

    // Controls
    const varianceSlider = document.getElementById('variance');
    varianceSlider.addEventListener('input', (e) => {
        document.getElementById('varianceVal').innerText = e.target.value;
    });

    document.getElementById('octaveDown').addEventListener('click', () => {
        octaveShift--;
        updateOctaveDisplay();
    });

    document.getElementById('octaveUp').addEventListener('click', () => {
        octaveShift++;
        updateOctaveDisplay();
    });

    // Audio Context Start
    document.getElementById('overlay').addEventListener('click', function() {
        synth.init();
        this.style.display = 'none';
    });

});
