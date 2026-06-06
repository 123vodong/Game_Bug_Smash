BUG SMASH: Deadline Hunter
==========================
A hyper-casual bug-smashing game built in Phaser 3.

----------------------------------------------------------------
HOW TO RUN
----------------------------------------------------------------
You cannot double-click index.html — the game uses ES modules,
which browsers refuse to load from file://. You need to start a
tiny local web server (one line, no install required).

1. Unzip this folder anywhere on your PC.

2. Open a terminal (PowerShell, cmd, or Terminal) inside the
   unzipped folder.

3. Run ONE of the following:

     Python (works on almost every PC):
         python -m http.server 8000

     Node.js:
         npx serve .

     VS Code:
         Install the "Live Server" extension,
         right-click index.html → "Open with Live Server".

4. Open this URL in your browser:
         http://localhost:8000

----------------------------------------------------------------
CONTROLS
----------------------------------------------------------------
  Mouse / touch  - move the developer
  Click (or hold) - smash bugs you overlap
  H              - help / skills guide
  P              - pause
  M              - toggle mute
  ESC            - back to menu
  R              - restart (after win / lose)

----------------------------------------------------------------
GOAL
----------------------------------------------------------------
Clear every bug before the deadline runs out. Pick up AI skill
pickups for buffs, debuffs, and chaos. Build combos for big
score multipliers. 12 levels across 4 worlds.

----------------------------------------------------------------
TROUBLESHOOTING
----------------------------------------------------------------
- "python is not recognized": install Python from python.org,
  or use the Node.js / VS Code option instead.

- Blank page in browser: make sure you opened
  http://localhost:8000 (not the file path) AND the server
  terminal is still running.

- No sound: click anywhere first — browsers require a user
  interaction before WebAudio plays.

Have fun shipping that ticket.
