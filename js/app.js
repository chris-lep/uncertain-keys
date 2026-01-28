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
    }

    init() {
        if (!this.audioCtx) {
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
        }
        if (!this.masterGain) {
            this.masterGain = this.audioCtx.createGain();
            this.masterGain.gain.value = 1;
            this.masterGain.connect(this.audioCtx.destination);
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
        osc.frequency.setValueAtTime(finalFreq, now);

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
            const targetDetune = driftRate * duration;

            // Use linear ramp on detune (which equals exponential frequency change)
            osc.detune.setValueAtTime(0, now);
            osc.detune.linearRampToValueAtTime(targetDetune, now + duration);
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
        gainNode.gain.linearRampToValueAtTime(0.3, now + 0.02); // 20ms attack
        
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
        gainNode.gain.cancelScheduledValues(now);
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        
        osc.stop(now + 0.16);

        delete this.activeVoices[keyId];
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

    const recordStartBtn = document.getElementById('recordStart');
    const recordStopBtn = document.getElementById('recordStop');

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
    });

    const driftSpreadSlider = document.getElementById('driftSpread');
    driftSpreadSlider.addEventListener('input', (e) => {
        document.getElementById('driftSpreadVal').innerText = e.target.value;
    });

    const driftModeToggle = document.getElementById('driftMode');
    const driftMeanLabel = document.getElementById('driftMeanLabel');
    const driftSpreadLabel = document.getElementById('driftSpreadLabel');
    const driftModeLabelGaussian = document.getElementById('driftModeLabelGaussian');
    const driftModeLabelUniform = document.getElementById('driftModeLabelUniform');

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
        driftModeToggle.addEventListener('change', updateDriftLabels);
        if (driftModeLabelGaussian) {
            driftModeLabelGaussian.addEventListener('click', () => {
                driftModeToggle.checked = false;
                updateDriftLabels();
            });
        }
        if (driftModeLabelUniform) {
            driftModeLabelUniform.addEventListener('click', () => {
                driftModeToggle.checked = true;
                updateDriftLabels();
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
        overlay.style.display = 'none';
    };
    overlay.addEventListener('click', startAudio);
    overlay.addEventListener('pointerdown', startAudio);

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

});
