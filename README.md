# Uncertain Keys Synthesizer

A virtual synthesizer that explores pitch uncertainty and drift. Instead of playing a fixed frequency for every note, it samples a pitch from a Gaussian distribution centered around the target frequency and can glide over time with randomized speed and direction.

## Key Features

- **Uncertain Pitch**: Each key press generates a slightly different pitch based on a Gaussian probability distribution.
- **Logarithmic Distribution**: The pitch variation is calculated in cents (logarithmic space) to ensure consistent perceived variation across the frequency spectrum.
- **Tunable Variance**: You can adjust the standard deviation (in cents) to control how "out of tune" or unstable the synthesizer sounds.
- **Drifting Pitch**: Notes can glide in pitch over time with randomized speed and direction.
- **Octave Control**: Shift the entire keyboard range up or down by arbitrary octaves to explore different registers.
- **Web Audio API**: Runs entirely in the browser using the Web Audio API.
- **Keyboard Support**: Play using your computer keyboard (supports both US and German layouts) or by clicking the on-screen keys.

## Controls

- **Musical Keys**: Use your keyboard's home row and top row to play notes. The on-screen keys will display the correct character mapping based on your selected layout (US or German).
- **Octave Shifting**:
  - Shift Down: **`Z`** (US layout) or **`Y`** (German layout).
  - Shift Up: **`X`**.
- **Interface**:
  - **Layout**: Switch between US and German keyboard layouts.
  - **Variance**: Controls the random pitch deviation.
  - **Waveform**: Selects the oscillator shape.
  - **Filter Cutoff**: Adjusts the brightness of the sound.
  - **Octave**: Buttons to visually shift the octave.
  - **Drift Direction**: Probability of the pitch gliding Up vs. Down.
  - **Mean Drift Speed**: Average speed of pitch change (cents/s).
  - **Drift Spread**: Random variation in drift speed.

## Usage

### Local Use

To play the synthesizer locally:

1. Download or clone this repository.
2. Open **`index.html`** in any modern web browser.

### Live Demo

The synthesizer can be accessed at the repository's associated GitHub Pages URL (https://chris-lep.github.io/uncertain-keys/).

## Project Structure

- `index.html`: Main application entry point.
- `css/`: Styling (`style.css`).
- `js/`: Application logic (`app.js`).

## Development

While the project runs as a static site (no build step required), it includes a test suite to ensure the mathematical logic and audio synthesis behaviors are correct.

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

The tests use **JSDOM** to simulate the browser environment, allowing verification of the application logic without needing a browser window.

## Author

Christopher Lepenik

## Attribution & Citation

If you use the Uncertain Keys Synthesizer in a musical recording, performance, research, or other academic or artistic work, please credit the instrument and its creator.

Suggested attribution:
> Instrument: Uncertain Keys Synthesizer by Christopher Lepenik (GitHub - chris-lep/uncertain-keys: A probabilistically tuned virtual synthesizer)

## License

Copyright (c) 2026 Christopher Lepenik.

This project is licensed under the GNU General Public License v3.0 only (GPL-3.0-only). You may redistribute and/or modify it under the terms of the GPL v3. This software is provided without warranty; see `LICENSE` for the full text and details.
