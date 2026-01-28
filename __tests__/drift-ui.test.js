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

describe('Drift UI Behavior', () => {
    beforeEach(() => {
        buildDom();
        window.eval(appJsContent);
        document.dispatchEvent(new Event('DOMContentLoaded'));
    });

    test('drift modes remember their last settings', () => {
        const driftMode = document.getElementById('driftMode');
        const driftMean = document.getElementById('driftMean');
        const driftSpread = document.getElementById('driftSpread');

        driftMean.value = '12';
        driftMean.dispatchEvent(new Event('input', { bubbles: true }));
        driftSpread.value = '34';
        driftSpread.dispatchEvent(new Event('input', { bubbles: true }));

        driftMode.checked = true;
        driftMode.dispatchEvent(new Event('change', { bubbles: true }));
        expect(driftMean.value).toBe('0');
        expect(driftSpread.value).toBe('0');

        driftMean.value = '5';
        driftMean.dispatchEvent(new Event('input', { bubbles: true }));
        driftSpread.value = '15';
        driftSpread.dispatchEvent(new Event('input', { bubbles: true }));

        driftMode.checked = false;
        driftMode.dispatchEvent(new Event('change', { bubbles: true }));
        expect(driftMean.value).toBe('12');
        expect(driftSpread.value).toBe('34');
    });

    test('uniform mode enforces minimum not greater than maximum', () => {
        const driftMode = document.getElementById('driftMode');
        const driftMean = document.getElementById('driftMean');
        const driftSpread = document.getElementById('driftSpread');

        driftMode.checked = true;
        driftMode.dispatchEvent(new Event('change', { bubbles: true }));

        driftMean.value = '20';
        driftMean.dispatchEvent(new Event('input', { bubbles: true }));
        expect(driftSpread.value).toBe('20');

        driftSpread.value = '10';
        driftSpread.dispatchEvent(new Event('input', { bubbles: true }));
        expect(driftMean.value).toBe('10');
    });
});
