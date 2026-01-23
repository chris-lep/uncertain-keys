const fs = require('fs');
const path = require('path');

// Load the app.js content
const appJsPath = path.resolve(__dirname, '../js/app.js');
const appJsContent = fs.readFileSync(appJsPath, 'utf8');

describe('Uncertain Keys Logic', () => {
    
    // Mocks for Web Audio API
    let mockOscillator, mockGain, mockFilter, mockContext;

    beforeAll(() => {
        // Setup robust mocks
        mockOscillator = {
            type: 'sine',
            frequency: {
                setValueAtTime: jest.fn(),
                exponentialRampToValueAtTime: jest.fn()
            },
            connect: jest.fn(),
            start: jest.fn(),
            stop: jest.fn()
        };

        mockGain = {
            gain: {
                value: 0,
                setValueAtTime: jest.fn(),
                linearRampToValueAtTime: jest.fn(),
                cancelScheduledValues: jest.fn(),
                exponentialRampToValueAtTime: jest.fn()
            },
            connect: jest.fn()
        };

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
            createGain: jest.fn(() => mockGain),
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

        test('playNote creates audio nodes and connects them', () => {
            synth.init();
            const settings = {
                variance: 0,
                waveType: 'sine',
                cutoff: 1000,
                octaveShift: 0,
                driftDirection: 50,
                driftMean: 0,
                driftSpread: 0
            };

            synth.playNote(440, 0, settings);

            expect(mockContext.createOscillator).toHaveBeenCalled();
            expect(mockContext.createBiquadFilter).toHaveBeenCalled();
            expect(mockContext.createGain).toHaveBeenCalled();

            // Check wiring: Osc -> Filter -> Gain -> Destination
            expect(mockOscillator.connect).toHaveBeenCalledWith(mockFilter);
            expect(mockFilter.connect).toHaveBeenCalledWith(mockGain);
            expect(mockGain.connect).toHaveBeenCalledWith(mockContext.destination);
            
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
                driftMean: 100,      // Fast drift
                driftSpread: 0
            };

            synth.playNote(440, 0, settings);

            // Should call exponentialRampToValueAtTime for pitch drift
            expect(mockOscillator.frequency.exponentialRampToValueAtTime).toHaveBeenCalled();
        });

        test('stopNote stops the oscillator and releases gain', () => {
            synth.init();
            const settings = { variance: 0, waveType: 'sine', cutoff: 1000, octaveShift: 0, driftDirection: 50, driftMean: 0, driftSpread: 0 };
            
            // Start note 0
            synth.playNote(440, 0, settings);
            
            // Stop note 0
            synth.stopNote(0);

            // Gain release
            expect(mockGain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.001, expect.any(Number));
            // Oscillator stop
            expect(mockOscillator.stop).toHaveBeenCalled();
        });

        test('activeVoices prevents double playing', () => {
            synth.init();
            const settings = { variance: 0, waveType: 'sine', cutoff: 1000, octaveShift: 0, driftDirection: 50, driftMean: 0, driftSpread: 0 };

            synth.playNote(440, 0, settings);
            synth.playNote(440, 0, settings); // Call again with same keyId

            // Should only create one oscillator (called once)
            expect(mockContext.createOscillator).toHaveBeenCalledTimes(1);
        });
    });
});
