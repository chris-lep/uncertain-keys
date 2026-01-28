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

describe('Recording Feature (WAV)', () => {
    let mockContext;
    let gainNodes;
    let lastRecorderNode;

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
        `;
    };

    const setupAudioMocks = () => {
        gainNodes = [];
        lastRecorderNode = null;

        const createMockGain = () => ({
            gain: { value: 1 },
            connect: jest.fn(),
            disconnect: jest.fn()
        });

        const createScriptProcessor = jest.fn(() => {
            const node = {
                connect: jest.fn(),
                disconnect: jest.fn(),
                onaudioprocess: null
            };
            lastRecorderNode = node;
            return node;
        });

        mockContext = {
            state: 'suspended',
            resume: jest.fn(),
            currentTime: 0,
            sampleRate: 44100,
            destination: {},
            createGain: jest.fn(() => {
                const node = createMockGain();
                gainNodes.push(node);
                return node;
            }),
            createScriptProcessor
        };

        window.AudioContext = jest.fn(() => mockContext);
        window.webkitAudioContext = window.AudioContext;
    };

    beforeEach(() => {
        buildDom();
        setupAudioMocks();
        window.URL.createObjectURL = jest.fn(() => 'blob:mock');
        window.URL.revokeObjectURL = jest.fn();
        if (!HTMLAnchorElement.prototype.click) {
            HTMLAnchorElement.prototype.click = jest.fn();
        }
        window.eval(appJsContent);
        document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    test('start recording wires nodes and toggles buttons', () => {
        const recordStart = document.getElementById('recordStart');
        const recordStop = document.getElementById('recordStop');

        expect(recordStart.disabled).toBe(false);
        expect(recordStop.disabled).toBe(true);

        recordStart.click();

        expect(mockContext.createScriptProcessor).toHaveBeenCalled();
        const masterGain = gainNodes[0];
        expect(masterGain.connect).toHaveBeenCalledWith(mockContext.destination);
        expect(masterGain.connect).toHaveBeenCalledWith(lastRecorderNode);
        expect(recordStart.disabled).toBe(true);
        expect(recordStop.disabled).toBe(false);
    });

    test('stop recording disconnects and downloads wav', () => {
        const recordStart = document.getElementById('recordStart');
        const recordStop = document.getElementById('recordStop');

        recordStart.click();
        recordStop.click();

        const masterGain = gainNodes[0];
        expect(masterGain.disconnect).toHaveBeenCalled();
        expect(lastRecorderNode.disconnect).toHaveBeenCalled();
        expect(window.URL.createObjectURL).toHaveBeenCalled();
        expect(recordStart.disabled).toBe(false);
        expect(recordStop.disabled).toBe(true);
    });
});
