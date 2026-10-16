# MediaPlayer

**English** · [Русский](README.ru.md)

**MediaPlayer** («Медиаплеер») is a music and video player in a single HTML page. It comes with its own album of 12 songs that are not files at all: a small song generator writes each score (melody, chords, bass, drums) and the browser plays it through Web Audio. It works with no server and no internet: open `index.html`, use it online, or install the Windows app.

**[▶ Try it online](https://alexalesha.github.io/MediaPlayer/)** · **[⬇ Windows app (setup and portable)](https://github.com/ALEXalesha/MediaPlayer/releases/latest)**

The interface is in Russian and English (the RU/EN button in the header).

![The player with its own album](docs/screens/player.png)

![Light theme, English interface, bass boost](docs/screens/light-en.png)

## What it can do

- **Own album:** 12 songs of different styles (ambient, chiptune, lo-fi, classical-like, electronic, rock, folk, jazz), 2.5-4 minutes each, each with a title in two languages and a drawn cover. The same song always sounds the same: the generator is seeded by the song id.
- **Your files:** the "Open files" button or drag and drop - mp3, ogg, opus, wav, flac, m4a, aac, mp4, webm. Files never leave the computer. A video plays in place of the visualizer. A broken file gets an error mark in its row and the player goes on.
- **Playlist:** click a row to play it, drag rows or press Alt+arrows to reorder (the order is remembered), shuffle (every track once before any repeats), repeat all / one / off, speed 0.5-2×.
- **Equalizer:** 10 bands (31 Hz - 16 kHz), ±12 dB, presets; a preamp lowers the level so a boost never clips.
- **Visualizer:** spectrum, wave or circle; a mini mode with only the essentials.
- **System media keys:** title, artist, album and cover go to Media Session, so the keyboard media keys and the system player panel control it.
- **Memory:** volume, equalizer, speed, view, repeat, the current song and the position (also in your own files) survive a reload (`localStorage`, keys `mplayer:*`); the page keeps working if the storage is blocked.
- **Look:** five themes (Glass, Formal, Light, Night, Warm - the same as in Paint Pro); works on a phone.

![Night theme, wave](docs/screens/night-wave.png)

### Keys

| Key | Action |
|---|---|
| Space | play / pause |
| ← / → | 5 s back / forward (with Shift - 30 s) |
| ↑ / ↓ | volume |
| M | mute |
| N / P | next / previous |

## Run locally

- **Browser:** open `index.html` in Chrome, Edge or Firefox. Everything is in the file; nothing is downloaded.
- **Windows app:** take `MediaPlayer-<version>-Setup.exe` (installs for the current user) or `MediaPlayer-<version>-Portable.exe` (runs without installing) from [Releases](https://github.com/ALEXalesha/MediaPlayer/releases). The window remembers its size and place; the version is in the title.
- **From source:** `npm install`, then `npm start` (the app) or `npm run dist` (setup and portable in `electron/dist`).

The app in `electron/` loads the same `index.html` - there is no second copy of the page.

## Tests

```
npm install
npx playwright install chromium
npm test                       # page laws and the Electron app (hidden, silent window)
node tests/mutate.js           # mutation check: broken copies of the page must fail the laws
```

The page laws open `index.html` by its file address in headless Chromium with the sound off. The music is checked without speakers: every song is rendered by `OfflineAudioContext` and the samples are measured - not silent, no clipping, no gaps, the sound ends with the score. The score itself is checked too: notes in the key of the song, no 4-bar window repeated, no more than 3 equal notes in a row, a repeated part is never a copy. The playlist scroll bar is checked in two kinds of Chromium - a classic bar and an overlay bar drawn over the content (Chrome on Windows 11, macOS) - over 12 window sizes and five themes: it never covers a row button, the gap is at least 4 px. No element with buttons uses backdrop-filter in any theme (with the graphics card it made a light band across a panel when a button was hovered), and hovering a button changes only that button. Arrow keys on a focused volume slider or equalizer band move that slider, the keyboard focus frame of a playlist row is not cut by the list edge, and every icon button without a label has a tooltip (findings of the independent review in 1.0.3). The mutation check breaks 20 rules one by one (shuffle, preamp, band frequencies, repeat, speed, memory, the melody rules, the gap for an overlay scroll bar and more) in a copy in a temporary folder and never touches `index.html`. The pictures above were made headless by `tools/screenshots.js`.

## History

MediaPlayer was made in the [GameRoom](https://github.com/ALEXalesha/GameRoom) collection (folder `web/media-player`), where it is a program in the "Programs" section of the Hub. This repository carries it with its commit history.

## Licence

MIT, see [LICENSE](LICENSE). The songs are generated by the code of this page and are covered by the same licence.
