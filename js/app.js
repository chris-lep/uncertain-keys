/*
Copyright (c) 2026 Christopher Lepenik

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, version 3.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
"use strict";

// --- utils ---
const DRIFT_DURATION_SECONDS = 24 * 60 * 60;

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

// --- notes ---
const notes = [
    { note: "C4",  freq: 261.63, type: "white", keyUS: "a", keyDE: "a" },
    { note: "C#4", freq: 277.18, type: "black", keyUS: "w", keyDE: "w" },
    { note: "D4",  freq: 293.66, type: "white", keyUS: "s", keyDE: "s" },
    { note: "D#4", freq: 311.13, type: "black", keyUS: "e", keyDE: "e" },
    { note: "E4",  freq: 329.63, type: "white", keyUS: "d", keyDE: "d" },
    { note: "F4",  freq: 349.23, type: "white", keyUS: "f", keyDE: "f" },
    { note: "F#4", freq: 369.99, type: "black", keyUS: "t", keyDE: "t" },
    { note: "G4",  freq: 392.00, type: "white", keyUS: "g", keyDE: "g" },
    { note: "G#4", freq: 415.30, type: "black", keyUS: "y", keyDE: "z" },
    { note: "A4",  freq: 440.00, type: "white", keyUS: "h", keyDE: "h" },
    { note: "A#4", freq: 466.16, type: "black", keyUS: "u", keyDE: "u" },
    { note: "B4",  freq: 493.88, type: "white", keyUS: "j", keyDE: "j" },
    { note: "C5",  freq: 523.25, type: "white", keyUS: "k", keyDE: "k" },
    { note: "C#5", freq: 554.37, type: "black", keyUS: "o", keyDE: "o" },
    { note: "D5",  freq: 587.33, type: "white", keyUS: "l", keyDE: "l" },
    { note: "D#5", freq: 622.25, type: "black", keyUS: "p", keyDE: "p" },
    { note: "E5",  freq: 659.25, type: "white", keyUS: ";", keyDE: "ö" } 
];

// --- synth ---
class Synth {
    constructor() {
        this.audioCtx = null;
        this.activeVoices = {};
        this.masterGain = null;
        this.masterLimiter = null;
        this.masterOutputConnected = false;
        this.baseVoiceGain = 0.18;
        this.noteAttackTime = 0.02;
        this.releaseFloorGain = 0.0001;
        this.minOscillatorFrequency = 1;
        this.nyquistHeadroom = 0.45;
    }

    init() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
        }
        if (!this.masterGain) {
            this.masterGain = this.audioCtx.createGain();
            this.masterGain.gain.value = 1;
        }
        if (!this.masterLimiter && typeof this.audioCtx.createDynamicsCompressor === "function") {
            this.masterLimiter = this.audioCtx.createDynamicsCompressor();
            // Static limiter setup avoids per-note gain jumps while controlling chord peaks.
            this.masterLimiter.threshold.setValueAtTime(-10, this.audioCtx.currentTime);
            this.masterLimiter.knee.setValueAtTime(10, this.audioCtx.currentTime);
            this.masterLimiter.ratio.setValueAtTime(20, this.audioCtx.currentTime);
            this.masterLimiter.attack.setValueAtTime(0.001, this.audioCtx.currentTime);
            this.masterLimiter.release.setValueAtTime(0.12, this.audioCtx.currentTime);
            this.masterGain.connect(this.masterLimiter);
            this.masterLimiter.connect(this.audioCtx.destination);
            this.masterOutputConnected = true;
        } else if (!this.masterOutputConnected) {
            this.masterGain.connect(this.audioCtx.destination);
            this.masterOutputConnected = true;
        }
        if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    playNote(freq, keyId, settings) {
        if (!this.audioCtx) return;
        if (this.activeVoices[keyId]) return; // Monophonic per key

        const { variance, waveType, cutoff, octaveShift, driftDirection, driftMode, driftMean, driftSpread } = settings;
        
        // Shift base frequency by octave: freq * 2^shift
        const baseFreq = freq * Math.pow(2, parseInt(octaveShift) || 0);
        const finalFreq = getGaussianPitch(baseFreq, variance);
        const now = this.audioCtx.currentTime;

        // 1. Oscillator (Source)
        const osc = this.audioCtx.createOscillator();
        osc.type = waveType;
        
        // Pitch Drift Logic
        const useFirefoxSineSafeguard = this.shouldApplyFrequencySafeguard(waveType);
        const startFreq = useFirefoxSineSafeguard ? this.clampFrequency(finalFreq) : finalFreq;
        osc.frequency.setValueAtTime(startFreq, now);

        const dMean = parseFloat(driftMean);
        const dSpread = parseFloat(driftSpread);

        if (dMean > 0 || dSpread > 0) {
            // Determine Direction (1 = Up, -1 = Down)
            const dirProb = parseInt(driftDirection) / 100; // 0.0 to 1.0
            const direction = Math.random() < dirProb ? 1 : -1;

            // Determine Speed (Cents per second)
            let speed;
            if (driftMode === 'uniform') {
                let min = dMean;
                let max = dSpread;
                if (max < min) {
                    const tmp = min;
                    min = max;
                    max = tmp;
                }
                speed = min + (Math.random() * (max - min));
            } else {
                // Gaussian centered at dMean with stdDev dSpread
                speed = dMean + (gaussianRandom() * dSpread);
            }
            
            // Apply drift
            const driftRate = direction * speed; // Cents per second
            
            // Use detune for long-duration drift (24 hours)
            const duration = DRIFT_DURATION_SECONDS; 
            osc.detune.setValueAtTime(0, now);
            this.scheduleDetuneRamp(osc.detune, now, startFreq, driftRate, duration, useFirefoxSineSafeguard);
        }

        // 2. Filter (Tone)
        const filter = this.audioCtx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(cutoff, now);
        filter.Q.value = 1; // Slight resonance for flavor

        // 3. Amplifier (Envelope)
        const gainNode = this.audioCtx.createGain();

        // Envelope: Attack (no click) -> Sustain
        gainNode.gain.setValueAtTime(0, now);
        gainNode.gain.linearRampToValueAtTime(this.baseVoiceGain, now + this.noteAttackTime);
        
        // Wiring: Osc -> Filter -> Gain -> Output
        osc.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterGain);
        
        osc.start();

        this.activeVoices[keyId] = { osc, gainNode, filter };
    }

    stopNote(keyId) {
        if (!this.activeVoices[keyId]) return;

        const { osc, gainNode } = this.activeVoices[keyId];
        // Check if audioCtx is still available/valid
        if (!this.audioCtx) return;
        
        const now = this.audioCtx.currentTime;

        // Release envelope: Fade out over 0.15s
        this.holdGainAutomation(gainNode.gain, now);
        const releaseStart = Math.max(gainNode.gain.value, this.releaseFloorGain);
        gainNode.gain.setValueAtTime(releaseStart, now);
        gainNode.gain.exponentialRampToValueAtTime(this.releaseFloorGain, now + 0.15);
        
        osc.stop(now + 0.16);

        delete this.activeVoices[keyId];
    }

    getFrequencyBounds() {
        const sampleRate = (this.audioCtx && this.audioCtx.sampleRate) ? this.audioCtx.sampleRate : 44100;
        const maxFreq = Math.max(this.minOscillatorFrequency, sampleRate * this.nyquistHeadroom);
        return { min: this.minOscillatorFrequency, max: maxFreq };
    }

    clampFrequency(freq) {
        if (!Number.isFinite(freq)) return this.minOscillatorFrequency;
        const bounds = this.getFrequencyBounds();
        return Math.min(bounds.max, Math.max(bounds.min, freq));
    }

    shouldApplyFrequencySafeguard(waveType) {
        return waveType === "sine";
    }

    holdGainAutomation(gainParam, now) {
        if (typeof gainParam.cancelAndHoldAtTime === "function") {
            gainParam.cancelAndHoldAtTime(now);
            return;
        }
        // Fallback for browsers without cancelAndHoldAtTime.
        const currentValue = gainParam.value;
        gainParam.cancelScheduledValues(now);
        gainParam.setValueAtTime(currentValue, now);
    }

    scheduleDetuneRamp(detuneParam, now, startFreq, driftRate, duration, useSafeguard) {
        const targetDetune = driftRate * duration;
        if (!useSafeguard) {
            detuneParam.linearRampToValueAtTime(targetDetune, now + duration);
            return;
        }

        const safeStartFreq = this.clampFrequency(startFreq);
        const bounds = this.getFrequencyBounds();
        const minDetune = 1200 * Math.log2(bounds.min / safeStartFreq);
        const maxDetune = 1200 * Math.log2(bounds.max / safeStartFreq);
        if (!Number.isFinite(minDetune) || !Number.isFinite(maxDetune) || driftRate === 0) {
            detuneParam.linearRampToValueAtTime(targetDetune, now + duration);
            return;
        }

        const withinBounds = targetDetune >= minDetune && targetDetune <= maxDetune;
        if (withinBounds) {
            detuneParam.linearRampToValueAtTime(targetDetune, now + duration);
            return;
        }

        const detuneLimit = driftRate > 0 ? maxDetune : minDetune;
        const timeToLimit = detuneLimit / driftRate;
        if (timeToLimit <= 0) {
            detuneParam.setValueAtTime(detuneLimit, now);
            detuneParam.setValueAtTime(detuneLimit, now + duration);
            return;
        }
        if (timeToLimit >= duration) {
            detuneParam.linearRampToValueAtTime(targetDetune, now + duration);
            return;
        }

        // Preserve original drift rate until the safe limit, then hold at that limit.
        detuneParam.linearRampToValueAtTime(detuneLimit, now + timeToLimit);
        detuneParam.setValueAtTime(detuneLimit, now + duration);
    }

}

// --- main ---

// Ensure DOM is loaded
document.addEventListener('DOMContentLoaded', () => {

    const synth = new Synth();
    let currentLayout = 'US';
    let octaveShift = 0;
    let recorderNode = null;
    let recorderSilentGain = null;
    let recorderInputConnected = false;
    let isRecording = false;
    let recordedLength = 0;
    let recordedBuffers = [];
    let lastRecordingUrl = null;
    let midiAccess = null;
    let selectedMidiInput = null;
    let selectedMidiInputId = "";
    const midiActiveNotes = new Map();

    const recordStartBtn = document.getElementById('recordStart');
    const recordStopBtn = document.getElementById('recordStop');
    const midiEnableBtn = document.getElementById('midiEnable');
    const midiInputSelect = document.getElementById('midiInputSelect');
    const midiRefreshBtn = document.getElementById('midiRefresh');
    const midiStatusEl = document.getElementById('midiStatus');

    function timestampedName(ext) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        return `uncertain-keys-recording-${stamp}.${ext}`;
    }

    function downloadBlob(blob, filename) {
        if (lastRecordingUrl) {
            URL.revokeObjectURL(lastRecordingUrl);
            lastRecordingUrl = null;
        }
        const url = URL.createObjectURL(blob);
        lastRecordingUrl = url;
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => {
            if (lastRecordingUrl === url) {
                URL.revokeObjectURL(url);
                lastRecordingUrl = null;
            }
        }, 1000);
    }

    function setRecordingUI(recording) {
        if (recordStartBtn) recordStartBtn.disabled = recording;
        if (recordStopBtn) recordStopBtn.disabled = !recording;
    }

    function mergeBuffers(buffers, totalLength) {
        const result = new Float32Array(totalLength);
        let offset = 0;
        buffers.forEach(buffer => {
            result.set(buffer, offset);
            offset += buffer.length;
        });
        return result;
    }

    function interleave(left, right) {
        const length = left.length + right.length;
        const result = new Float32Array(length);
        let index = 0;
        for (let i = 0; i < left.length; i++) {
            result[index++] = left[i];
            result[index++] = right[i];
        }
        return result;
    }

    function floatTo16BitPCM(view, offset, input) {
        for (let i = 0; i < input.length; i++, offset += 2) {
            let s = Math.max(-1, Math.min(1, input[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }

    function writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    function encodeWav(buffers, sampleRate, numChannels) {
        const bytesPerSample = 2;
        const blockAlign = numChannels * bytesPerSample;
        const dataLength = buffers.length * bytesPerSample;
        const buffer = new ArrayBuffer(44 + dataLength);
        const view = new DataView(buffer);

        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataLength, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bytesPerSample * 8, true);
        writeString(view, 36, 'data');
        view.setUint32(40, dataLength, true);

        floatTo16BitPCM(view, 44, buffers);
        return new Blob([view], { type: 'audio/wav' });
    }

    function startRecording() {
        if (isRecording) return;
        synth.init();
        if (!synth.audioCtx || !synth.masterGain) return;

        const bufferSize = 4096;
        const channelCount = 2;
        recorderNode = synth.audioCtx.createScriptProcessor(bufferSize, channelCount, channelCount);
        recorderSilentGain = synth.audioCtx.createGain();
        recorderSilentGain.gain.value = 0;

        recordedLength = 0;
        recordedBuffers = Array.from({ length: channelCount }, () => []);

        recorderNode.onaudioprocess = (event) => {
            const input = event.inputBuffer;
            const channels = Math.min(channelCount, input.numberOfChannels);
            for (let ch = 0; ch < channels; ch++) {
                recordedBuffers[ch].push(new Float32Array(input.getChannelData(ch)));
            }
            recordedLength += input.length;
            const output = event.outputBuffer;
            for (let ch = 0; ch < output.numberOfChannels; ch++) {
                output.getChannelData(ch).fill(0);
            }
        };

        synth.masterGain.connect(recorderNode);
        recorderInputConnected = true;
        recorderNode.connect(recorderSilentGain);
        recorderSilentGain.connect(synth.audioCtx.destination);

        isRecording = true;
        setRecordingUI(true);
    }

    function stopRecording() {
        if (!isRecording) return;
        isRecording = false;
        setRecordingUI(false);

        if (recorderInputConnected && synth.masterGain && recorderNode) {
            synth.masterGain.disconnect(recorderNode);
            recorderInputConnected = false;
        }
        if (recorderNode) {
            recorderNode.disconnect();
            recorderNode.onaudioprocess = null;
            recorderNode = null;
        }
        if (recorderSilentGain) {
            recorderSilentGain.disconnect();
            recorderSilentGain = null;
        }

        const sampleRate = synth.audioCtx ? synth.audioCtx.sampleRate : 44100;
        const hasSecondChannel = recordedBuffers.length > 1 && recordedBuffers[1].length > 0;
        const merged = recordedBuffers.map(buffers => mergeBuffers(buffers, recordedLength));
        let output;
        let channelCount = 1;
        if (hasSecondChannel) {
            output = interleave(merged[0], merged[1]);
            channelCount = 2;
        } else {
            output = merged[0];
        }
        const wavBlob = encodeWav(output, sampleRate, channelCount);
        downloadBlob(wavBlob, timestampedName('wav'));
        recordedBuffers = [];
        recordedLength = 0;
    }

    function getSettings() {
        const driftModeToggle = document.getElementById('driftMode');
        return {
            variance: document.getElementById('variance').value,
            waveType: document.getElementById('waveform').value,
            cutoff: document.getElementById('cutoff').value,
            octaveShift: octaveShift,
            driftDirection: document.getElementById('driftDirection').value,
            driftMode: (driftModeToggle && driftModeToggle.checked) ? 'uniform' : 'gaussian',
            driftMean: document.getElementById('driftMean').value,
            driftSpread: document.getElementById('driftSpread').value
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

    function play(freq, idx) {
        synth.playNote(freq, idx, getSettings());
        setKeyActive(idx, true);
    }

    function stop(idx) {
        synth.stopNote(idx);
        setKeyActive(idx, false);
    }

    function updateMidiStatus(message) {
        if (midiStatusEl) midiStatusEl.innerText = message;
    }

    function isWebMidiSupported() {
        return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
    }

    function midiNoteToFrequency(noteNumber) {
        return 440 * Math.pow(2, (noteNumber - 69) / 12);
    }

    function buildMidiVoiceId(channel, noteNumber) {
        return `midi:${channel}:${noteNumber}`;
    }

    function getMidiInputs() {
        if (!midiAccess || !midiAccess.inputs) return [];
        return Array.from(midiAccess.inputs.values());
    }

    function getMidiInputById(id) {
        if (!id) return null;
        const inputs = getMidiInputs();
        return inputs.find(input => input.id === id) || null;
    }

    function stopAllMidiNotes() {
        midiActiveNotes.forEach((voiceId) => {
            stop(voiceId);
        });
        midiActiveNotes.clear();
    }

    function detachSelectedMidiInputListener() {
        if (!selectedMidiInput) return;
        selectedMidiInput.onmidimessage = null;
        selectedMidiInput = null;
    }

    function handleMidiMessage(event) {
        if (!event || !event.data || event.data.length < 2) return;
        const status = event.data[0];
        const noteNumber = event.data[1];
        const velocity = event.data.length > 2 ? event.data[2] : 0;
        const messageType = status & 0xF0;
        const channel = status & 0x0F;

        if (messageType !== 0x80 && messageType !== 0x90) return;

        const voiceId = buildMidiVoiceId(channel, noteNumber);
        const isNoteOff = messageType === 0x80 || velocity === 0;

        if (isNoteOff) {
            if (!midiActiveNotes.has(voiceId)) return;
            stop(voiceId);
            midiActiveNotes.delete(voiceId);
            return;
        }

        if (midiActiveNotes.has(voiceId)) return;
        synth.init();
        play(midiNoteToFrequency(noteNumber), voiceId);
        midiActiveNotes.set(voiceId, voiceId);
    }

    function attachSelectedMidiInputListener() {
        detachSelectedMidiInputListener();
        if (!selectedMidiInputId) {
            updateMidiStatus('No MIDI input selected');
            return;
        }
        selectedMidiInput = getMidiInputById(selectedMidiInputId);
        if (!selectedMidiInput) {
            selectedMidiInputId = "";
            updateMidiStatus('Selected device disconnected');
            return;
        }
        selectedMidiInput.onmidimessage = handleMidiMessage;
        updateMidiStatus(`Connected: ${selectedMidiInput.name || 'Unknown MIDI device'}`);
    }

    function populateMidiInputOptions() {
        if (!midiInputSelect) return;
        const inputs = getMidiInputs();
        const hasInputs = inputs.length > 0;

        if (selectedMidiInputId && !inputs.some(input => input.id === selectedMidiInputId)) {
            selectedMidiInputId = "";
            stopAllMidiNotes();
            detachSelectedMidiInputListener();
        }

        midiInputSelect.innerHTML = '';
        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.innerText = hasInputs ? 'Select MIDI input' : 'No MIDI inputs';
        midiInputSelect.appendChild(placeholder);

        inputs.forEach((input) => {
            const option = document.createElement('option');
            option.value = input.id;
            option.innerText = input.name || 'Unnamed MIDI input';
            midiInputSelect.appendChild(option);
        });

        if (!selectedMidiInputId && hasInputs) {
            selectedMidiInputId = inputs[0].id;
        }

        midiInputSelect.disabled = !hasInputs;
        midiInputSelect.value = selectedMidiInputId || '';

        if (!hasInputs) {
            detachSelectedMidiInputListener();
            updateMidiStatus('No MIDI inputs found');
            return;
        }

        attachSelectedMidiInputListener();
    }

    async function enableMidi() {
        if (!isWebMidiSupported()) {
            updateMidiStatus('MIDI unavailable in this browser');
            return;
        }
        if (midiAccess) {
            populateMidiInputOptions();
            return;
        }
        try {
            midiAccess = await navigator.requestMIDIAccess({ sysex: false });
            synth.init();
            if (typeof midiAccess.addEventListener === 'function') {
                midiAccess.addEventListener('statechange', populateMidiInputOptions);
            } else {
                midiAccess.onstatechange = populateMidiInputOptions;
            }
            if (midiEnableBtn) midiEnableBtn.disabled = true;
            if (midiRefreshBtn) midiRefreshBtn.disabled = false;
            populateMidiInputOptions();
        } catch (error) {
            updateMidiStatus('MIDI access denied');
        }
    }

    // Build Piano UI
    const pianoDiv = document.getElementById('piano');

    notes.forEach((n, idx) => {
        const div = document.createElement('div');
        div.id = 'key-' + idx; // Use index as ID for stability
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
        const label = n.keyUS.toUpperCase();
        div.innerHTML = `<span class="key-hint" id="hint-${idx}">${label}</span>`;

        // Touch Interaction (for lower latency on mobile)
        div.addEventListener('touchstart', (e) => {
            e.preventDefault();
            play(n.freq, idx);
        }, { passive: false });

        div.addEventListener('touchend', (e) => {
            e.preventDefault();
            stop(idx);
        });

        div.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            stop(idx);
        });

        // Pointer Interaction (Mouse & Touch)
        div.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            play(n.freq, idx);
            div.setPointerCapture(e.pointerId); // Keep receiving events even if sliding off
        });
        
        div.addEventListener('pointerup', (e) => {
            e.preventDefault();
            div.releasePointerCapture(e.pointerId);
            stop(idx);
        });

        div.addEventListener('pointercancel', (e) => {
            e.preventDefault();
            div.releasePointerCapture(e.pointerId);
            stop(idx);
        });
        
        pianoDiv.appendChild(div);
    });

    // Helper to get active key for current layout
    function getKeyForLayout(note, layout) {
        return layout === 'DE' ? note.keyDE : note.keyUS;
    }

    function updateKeyHints() {
        notes.forEach((n, idx) => {
            const hintEl = document.getElementById(`hint-${idx}`);
            if (hintEl) {
                hintEl.innerText = getKeyForLayout(n, currentLayout).toUpperCase();
            }
        });
    }

    // Keyboard Interaction
    window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        const k = e.key.toLowerCase();
        
        // Octave shortcuts (Layout aware)
        // Down: 'z' on US, 'y' on DE (Physical bottom-left key)
        const downKey = currentLayout === 'DE' ? 'y' : 'z';
        // Up: 'x' on both
        const upKey = 'x';

        if (k === downKey) {
            octaveShift--;
            updateOctaveDisplay();
            return;
        }
        if (k === upKey) {
            octaveShift++;
            updateOctaveDisplay();
            return;
        }

        // Play Note
        const noteIdx = notes.findIndex(n => getKeyForLayout(n, currentLayout) === k);
        
        if (noteIdx !== -1) {
            play(notes[noteIdx].freq, noteIdx);
        }
    });

    window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        const noteIdx = notes.findIndex(n => getKeyForLayout(n, currentLayout) === k);
        
        if (noteIdx !== -1) {
            stop(noteIdx);
        }
    });

    // Controls
    const varianceSlider = document.getElementById('variance');
    varianceSlider.addEventListener('input', (e) => {
        document.getElementById('varianceVal').innerText = e.target.value;
    });

    const driftDirSlider = document.getElementById('driftDirection');
    driftDirSlider.addEventListener('input', (e) => {
        document.getElementById('driftDirectionVal').innerText = e.target.value + "%";
    });

    const driftMeanSlider = document.getElementById('driftMean');
    driftMeanSlider.addEventListener('input', (e) => {
        document.getElementById('driftMeanVal').innerText = e.target.value;
        if (driftModeToggle && driftModeToggle.checked) {
            enforceUniformMinMax('mean');
        }
    });

    const driftSpreadSlider = document.getElementById('driftSpread');
    driftSpreadSlider.addEventListener('input', (e) => {
        document.getElementById('driftSpreadVal').innerText = e.target.value;
        if (driftModeToggle && driftModeToggle.checked) {
            enforceUniformMinMax('spread');
        }
    });

    function getStepPrecision(stepValue) {
        const stepString = String(stepValue);
        if (!stepString.includes('.')) return 0;
        return stepString.split('.')[1].length;
    }

    function nudgeRangeInput(inputEl, direction, event) {
        if (!inputEl) return;
        const step = parseFloat(inputEl.step || '1');
        const min = parseFloat(inputEl.min || '0');
        const max = parseFloat(inputEl.max || '100');
        const current = parseFloat(inputEl.value || '0');
        let multiplier = 1;
        if (event && event.shiftKey) multiplier = 10;
        if (event && event.altKey) multiplier = 0.1;
        const next = current + (direction * step * multiplier);
        const precision = getStepPrecision(step * multiplier);
        const clamped = Math.min(max, Math.max(min, next));
        inputEl.value = precision > 0 ? clamped.toFixed(precision) : String(Math.round(clamped));
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    document.querySelectorAll('.param-stepper').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            const targetId = btn.dataset.target;
            const direction = parseFloat(btn.dataset.direction || '0');
            if (!targetId || !direction) return;
            const inputEl = document.getElementById(targetId);
            nudgeRangeInput(inputEl, direction, e);
        });
    });

    const driftModeToggle = document.getElementById('driftMode');
    const driftMeanLabel = document.getElementById('driftMeanLabel');
    const driftSpreadLabel = document.getElementById('driftSpreadLabel');
    const driftModeLabelGaussian = document.getElementById('driftModeLabelGaussian');
    const driftModeLabelUniform = document.getElementById('driftModeLabelUniform');
    const driftDefaults = { gaussian: { mean: '0', spread: '0' }, uniform: { mean: '0', spread: '0' } };

    function readDriftValues() {
        return {
            mean: driftMeanSlider ? driftMeanSlider.value : '0',
            spread: driftSpreadSlider ? driftSpreadSlider.value : '0'
        };
    }

    function setDriftValues(values) {
        if (driftMeanSlider && typeof values.mean !== 'undefined') {
            driftMeanSlider.value = values.mean;
            driftMeanSlider.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (driftSpreadSlider && typeof values.spread !== 'undefined') {
            driftSpreadSlider.value = values.spread;
            driftSpreadSlider.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function enforceUniformMinMax(changed) {
        if (!driftMeanSlider || !driftSpreadSlider) return;
        const minVal = parseFloat(driftMeanSlider.value || '0');
        const maxVal = parseFloat(driftSpreadSlider.value || '0');
        if (minVal <= maxVal) return;
        if (changed === 'mean') {
            driftSpreadSlider.value = driftMeanSlider.value;
            driftSpreadSlider.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            driftMeanSlider.value = driftSpreadSlider.value;
            driftMeanSlider.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    function updateDriftLabels() {
        if (!driftModeToggle) return;
        const isUniform = driftModeToggle.checked;
        if (driftMeanLabel) {
            driftMeanLabel.innerText = isUniform ? 'Minimum Drift (cts/s)' : 'Mean Drift Speed (cts/s)';
        }
        if (driftSpreadLabel) {
            driftSpreadLabel.innerText = isUniform ? 'Maximum Drift (cts/s)' : 'Drift Spread (cts/s)';
        }
        if (driftModeLabelGaussian) {
            driftModeLabelGaussian.classList.toggle('toggle-label-active', !isUniform);
        }
        if (driftModeLabelUniform) {
            driftModeLabelUniform.classList.toggle('toggle-label-active', isUniform);
        }
        driftModeToggle.setAttribute('aria-checked', isUniform ? 'true' : 'false');
    }

    if (driftModeToggle) {
        driftModeToggle.addEventListener('change', () => {
            const fromMode = driftModeToggle.checked ? 'gaussian' : 'uniform';
            const toMode = driftModeToggle.checked ? 'uniform' : 'gaussian';
            driftDefaults[fromMode] = readDriftValues();
            setDriftValues(driftDefaults[toMode]);
            updateDriftLabels();
            if (driftModeToggle.checked) {
                enforceUniformMinMax('mean');
            }
        });
        if (driftModeLabelGaussian) {
            driftModeLabelGaussian.addEventListener('click', () => {
                driftModeToggle.checked = false;
                driftModeToggle.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }
        if (driftModeLabelUniform) {
            driftModeLabelUniform.addEventListener('click', () => {
                driftModeToggle.checked = true;
                driftModeToggle.dispatchEvent(new Event('change', { bubbles: true }));
            });
        }
        updateDriftLabels();
    }

    const cutoffSlider = document.getElementById('cutoff');
    cutoffSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        document.getElementById('cutoffVal').innerText = val;
        
        // Update active voices in real-time
        if (synth && synth.activeVoices && synth.audioCtx) {
            const now = synth.audioCtx.currentTime;
            Object.values(synth.activeVoices).forEach(voice => {
                if (voice.filter) {
                    voice.filter.frequency.setValueAtTime(val, now);
                }
            });
        }
    });

    if (recordStartBtn) {
        recordStartBtn.addEventListener('click', startRecording);
    }
    if (recordStopBtn) {
        recordStopBtn.addEventListener('click', stopRecording);
    }

    if (midiEnableBtn) {
        midiEnableBtn.addEventListener('click', enableMidi);
    }
    if (midiInputSelect) {
        midiInputSelect.addEventListener('change', (e) => {
            stopAllMidiNotes();
            selectedMidiInputId = e.target.value || '';
            attachSelectedMidiInputListener();
        });
    }
    if (midiRefreshBtn) {
        midiRefreshBtn.addEventListener('click', () => populateMidiInputOptions());
    }

    // Layout Switch
    const layoutSelect = document.getElementById('layout');
    if (layoutSelect) {
        layoutSelect.addEventListener('change', (e) => {
            currentLayout = e.target.value;
            updateKeyHints();
            // Stop all notes when switching layouts to prevent stuck keys
            Object.keys(synth.activeVoices).forEach(key => stop(key));
        });
    }

    // Octave Buttons
    const btnDown = document.getElementById('octaveDown');
    if (btnDown) {
        btnDown.addEventListener('click', () => {
            octaveShift--;
            updateOctaveDisplay();
        });
    }

    const btnUp = document.getElementById('octaveUp');
    if (btnUp) {
        btnUp.addEventListener('click', () => {
            octaveShift++;
            updateOctaveDisplay();
        });
    }

    // Audio Context Start
    const overlay = document.getElementById('overlay');
    const startAudio = () => {
        synth.init();
        if (overlay) overlay.style.display = 'none';
    };
    if (overlay) {
        overlay.addEventListener('click', startAudio);
        overlay.addEventListener('pointerdown', startAudio);
    }

    // About Modal
    const aboutBtn = document.getElementById('aboutBtn');
    const aboutModal = document.getElementById('aboutModal');
    const aboutClose = document.getElementById('aboutClose');

    function openAbout() {
        if (!aboutModal) return;
        aboutModal.classList.add('open');
        aboutModal.setAttribute('aria-hidden', 'false');
    }

    function closeAbout() {
        if (!aboutModal) return;
        aboutModal.classList.remove('open');
        aboutModal.setAttribute('aria-hidden', 'true');
    }

    if (aboutBtn) {
        aboutBtn.addEventListener('click', () => openAbout());
    }
    if (aboutClose) {
        aboutClose.addEventListener('click', () => closeAbout());
    }
    if (aboutModal) {
        aboutModal.addEventListener('click', (e) => {
            if (e.target === aboutModal) closeAbout();
        });
    }
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAbout();
    });

    if (!isWebMidiSupported()) {
        if (midiEnableBtn) midiEnableBtn.disabled = true;
        if (midiInputSelect) midiInputSelect.disabled = true;
        if (midiRefreshBtn) midiRefreshBtn.disabled = true;
        updateMidiStatus('MIDI unavailable in this browser');
    } else {
        if (midiInputSelect) midiInputSelect.disabled = true;
        if (midiRefreshBtn) midiRefreshBtn.disabled = true;
        updateMidiStatus('MIDI access not enabled');
    }

    window.addEventListener('beforeunload', () => {
        stopAllMidiNotes();
        detachSelectedMidiInputListener();
    });

});
