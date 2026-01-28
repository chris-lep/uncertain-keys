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

// Load the app.js content
const appJsPath = path.resolve(__dirname, '../js/app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

describe('Uncertain Keys Logic', () => {
    
    // Mocks for Web Audio API
    let mockOscillator, mockFilter, mockContext;
    let gainNodes = [];

    beforeAll(() => {
        // Setup robust mocks
        mockOscillator = {
            type: 'sine',
            frequency: {
                setValueAtTime: jest.fn(),
                exponentialRampToValueAtTime: jest.fn()
            },
            detune: {
                setValueAtTime: jest.fn(),
                linearRampToValueAtTime: jest.fn()
            },
            connect: jest.fn(),
            start: jest.fn(),
            stop: jest.fn()
        };

        const createMockGain = () => ({
            gain: {
                value: 0,
                setValueAtTime: jest.fn(),
                linearRampToValueAtTime: jest.fn(),
                cancelScheduledValues: jest.fn(),
                exponentialRampToValueAtTime: jest.fn()
            },
            connect: jest.fn(),
            disconnect: jest.fn()
        });

        mockFilter = {
            type: 'lowpass',
            frequency: {
                setValueAtTime: jest.fn()
            },
            Q: { value: 0 },
            connect: jest.fn()
        };

        mockContext = {
            state: 'suspended',
            resume: jest.fn(),
            createOscillator: jest.fn(() => mockOscillator),
            createBiquadFilter: jest.fn(() => mockFilter),
            createGain: jest.fn(() => {
                const node = createMockGain();
                gainNodes.push(node);
                return node;
            }),
            currentTime: 100,
            destination: {}
        };

        window.AudioContext = jest.fn(() => mockContext);
        window.webkitAudioContext = window.AudioContext;

        // Execute the script in the global scope using window.eval
        // We append lines to manually expose 'const' and 'class' definitions to 'window'
        // because standard eval of const/class doesn't attach them to the global object.
        const augmentedContent = appJsContent + `
            try { window.notes = notes; } catch(e) {}
            try { window.Synth = Synth; } catch(e) {}
            try { window.gaussianRandom = gaussianRandom; } catch(e) {}
            try { window.getGaussianPitch = getGaussianPitch; } catch(e) {}
        `;
        window.eval(augmentedContent);
    });

    beforeEach(() => {
        // Clear mock history between tests
        jest.clearAllMocks();
        gainNodes = [];
    });

    describe('Math Helper Functions', () => {
        test('gaussianRandom returns values within reasonable range', () => {
            const samples = [];
            for(let i=0; i<1000; i++) {
                samples.push(window.gaussianRandom());
            }

            const avg = samples.reduce((a,b) => a+b, 0) / samples.length;
            const max = Math.max(...samples);
            const min = Math.min(...samples);

            expect(Math.abs(avg)).toBeLessThan(0.15);
            expect(max).toBeLessThan(6);
            expect(min).toBeGreaterThan(-6);
        });

        test('getGaussianPitch returns baseFreq when variance is 0', () => {
            const base = 440;
            const result = window.getGaussianPitch(base, 0);
            expect(result).toBe(base);
        });

        test('getGaussianPitch varies when variance > 0', () => {
            const base = 440;
            const variance = 50; 
            const results = new Set();
            for(let i=0; i<50; i++) {
                results.add(window.getGaussianPitch(base, variance));
            }
            expect(results.size).toBeGreaterThan(1);
        });

        test('getGaussianPitch maintains average pitch near baseFreq', () => {
            const base = 440;
            const variance = 100;
            let sum = 0;
            const iterations = 10000;
            for(let i=0; i<iterations; i++) {
                sum += window.getGaussianPitch(base, variance);
            }
            expect(Math.abs((sum/iterations) - base)).toBeLessThan(base * 0.05); 
        });
    });

    describe('Data Integrity (Notes)', () => {
        test('notes array exists and is populated', () => {
            expect(Array.isArray(window.notes)).toBe(true);
            expect(window.notes.length).toBeGreaterThan(0);
        });

        test('all notes have valid properties', () => {
            window.notes.forEach(n => {
                expect(typeof n.note).toBe('string');
                expect(typeof n.freq).toBe('number');
                expect(n.freq).toBeGreaterThan(0);
                expect(['white', 'black']).toContain(n.type);
                expect(n.keyUS).toBeDefined();
                expect(n.keyDE).toBeDefined();
            });
        });
    });

    describe('Synth Class Logic', () => {
        let synth;

        beforeEach(() => {
            synth = new window.Synth();
        });

        test('init creates AudioContext', () => {
            synth.init();
            expect(window.AudioContext).toHaveBeenCalled();
            expect(synth.audioCtx).toBe(mockContext);
        });

        test('init creates master gain and connects to destination', () => {
            synth.init();
            const masterGain = gainNodes[0];
            expect(masterGain).toBeDefined();
            expect(masterGain.connect).toHaveBeenCalledWith(mockContext.destination);
        });

        test('playNote creates audio nodes and connects them', () => {
            synth.init();
            const settings = {
                variance: 0,
                waveType: 'sine',
                cutoff: 1000,
                octaveShift: 0,
                driftDirection: 50,
                driftMode: 'gaussian',
                driftMean: 0,
                driftSpread: 0
            };

            synth.playNote(440, 0, settings);

            expect(mockContext.createOscillator).toHaveBeenCalled();
            expect(mockContext.createBiquadFilter).toHaveBeenCalled();
            expect(mockContext.createGain).toHaveBeenCalled();

            const masterGain = gainNodes[0];
            const voiceGain = gainNodes[1];

            // Check wiring: Osc -> Filter -> Gain -> Master -> Destination
            expect(mockOscillator.connect).toHaveBeenCalledWith(mockFilter);
            expect(mockFilter.connect).toHaveBeenCalledWith(voiceGain);
            expect(voiceGain.connect).toHaveBeenCalledWith(masterGain);
            expect(masterGain.connect).toHaveBeenCalledWith(mockContext.destination);
            
            expect(mockOscillator.start).toHaveBeenCalled();
        });

        test('playNote respects octave shift', () => {
            synth.init();
            const baseFreq = 440;
            const settings = {
                variance: 0,
                waveType: 'sine',
                cutoff: 1000,
                octaveShift: 1, // Shift up one octave
                driftDirection: 50,
                driftMode: 'gaussian',
                driftMean: 0,
                driftSpread: 0
            };

            synth.playNote(baseFreq, 0, settings);

            // Expect freq to be 880 (440 * 2^1)
            expect(mockOscillator.frequency.setValueAtTime).toHaveBeenCalledWith(880, expect.any(Number));
        });

        test('playNote triggers drift when settings allow', () => {
            synth.init();
            const settings = {
                variance: 0,
                waveType: 'sine',
                cutoff: 1000,
                octaveShift: 0,
                driftDirection: 100, // Force UP
                driftMode: 'gaussian',
                driftMean: 100,      // Fast drift
                driftSpread: 0
            };

            synth.playNote(440, 0, settings);

            // Should call linearRampToValueAtTime on detune for pitch drift
            expect(mockOscillator.detune.linearRampToValueAtTime).toHaveBeenCalled();
        });

        test('playNote skips drift when mean and spread are zero', () => {
            synth.init();
            const settings = {
                variance: 0,
                waveType: 'sine',
                cutoff: 1000,
                octaveShift: 0,
                driftDirection: 50,
                driftMode: 'gaussian',
                driftMean: 0,
                driftSpread: 0
            };

            synth.playNote(440, 0, settings);

            expect(mockOscillator.detune.linearRampToValueAtTime).not.toHaveBeenCalled();
        });

        test('uniform drift uses minimum and maximum range', () => {
            synth.init();
            const originalRandom = Math.random;
            Math.random = jest.fn(() => 0); // Choose minimum

            const settings = {
                variance: 0,
                waveType: 'sine',
                cutoff: 1000,
                octaveShift: 0,
                driftDirection: 100, // Force UP
                driftMode: 'uniform',
                driftMean: 10,  // Minimum
                driftSpread: 20 // Maximum
            };

            synth.playNote(440, 0, settings);

            const duration = 86400;
            expect(mockOscillator.detune.linearRampToValueAtTime)
                .toHaveBeenCalledWith(10 * duration, expect.any(Number));

            Math.random = originalRandom;
        });

        test('uniform drift can use maximum when random is 1', () => {
            synth.init();
            const originalRandom = Math.random;
            Math.random = jest.fn()
                .mockReturnValueOnce(0) // Direction
                .mockReturnValueOnce(1); // Speed -> max

            const settings = {
                variance: 0,
                waveType: 'sine',
                cutoff: 1000,
                octaveShift: 0,
                driftDirection: 100, // Force UP
                driftMode: 'uniform',
                driftMean: 10,  // Minimum
                driftSpread: 20 // Maximum
            };

            synth.playNote(440, 0, settings);

            const duration = 86400;
            expect(mockOscillator.detune.linearRampToValueAtTime)
                .toHaveBeenCalledWith(20 * duration, expect.any(Number));

            Math.random = originalRandom;
        });

        test('uniform drift respects downward direction when probability is 0', () => {
            synth.init();
            const originalRandom = Math.random;
            Math.random = jest.fn()
                .mockReturnValueOnce(0.9) // Direction -> down
                .mockReturnValueOnce(0);  // Speed -> min

            const settings = {
                variance: 0,
                waveType: 'sine',
                cutoff: 1000,
                octaveShift: 0,
                driftDirection: 0, // Force DOWN
                driftMode: 'uniform',
                driftMean: 10,  // Minimum
                driftSpread: 20 // Maximum
            };

            synth.playNote(440, 0, settings);

            const duration = 86400;
            expect(mockOscillator.detune.linearRampToValueAtTime)
                .toHaveBeenCalledWith(-10 * duration, expect.any(Number));

            Math.random = originalRandom;
        });

        test('gaussian drift respects downward direction', () => {
            synth.init();
            const originalRandom = Math.random;
            Math.random = jest.fn()
                .mockReturnValueOnce(0.9)  // Direction -> down
                .mockReturnValueOnce(0.5)  // gaussianRandom u
                .mockReturnValueOnce(0.25); // gaussianRandom v => cos(pi/2)=0

            const settings = {
                variance: 0,
                waveType: 'sine',
                cutoff: 1000,
                octaveShift: 0,
                driftDirection: 0, // Force DOWN
                driftMode: 'gaussian',
                driftMean: 12,
                driftSpread: 5
            };

            synth.playNote(440, 0, settings);

            const duration = 86400;
            expect(mockOscillator.detune.linearRampToValueAtTime)
                .toHaveBeenCalledWith(-12 * duration, expect.any(Number));

            Math.random = originalRandom;
        });

        test('uniform drift swaps min/max when provided out of order', () => {
            synth.init();
            const originalRandom = Math.random;
            Math.random = jest.fn(() => 0); // Choose minimum after swap

            const settings = {
                variance: 0,
                waveType: 'sine',
                cutoff: 1000,
                octaveShift: 0,
                driftDirection: 100, // Force UP
                driftMode: 'uniform',
                driftMean: 25,  // Intended maximum
                driftSpread: 5  // Intended minimum
            };

            synth.playNote(440, 0, settings);

            const duration = 86400;
            expect(mockOscillator.detune.linearRampToValueAtTime)
                .toHaveBeenCalledWith(5 * duration, expect.any(Number));

            Math.random = originalRandom;
        });

        test('gaussian drift uses mean when gaussianRandom evaluates to zero', () => {
            synth.init();
            const originalRandom = Math.random;
            Math.random = jest.fn()
                .mockReturnValueOnce(0.1)  // Direction
                .mockReturnValueOnce(0.5)  // gaussianRandom u
                .mockReturnValueOnce(0.25); // gaussianRandom v => cos(pi/2)=0

            const settings = {
                variance: 0,
                waveType: 'sine',
                cutoff: 1000,
                octaveShift: 0,
                driftDirection: 100, // Force UP
                driftMode: 'gaussian',
                driftMean: 12,
                driftSpread: 5
            };

            synth.playNote(440, 0, settings);

            const duration = 86400;
            expect(mockOscillator.detune.linearRampToValueAtTime)
                .toHaveBeenCalledWith(12 * duration, expect.any(Number));

            Math.random = originalRandom;
        });

        test('drift initializes detune before ramping', () => {
            synth.init();
            const settings = {
                variance: 0,
                waveType: 'sine',
                cutoff: 1000,
                octaveShift: 0,
                driftDirection: 100, // Force UP
                driftMode: 'gaussian',
                driftMean: 10,
                driftSpread: 0
            };

            synth.playNote(440, 0, settings);

            expect(mockOscillator.detune.setValueAtTime)
                .toHaveBeenCalledWith(0, expect.any(Number));
            expect(mockOscillator.detune.linearRampToValueAtTime)
                .toHaveBeenCalled();
        });

        test('stopNote stops the oscillator and releases gain', () => {
            synth.init();
            const settings = { variance: 0, waveType: 'sine', cutoff: 1000, octaveShift: 0, driftDirection: 50, driftMode: 'gaussian', driftMean: 0, driftSpread: 0 };
            
            // Start note 0
            synth.playNote(440, 0, settings);
            const voiceGain = gainNodes[1];
            
            // Stop note 0
            synth.stopNote(0);

            // Gain release
            expect(voiceGain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, expect.any(Number));
            // Oscillator stop
            expect(mockOscillator.stop).toHaveBeenCalled();
        });

        test('activeVoices prevents double playing', () => {
            synth.init();
            const settings = { variance: 0, waveType: 'sine', cutoff: 1000, octaveShift: 0, driftDirection: 50, driftMode: 'gaussian', driftMean: 0, driftSpread: 0 };

            synth.playNote(440, 0, settings);
            synth.playNote(440, 0, settings); // Call again with same keyId

            // Should only create one oscillator (called once)
            expect(mockContext.createOscillator).toHaveBeenCalledTimes(1);
        });
    });
});
