# IRISH BUILT driver sim

**Play it:** https://vihaandas.github.io/irish-sim/

A browser driver-practice simulator for IRISH 2026 BUILT. You drive the team's Rev F robot, built from the Onshape CAD, through a full match reconstructed from the IRISH game manual.

## What's in it

- **Modes:** full match (2:40), free practice (SHIFTS loop), a 60 s shooting drill (refills to 10 when empty) and a 90 s intake drill (40 FUEL scattered). Drills keep your best score in that browser.
- **Practice tools:** R (L3) puts the robot back on the STARTING LINE. G (R3) loads 10 FUEL in free practice. M hides the minimap.
- **Smooth motion:** physics runs at 120 Hz and the picture is drawn between physics steps, so motion stays smooth at any frame rate. Controller sticks are eased like the keys.
- **Smooth intake (default):** the spinning pickup roller pulls FUEL that is up to 0.5 m in front of it toward the middle of the module, so you can sweep at any speed. The Robot settings still have the strict team-sim model, which needs about 3 ft/s.
- **Shooting:**
  - Shot trails follow your shots.
  - A dashed aim arc shows where a shot would land right now, using the same physics as the FUEL. It turns green when the shot goes in.
- **Sound (synthesized, no files):**
  - Drive-motor whine that follows speed and effort, drum whine that follows rpm, and intake roller hum.
  - FUEL thuds by impact speed and distance, the shot thump, pickup pops and score chimes.
  - Crowd ambience that swells when you score, FRC-style start and end horns, shift horns, countdown ticks, a foul buzzer, collision clanks, the intake deploy whir and a jam clunk.
  - Volume and mute are in Display & sound, plus a Sound button in the HUD.
- **HUD:**
  - A match timeline under the scoreboard. Swapped SHIFTS are striped, and a marker shows the current time.
  - Tips during the countdown, a fullscreen button and an optional frame-rate counter.
  - The game pauses itself if the window loses focus.

## Run it

- Open `index.html` in Chrome or Edge. It needs internet the first time for Three.js (jsDelivr) and the fonts.
- If the browser blocks local files, run `node tools/serve.js` and open http://127.0.0.1:8771/.
- A gamepad (Xbox layout) works in the local copy. Embedded pages can block the gamepad API, so practice with a controller from the local copy.

## Controls

The start screen has a **Play with: Keyboard / Controller** switch. Plugging in a controller and pressing any button switches to it automatically. The in-game "Input" button switches back and forth. Hints and button pictures follow the chosen device.

