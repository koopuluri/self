# Personhood / lotus study

A browser-native motion sketch: an infinitely blossoming lotus behind a steady, gender-neutral human outline. Three.js renders curved petals in real time. The frame is 4:3, with the established warm paper color #F4EDD5. This supersedes the Blender workflow for the current concept; earlier Blender assets remain in Ghost.

Run `npm start`, then open http://127.0.0.1:4173. The server binds only to this Mac and refreshes the browser after source edits. No build, CDN or network service is needed at runtime. `PORT=4174 npm start` selects another port if needed. Keep the server running while viewing.

Use the timeline to pause and scrub. Space plays/pauses; H hides the controls. Adjust bloom, zoom, curl, grain and outline live. Layer toggles isolate the figure or lotus. Settings are saved in this browser. Reset restores the default five-second study; Copy study link includes settings in the local URL. Save frame downloads a PNG with the outline included.

`app.js` constructs one instanced mesh containing repeated flowers. `shaders.js` bends each petal and shades the paper and pigment. Each flower's scale and opening depend on `index + phase`, so the next flower occupies exactly the preceding flower's state at the loop handoff. There is no reverse-bloom or whole-scene crossfade. `math.test.mjs` checks that relationship across the controls' supported ranges.

Three.js is pinned and vendored from its official npm package, with its MIT license in `vendor/`. User material and screenshots are not served by this app.

> π: This is an editable motion study for the user's “blossoming of human potential” concept: a stationary, transparent human outline over a recursive lotus. The drawing treatment stays quiet and neutral so bloom timing and the feeling of continuous inward travel can be judged first.
