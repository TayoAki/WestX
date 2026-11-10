import type { KitId } from "../sim/kits";

// Everything the interface says about a class: its name, what its buttons do,
// and what to call its big moments. The rules live in src/sim; this is only words.

export interface ClassText {
  title: string;
  /** One line for the character select. */
  pitch: string;
  /** What its meter is called. */
  meter: string;
  awakening: string;
  ultimate: string;
  /** Labels for the touch pad, where the class renames a button. */
  touch: { guard: string; dash: string; steady: string; special: string };
  /** The move list, as list items. */
  moves: string;
  /** Short notes under the move list. */
  notes: string;
  /** The one-line reminder shown during a fight. */
  legend: string;
}

const key = (k: string, text: string): string => `<span><kbd>${k}</kbd>${text}</span>`;

export const CLASSES: Record<KitId, ClassText> = {
  hunter: {
    title: "Lawman",
    pitch: "The balance. Hard to move, strong at every range.",
    meter: "Nerve",
    awakening: "Reckoning",
    ultimate: "Last Word",
    touch: { guard: "Brace", dash: "Charge", steady: "Steady", special: "Lariat" },
    moves: `
      <li><kbd>J</kbd> Strike. A pistol-whip, a backhand with the brace, then the brace's blast</li>
      <li><kbd>Shift</kbd> Raise the brace. Walk behind it; bullets ring off. Tap it while being hit to catch the blow</li>
      <li><kbd>Shift + J</kbd> Thunderclap: slow, and it goes straight through a guard</li>
      <li><kbd>K</kbd> Shot. Hold it to fan the hammer</li>
      <li><kbd>Q</kbd> Hold steady: builds Nerve and reloads. Press K from it for a quickdraw</li>
      <li><kbd>L</kbd> Shoulder charge. Two, and they come back slowly</li>
      <li><kbd>E</kbd> Lariat: rope them in. Hold S to zip to them</li>`,
    notes: `
      <p class="fine"><b>You are the balance.</b> No tricks to set up: you hit hard up close, shoot straight at range, and the brace on your left arm is both shield and cannon. Its blast spends Nerve.</p>
      <p class="fine"><b>Time the brace.</b> Raise it just as a shot lands and it goes back at the shooter. It cannot stop the ground: step out of circles and gas.</p>`,
    legend:
      key("J", "strike") + key("Shift", "brace: walk, deflect, catch") + key("Shift+J", "thunderclap") + key("K", "shot, hold to fan") +
      key("Q", "steady, then K to quickdraw") + key("L", "charge") + key("E", "lariat"),
  },
  witch: {
    title: "Witch",
    pitch: "Owns the ground. Her attacks are areas, not aims.",
    meter: "Hex",
    awakening: "Witching Hour",
    ultimate: "The Long Night",
    touch: { guard: "Guard", dash: "Blink", steady: "Chant", special: "Knot" },
    moves: `
      <li><kbd>J</kbd> Hex pulse. Hits everything around you: two pulses, then a nova</li>
      <li><kbd>K</kbd> Hex bolt. It bends toward its target</li>
      <li><kbd>Hold K</kbd> Draw a circle under them. It goes off after a moment, then lingers</li>
      <li><kbd>Q</kbd> Chant: builds Hex. Press K from it to call a storm down on them</li>
      <li><kbd>E</kbd> Hangman's knot: rope them and hang them in the air</li>
      <li><kbd>L</kbd> Blink. Three, and they come back fast</li>
      <li><kbd>Shift</kbd> Guard. Tap it while being hit to vanish behind them</li>`,
    notes: `
      <p class="fine"><b>You own the ground.</b> A circle shows where it will land before it does, and once it is burning it cannot be blocked. A hexed rival takes more from everything.</p>
      <p class="fine"><b>You are fragile.</b> Least health of the three, and you float when you fall. Keep your distance and make them come through your circles.</p>`,
    legend:
      key("J", "pulse") + key("K", "bolt") + key("hold K", "circle") + key("Q", "chant, then K for a storm") + key("E", "knot") +
      key("L", "blink") + key("Shift", "guard / vanish"),
  },
  engineer: {
    title: "Engineer",
    pitch: "Owns conditions. Poison wears them down; shock stops them.",
    meter: "Pressure",
    awakening: "Overpressure",
    ultimate: "Redline",
    touch: { guard: "Guard", dash: "Jet", steady: "Charge", special: "Gas" },
    moves: `
      <li><kbd>J</kbd> Strike. Wrench, gauntlet, then the prod, which shocks</li>
      <li><kbd>K</kbd> Rivet gun. Six rivets, and every one poisons. Hold it to empty the gun</li>
      <li><kbd>Q</kbd> Build pressure: fills the meter and reloads. Press K from it for a tesla bolt that shocks</li>
      <li><kbd>E</kbd> Gas canister: poisons the ground under them</li>
      <li><kbd>L</kbd> Jet dash. Two, and they come back slowly</li>
      <li><kbd>Shift</kbd> Guard. Tap it while being hit and your plating shocks them</li>`,
    notes: `
      <p class="fine"><b>Poison</b> eats health for five seconds. <b>Shock</b> stops a rival where they stand, slows them, and holds their dashes.</p>
      <p class="fine"><b>Overload.</b> Put two different conditions on one rival and they burn off together in one burst. You carry both: poison first, then shock.</p>`,
    legend:
      key("J", "strike, ends in shock") + key("K", "rivets: poison") + key("Q", "pressure, then K for tesla") + key("E", "gas") +
      key("L", "jet") + key("Shift", "guard / shock plating"),
  },
  outlaw: {
    title: "Outlaw",
    pitch: "Quick, slippery and light.",
    meter: "Nerve",
    awakening: "Reckoning",
    ultimate: "Last Word",
    touch: { guard: "Guard", dash: "Dash", steady: "Steady", special: "Lariat" },
    moves: "",
    notes: "",
    legend: "",
  },
};

/** The classes a person can pick. The outlaw is a rival only. */
export const PLAYABLE: KitId[] = ["hunter", "witch", "engineer"];