**Driver assists (on by default)** do what a real robot's code could do with the HUB AprilTags and odometry:
- **Shoot:** holding shoot turns the robot to the HUB, sets the drum from the shot table, and feeds only when it's aimed, nearly stopped and inside your ALLIANCE ZONE.
- **Intake:** it stows itself 0.45 s after you let go (so it doesn't jam on the BUMP) and stops at 10 FUEL.
- **Drum:** it pre-spins while you carry FUEL in your zone.

Turn the assists off for realistic practice.

**Camera:** it follows the robot from behind by default. The mouse wheel zooms, dragging looks around, and double-click resets. C or View cycles Follow, Driver station and Overhead.

| Action | Keyboard | Controller |
|---|---|---|
| Drive | W/S forward/back, A/D turn (or arrows) | Left stick drive, right stick turn (one-stick and tank in settings) |
| Shoot (aims for you) | Space (hold) | RT (hold) |
| Intake | E (press to lower, press again to raise) | LT (same) |
| Outtake | Q (hold) | B (hold) |
| Slow mode | Shift (hold) | LB (hold) |
| Camera | C | View |
| Pause | Esc | Menu |
| Stow / pre-spin (assists off) | X / F | Y / RB |

**Remapping:** under Settings > Controls you can rebind any key, button or stick. "Show robot-code bindings" prints a WPILib `CommandXboxController` `configureBindings()` for the layout, including a note describing the assists. The team has no robot code yet, so write it to match.

## Game, from the manual

- Field 651.2 x 317.7 in. One HUB on the CENTER LINE: 47 x 47 in, rim 72 in, 41.7 in hex opening, with a divider on the CENTER LINE.
- BUMP: 135 x 44.4 x 6.513 in, 15 deg ramps, on the driver's left from the BLUE wall.
- TRENCH: 22.25 in clear under the arm, 110.75 in between the posts, on the other side of the HUB.
- DEPOTS: 48 x 30 in with 48 FUEL each. There is no NEUTRAL ZONE FUEL. A HUB returns scored FUEL to the field.
- Timing (tables 6-2 and 6-3):
  - 0:20 AUTO, then a 3 s pause.
  - 2:20 TELEOP: TRANSITION SHIFT, SHIFT 1-4, END GAME.
  - ALLIANCE ZONES and HUB sides swap with each SHIFT. FUEL counts for whichever alliance that side of the HUB belongs to at the time.
- Points (table 6-4):
  - FUEL: 4 in AUTO, 2 in TELEOP.
  - LEAVE 3, PARK 2.
  - MINOR foul 2, MAJOR foul 6.
  - Ranking points: AUTO BONUS, FUEL BONUS (threshold selectable, estimated 60-100), CONNECTION, win 3 / tie 1.
- Fouls the sim calls:
  - G403: crossing the CENTER LINE or opponent contact in AUTO.
  - G407: launching FUEL from outside your ALLIANCE ZONE.
  - G408: more than 10 FUEL, plus one more each 3 s.
  - G420: contacting a protected robot at its HUB wall. The robot that drove in is charged (G210).

## The robot, from the CAD and analysis files

- **Mesh:** Onshape "Robot Rev E - deployed" and "stowed (start configuration)", both Rev F with the wood intake and wood shooter (exported 2026-11-23, 989 parts).
  - 940 parts, decimated from 3.19 M to 0.2 M triangles.
  - The 165 parts that move between the two poses are fitted as one rigid rotation of 132.5 deg about the intake pivot (Y 31.0, Z 8.8).
  - The pool-noodle bumpers are recoloured for the alliance. Their outline is the collision box.
  - The REF FUEL in the CAD hopper are the slots where carried FUEL are drawn.
- **Drive:**
  - 4 CIM, Toughbox Mini, 6 in HiGrip. The CAD gearbox is 14T:50T then 16T:48T = **10.71:1** (earlier notes said 8.45:1). That is 13.0 ft/s free speed.
  - 40 A current limit per CIM, a 0.15 s open-loop ramp and battery sag (12.5 V minus 0.018 ohm times current).
  - **Calibrated** (tools/drive_test.js) to AndyMark's published 10.0 ft/s loaded speed for this setup. The effective turning track width is about 1.6x the physical one, as WPILib describes for high-grip wheels.

    | Test | Before calibration | Now |
    |---|---|---|
    | Top speed | 16.3 ft/s | 10.2 ft/s |
    | 0 to 90% speed | 0.99 s | 0.80 s |
    | 10 ft / 20 ft sprint | 1.10 s / 1.73 s | 1.37 s / 2.36 s |
    | Spin in place, full stick | 627 deg/s | 356 deg/s |
    | Spin in place, 65% stick (default) | 342 deg/s | 205 deg/s |
    | 180 deg turn at 65% stick | 1.17 s | 1.36 s |
    | Turn radius at full speed, half turn stick | 34 ft | 5.7 ft |
    | Stop from top speed | 7.6 ft | 2.7 ft |

  - Wheel scrub acts like a tire: it is strongest turning in place and fades as the robot rolls forward, so steering at speed responds.
  - 131.9 lb on the field: 103.8 lb CAD, plus wire, battery and bumpers.
  - Tank drive: wheels resist sideways pushing, and turning has drop-center scrub.
- **Height:** 21.5 in, so it fits under the TRENCH. A deployed intake jams against the BUMP ramp, so stow it before crossing.
- **Intake:**
  - Deploys in 0.35 s.
  - FUEL takes 1.65 s to reach the hopper (analysis/sim_f.js).
  - The team sim tested 3-12 ft/s approach. Slower than about 2.5 ft/s, the roller mostly pushes FUEL instead of taking it. An "easy" intake option removes this.
- **FUEL through the robot:** each FUEL is drawn on the path from the team's own intake sim (analysis/sim_f.js, Rev F deployed pose, 9 ft/s, rollers at 55%).
  - It is pinched under the pickup roller, carried over the module, lobbed about 17 in high and lands on the ramp after 0.48 s.
  - It rests on one of 14 spots on the ramp, calibrated to the CAD's reference FUEL, and rolls down whenever the spot below is free.
  - It enters a shooter lane (the CAD "FUEL queued in shooter" positions), then wraps 108° round the drum and leaves the hood on the 72° line (0.1 s inside the shooter).
  - The pickup, kicker and transfer roller shafts are split out of the CAD mesh and spin in the right direction while intaking.
  - Outtake only reaches FUEL still in the module, because the ramp slopes away from the intake on the real robot.
  - With assists on, the intake waits until the module is clear before stowing.
- **Hopper:** passive ramp, one FUEL every 0.62 s to the two shooter lanes (analysis/sim_hopper.js: 10 in 6.17 s). It preloads 3 FUEL with the arm folded. A "powered floor" option shows the proposed upgrade.
- **Shooter:**
  - Fixed 72 deg hood. FUEL leaves at lane X +-3.19, Y 4.47, Z 16.22 in.
  - Drum: 4 in Colson, exit-speed ratio 0.55, 31.4 lb-in^2 on a NEO at 60 A. It spins up from rest in about 2.5 s.
  - Feeds at 7 FUEL/s, losing 1.6% drum speed per shot.
  - Target rpm comes from the shot table in analysis/shot_drop.js: 2,085 rpm at the HUB wall to 3,438 rpm at 10 ft. Past 10 ft it is extended with the same ballistic model.
  - In flight, FUEL has drag (Cd 0.50) and backspin lift (CL 0.15), as in shooter/analysis/traj.js.

## Assumptions to check

- The manual gives the ALLIANCE ZONE as 158.6 in deep, but figure 3-4 draws it from the ALLIANCE WALL to the CENTER LINE. The sim follows the figure.
- How FUEL comes back out of the HUB is not specified. The sim drops each one out of a random alliance face 1.1-2.3 s after it scores.
- The TRENCH post and foot footprint comes from the 141.35 in width minus the 110.75 in clearance.
- The divider top (80.3 in) is scaled from figure 3-6.
- `shot_drop.js` counts a shot as scoring only when it hits the divider above the rim. In the sim, a FUEL that drops straight through the opening also scores, so the shot table is more forgiving here than its 1-4% windows suggest.
- The AI robots are generic kitbot-style robots, not other teams' designs. "Normal" AI scores about 35-55 FUEL per robot in a match.

## Files

- `src/page.html` is the page body. `tools/build_page.js` writes `index.html` (stand-alone) and `page.html` (the published Artifact).
- Graphics: ACES tone mapping, a reflection environment, PBR materials picked from the Onshape part colours, an arena with stands and live scoreboard screens, HUB light strips that show which alliance owns each side, score bursts and a guide arrow after zone swaps. Settings > Graphics has High / Medium / Fast.
- `js/audio.js`: sound engine.
- `js/core.js`: field and colliders. `js/robot.js`: robot specs and drive. `js/fuel.js`: FUEL physics. `js/game.js`: rules, autos and AI. `js/controls.js`: remappable bindings and the WPILib snippet. `js/main.js`: graphics, input and HUD.
- `tools/build_mesh.js` turns the two Onshape glTF exports in `raw/` into `robot_mesh.js`. Re-export after a CAD change: GET `/api/v6/partstudios/d/{did}/w/{wid}/e/{eid}/gltf` from the signed-in Onshape tab, then run `node tools/build_mesh.js`.
- `raw/*.gltf` are the 117 MB exports. They can be deleted once `robot_mesh.js` is built.
- `tools/headless_test.js` checks top speed, spin-up, shots at 0-16 ft and two full AI matches without graphics. `tools/trace_auto.js <auto>` prints an AUTO step by step.
