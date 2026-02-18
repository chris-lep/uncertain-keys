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
const fs = require('fs');
const path = require('path');

const appJsPath = path.resolve(__dirname, '../js/app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

describe('MIDI Input Support', () => {
    let mockContext;
    let mockOscillator;
    let midiAccess;

    const buildDom = () => {
        document.body.innerHTML = `
            <div id="overlay"></div>
            <div id="piano"></div>
            <select id="waveform"><option value="sine">Sine</option></select>
            <input id="variance" type="range" value="0" />
            <span id="varianceVal"></span>
            <input id="cutoff" type="range" value="20000" />
            <span id="cutoffVal"></span>
            <input id="driftDirection" type="range" value="50" />
            <span id="driftDirectionVal"></span>
            <input id="driftMean" type="range" value="0" />
            <span id="driftMeanVal"></span>
            <input id="driftSpread" type="range" value="0" />
            <span id="driftSpreadVal"></span>
            <input id="driftMode" type="checkbox" />
            <span id="driftModeLabelGaussian"></span>
            <span id="driftModeLabelUniform"></span>
            <span id="driftMeanLabel"></span>
            <span id="driftSpreadLabel"></span>
            <select id="layout"><option value="US">US</option></select>
            <button id="octaveDown"></button>
            <button id="octaveUp"></button>
            <span id="octaveVal"></span>
            <button id="aboutBtn"></button>
            <div id="aboutModal"></div>
            <button id="aboutClose"></button>
            <button id="recordStart">Start Recording</button>
            <button id="recordStop" disabled>Stop Recording</button>
            <button id="midiEnable">Enable MIDI</button>
            <select id="midiInputSelect" disabled><option value="">No MIDI inputs</option></select>
            <button id="midiRefresh" disabled>Refresh</button>
            <span id="midiStatus"></span>
        `;
    };

    const setupAudioMocks = () => {
        mockOscillator = {
            type: 'sine',
            frequency: {
                setValueAtTime: jest.fn()
            },
            detune: {
                setValueAtTime: jest.fn(),
                linearRampToValueAtTime: jest.fn()
            },
            connect: jest.fn(),
            start: jest.fn(),
            stop: jest.fn()
        };

        const mockFilter = {
            type: 'lowpass',
            frequency: {
                setValueAtTime: jest.fn()
            },
            Q: { value: 0 },
            connect: jest.fn()
        };

        const mockCompressor = {
            threshold: { setValueAtTime: jest.fn() },
            knee: { setValueAtTime: jest.fn() },
            ratio: { setValueAtTime: jest.fn() },
            attack: { setValueAtTime: jest.fn() },
            release: { setValueAtTime: jest.fn() },
            connect: jest.fn()
        };

        const createMockGain = () => ({
            gain: {
                value: 0,
                setValueAtTime: jest.fn(),
                linearRampToValueAtTime: jest.fn(),
                cancelScheduledValues: jest.fn(),
                cancelAndHoldAtTime: jest.fn(),
                exponentialRampToValueAtTime: jest.fn()
            },
            connect: jest.fn(),
            disconnect: jest.fn()
        });

        mockContext = {
            state: 'running',
            currentTime: 0,
            destination: {},
            resume: jest.fn(),
            createOscillator: jest.fn(() => mockOscillator),
            createBiquadFilter: jest.fn(() => mockFilter),
            createDynamicsCompressor: jest.fn(() => mockCompressor),
            createGain: jest.fn(() => createMockGain())
        };

        window.AudioContext = jest.fn(() => mockContext);
        window.webkitAudioContext = window.AudioContext;
    };

    const setupMidiAccessMock = (inputs = []) => {
        midiAccess = {
            inputs: new Map(inputs.map(input => [input.id, input])),
            addEventListener: jest.fn((eventName, handler) => {
                if (eventName === 'statechange') midiAccess.onstatechange = handler;
            }),
            onstatechange: null
        };

        Object.defineProperty(navigator, 'requestMIDIAccess', {
            configurable: true,
            writable: true,
            value: jest.fn().mockResolvedValue(midiAccess)
        });
    };

    beforeEach(() => {
        buildDom();
        setupAudioMocks();
        setupMidiAccessMock();
        window.eval(appJsContent);
        document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    test('enabling MIDI requests access and populates device select', async () => {
        const input = { id: 'dev-1', name: 'Virtual Bus', manufacturer: 'LoopMIDI', onmidimessage: null };
        setupMidiAccessMock([input]);

        document.getElementById('midiEnable').click();
        await Promise.resolve();

        expect(navigator.requestMIDIAccess).toHaveBeenCalledWith({ sysex: false });
        expect(document.getElementById('midiInputSelect').disabled).toBe(false);
        expect(document.getElementById('midiInputSelect').value).toBe('dev-1');
        expect(document.getElementById('midiStatus').innerText).toContain('Connected: Virtual Bus (LoopMIDI)');
        expect(document.getElementById('midiInputSelect').options[1].textContent).toBe('Virtual Bus (LoopMIDI)');
    });

    test('manual single-select switches message handler between devices', async () => {
        const inputA = { id: 'dev-a', name: 'Keyboard A', onmidimessage: null };
        const inputB = { id: 'dev-b', name: 'Bus B', onmidimessage: null };
        setupMidiAccessMock([inputA, inputB]);

        document.getElementById('midiEnable').click();
        await Promise.resolve();

        expect(inputA.onmidimessage).toEqual(expect.any(Function));
        expect(inputB.onmidimessage).toBeNull();

        const select = document.getElementById('midiInputSelect');
        select.value = 'dev-b';
        select.dispatchEvent(new Event('change', { bubbles: true }));

        expect(inputA.onmidimessage).toBeNull();
        expect(inputB.onmidimessage).toEqual(expect.any(Function));
    });

    test('MIDI note on/off plays and stops corresponding synth voice', async () => {
        const input = { id: 'dev-1', name: 'Controller', onmidimessage: null };
        setupMidiAccessMock([input]);

        document.getElementById('midiEnable').click();
        await Promise.resolve();

        input.onmidimessage({ data: new Uint8Array([0x90, 69, 100]) });

        expect(mockContext.createOscillator).toHaveBeenCalledTimes(1);
        const [freq] = mockOscillator.frequency.setValueAtTime.mock.calls[0];
        expect(freq).toBeCloseTo(440, 6);

        input.onmidimessage({ data: new Uint8Array([0x80, 69, 0]) });
        expect(mockOscillator.stop).toHaveBeenCalledTimes(1);
    });

    test('note on with velocity zero is treated as note off', async () => {
        const input = { id: 'dev-1', name: 'Controller', onmidimessage: null };
        setupMidiAccessMock([input]);

        document.getElementById('midiEnable').click();
        await Promise.resolve();

        input.onmidimessage({ data: new Uint8Array([0x90, 72, 127]) });
        input.onmidimessage({ data: new Uint8Array([0x90, 72, 0]) });

        expect(mockOscillator.stop).toHaveBeenCalledTimes(1);
    });

    test('unsupported browsers show unavailable MIDI status', () => {
        Object.defineProperty(navigator, 'requestMIDIAccess', {
            configurable: true,
            writable: true,
            value: undefined
        });

        buildDom();
        setupAudioMocks();
        window.eval(appJsContent);
        document.dispatchEvent(new Event('DOMContentLoaded'));

        expect(document.getElementById('midiStatus').innerText).toContain('MIDI unavailable');
        expect(document.getElementById('midiEnable').disabled).toBe(true);
    });
});
