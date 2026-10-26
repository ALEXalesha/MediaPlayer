# Changelog

What changed for the user in each release. The full text of each release, in English and
Russian, is on the [releases page](https://github.com/ALEXalesha/MediaPlayer/releases).

## 1.0.4 - 2026-10-16

MediaPlayer 1.0.4 - pauses when you leave its tab in the Hub.

- In a tab of the Hub (the app and the browser page) and in a window of the system demos the player now pauses when you leave its tab and plays on from the same place when you come back. Before, a background tab only went quiet while the song kept going. If you paused it yourself, coming back does not start it.
- Hiding the whole Hub (another browser tab, a minimized window) does not stop the music. On its own (a browser tab or the MediaPlayer program) the player keeps playing in the background, as before.

## 1.0.3 - 2026-10-16

MediaPlayer 1.0.3 - fixes from an independent review.

- Arrow keys on a focused slider now move that slider. Before, after a click on the volume slider the arrows seeked the song by 5 s, and on an equalizer band the up and down arrows changed the overall volume. The seek bar keeps the 5 s jumps, Space still plays and pauses.
- The keyboard focus frame of a playlist row is drawn inside the row. Before, the edge of the scrolling list cut it off on the left (and at the top for the first row).
- The "Open files" button has a tooltip when its label is hidden (narrow window, mini mode).
- The playlist scrollbar test no longer fails now and then under load: the overlay scrollbar shows for about 0.85 s after scrolling and stays only if the mouse enters it while it is shown; the test now moves the mouse in after the scroll.

## 1.0.2 - 2026-10-11

MediaPlayer 1.0.2 - a fix.

- Hovering a button no longer makes a light band across a panel. The glass panels no longer use backdrop-filter: with the graphics card Chromium recomputed the blur only in a band of the panel around the button and caught the panel itself (the same fix as in WritingSpeed 1.1.1). The panels look the same.

## 1.0.1 - 2026-10-11

MediaPlayer 1.0.1 - a fix.

- The playlist scroll bar no longer covers the play button of each row. Scroll bars drawn over the content (Chrome on Windows 11, macOS) covered it by 7 px; the list now keeps a gap for such a bar.

## 1.0.0 - 2026-10-11

MediaPlayer 1.0.0 - an offline music and video player, in the browser and as a Windows app.

- Its own album: 12 songs of different styles written by a song generator and played through Web Audio - no audio files inside.
- Your files: mp3, ogg, opus, wav, flac, m4a, aac, mp4, webm - by the button or drag and drop; video plays in place of the visualizer.
- Playlist with drag-and-drop order, shuffle, repeat all/one, speed 0.5-2x.
- 10-band equalizer with presets and a preamp that keeps a boost from clipping.
- Spectrum, wave and circle visualizers; mini mode.
- Media keys and the system player panel work (Media Session).
- Volume, equalizer, speed, the song and the position are remembered.
- Five themes, Russian or English interface.
- The window opens where you left it; the version is in the title.
- Setup for one user without admin rights, or a portable exe. Nothing is sent anywhere.
