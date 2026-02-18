# Uncertain Keys Synthesizer

Uncertain Keys is a virtual synthesizer that explores pitch uncertainty and
drift. Each note is sampled from a probability distribution around the target
frequency, then optionally glides over time at a randomized rate and direction.

## How It Works

- **Pitch Instability (Variance)**: On note-on, the target frequency is
  perturbed by a random offset in cents. The offset is applied in logarithmic
  space so that a given variance sounds consistent across the keyboard.
- **Drift Direction**: A per-note probability that the drift rate is positive
  (upward) or negative (downward).
- **Drift Speed**: A per-note rate in cents/second. When a note is held, its
  detune parameter ramps linearly to create continuous drift over long durations.
- **Drift Distribution Switch** (visual toggle):
  - **Gaussian**: Drift speed is drawn from a normal distribution with mean and
    standard deviation set by the controls.
  - **Uniform**: Drift speed is drawn from a uniform distribution between a
    minimum and maximum.
- **Play Modes**: Use on-screen keys or a computer keyboard (US and German
  layouts supported), and MIDI input devices (physical or virtual).
- **Engine**: Runs entirely in the browser via the Web Audio API.

## Controls

- **Musical Keys**: Use your keyboard's home row and top row to play notes. The
  on-screen keys will display the correct character mapping based on your
  selected layout (US or German).
- **Octave Shifting**:
  - Shift Down: **`Z`** (US layout) or **`Y`** (German layout).
  - Shift Up: **`X`**.
- **Interface**:
  - **Layout**: Switch between US and German keyboard layouts.
  - **MIDI**:
    - Click **Enable MIDI** to grant Web MIDI access.
    - Choose a single active input device from the MIDI dropdown (manual selection).
    - Both physical MIDI controllers and virtual MIDI buses are supported.
    - MIDI velocity is currently ignored.
    - Octave shift applies to MIDI notes and keyboard notes.
  - **Variance**: Controls the random pitch deviation.
  - **Waveform**: Selects the oscillator shape.
  - **Filter Cutoff**: Adjusts the brightness of the sound.
  - **Octave**: Buttons to shift the octave.
  - **Fine Adjustment Buttons**: Use the +/− buttons next to sliders for precise tweaks.
  - **Drift Direction**: Probability of the pitch gliding Up vs. Down.
  - **Drift Distribution Switch**: Toggle between Gaussian (mean/spread) and
    Uniform (minimum/maximum).
  - **Mean Drift Speed / Drift Spread**: Gaussian mode controls for drift mean
    and standard deviation (cents/s).
  - **Minimum Drift / Maximum Drift**: Uniform mode controls for minimum and
    maximum drift speed (cents/s).
  - **Mode Memory**: Gaussian and Uniform modes remember their most recent settings.
  - **Recording**: Use **Start Recording** to capture the master output and
    **Stop Recording** to finish and download a WAV file.

## Usage

### Local Use

To play the synthesizer locally:

1. Download or clone this repository.
2. Open **`index.html`** in any modern web browser.

Note:
- MIDI requires a browser with **Web MIDI API** support.

### Recording

1. Click **Start Recording** (the synth will initialize audio if it is not
   already running).
2. Perform as usual.
3. Click **Stop Recording** to download a timestamped **.wav** file.

Notes:
- Recording captures the master output (including filter, drift, and variance).
- Each recording downloads automatically; your browser may ask for permission
  the first time it saves a file.

### Live Demo

The synthesizer can be accessed at the repository's associated GitHub Pages URL
(https://chris-lep.github.io/uncertain-keys/).

## Project Structure

- `index.html`: Main application entry point.
- `css/`: Styling (`style.css`).
- `js/`: Application logic (`app.js`).

## Development

While the project runs as a static site (no build step required), it includes a
test suite to ensure the mathematical logic and audio synthesis behaviors are
correct.

### Prerequisites

- **Node.js** (v14 or higher) is required to run the tests.

### Setup

Install the development dependencies:

```bash
npm install
```

### Running Tests

Run the Jest test suite:

```bash
npm test
```

The tests use **JSDOM** to simulate the browser environment, allowing
verification of the application logic without needing a browser window.

## Attribution & Citation

If you use the Uncertain Keys Synthesizer in a musical recording, performance,
research, or other academic or artistic work, attribution is appreciated.

Suggested attribution:
> Instrument: Uncertain Keys Synthesizer  
> Created by Christopher Lepenik  
> Source: https://github.com/chris-lep/uncertain-keys

## License

Copyright (c) 2026 Christopher Lepenik.

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, version 3.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
`LICENSE` file for more details.
