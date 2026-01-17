# Uncertain Keys Synthesizer

A virtual synthesizer that explores pitch uncertainty. Instead of playing a fixed frequency for every note, this synthesizer samples a pitch from a Gaussian distribution centered around the target frequency.

## Key Features

- **Uncertain Pitch**: Each key press generates a slightly different pitch based on a Gaussian probability distribution.
- **Logarithmic Distribution**: The pitch variation is calculated in cents (logarithmic space) to ensure consistent perceived variation across the frequency spectrum.
- **Tunable Variance**: You can adjust the standard deviation (in cents) to control how "out of tune" or unstable the synthesizer sounds.
- **Octave Control**: Shift the entire keyboard range up or down by arbitrary octaves to explore different registers.
- **Web Audio API**: Runs entirely in the browser using the Web Audio API.
- **Keyboard Support**: Play using your computer keyboard (supports both US and German layouts) or by clicking the on-screen keys.

## Controls

- **Musical Keys**: Use the home row (`A`, `S`, `D`, `F`, `G`, `H`, `J`, `K`, `L`, `;`) and the row above (`W`, `E`, `T`, `Y`, `U`, `O`, `P`) to play notes.
- **Octave Shifting**:
  - Press **`Z`** to shift the octave **down**.
  - Press **`X`** to shift the octave **up**.
- **Interface**:
  - **Variance**: Controls the random pitch deviation.
  - **Waveform**: Selects the oscillator shape.
  - **Filter Cutoff**: Adjusts the brightness of the sound.
  - **Octave**: Buttons to visually shift the octave.

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
- `experimental/`: Advanced versions currently under development (work in progress).
