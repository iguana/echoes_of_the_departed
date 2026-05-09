// Mirror-world definitions. Each entry corresponds to a ghost id and
// describes the scene the player enters when that ghost calls
// `pull_through_mirror`. Per-session variation is via `variants` —
// initialState() rolls one variant per world; objects substitute it via
// the {{VARIANT}} placeholder in their essence.

export interface MirrorWorldObject {
  id: string;
  name: string;             // shown on the [E] label when nearby
  /** Tile coords of the object center (for placement only — visuals come from sprite) */
  tile: { x: number; y: number };
  /** Display size in pixels. */
  size: { w: number; h: number };
  /** Sprite key (image is loaded from /mirror_worlds/<world_id>/<sprite>) */
  sprite: string;
  /** Essence guidance handed to Gemma when the medium inspects this object.
   *  {{VARIANT}} is replaced with the world's chosen-this-session variant. */
  essence: string;
  /** True if inspecting this object should record a discovery surfaced back
   *  to the ghost in subsequent communings. */
  yields_discovery?: boolean;
}

export interface MirrorWorld {
  id: string;                // matches scene/asset directory name
  title: string;             // shown when entering
  ghost_id: string;
  /** Backdrop image path (relative to /). */
  backdrop: string;
  /** World size in tiles. */
  size: { w: number; h: number };
  /** Player spawn tile. */
  spawn: { x: number; y: number };
  /** Camera background color (visible at edges if backdrop doesn't cover). */
  bg_color: number;
  objects: MirrorWorldObject[];
  /** Per-session variants. One key is rolled at game start (stored in
   *  state.tile_states[ghost_id]); the value is substituted into objects'
   *  essence text wherever {{VARIANT}} appears. */
  variants?: Record<string, string>;
}

/** Per-session variant key, e.g. "intact"/"burned"/"copied" for the Scriptorium,
 *  "rusty_came_back"/"rusty_was_safe"/"rusty_came_back_late" for Cedar Creek. */
export type TileState = string;

export const SCRIPTORIUM: MirrorWorld = {
  id: "scriptorium",
  ghost_id: "brother_edmund",
  title: "The Scriptorium of Rievaulx",
  backdrop: "/mirror_worlds/scriptorium/floor.jpg",
  size: { w: 18, h: 14 },
  spawn: { x: 9, y: 11 },
  bg_color: 0x18130a,
  variants: {
    intact: "The bundle is intact — the codex inside, vellum pages still bright, ink unfaded. He never destroyed it. He never sent it forth. He kept it here, alive but locked away.",
    burned: "The bundle is mostly ash — Edmund DID burn it, sometime after his fortieth year, when fear finally won. Only the leather cover survived, and a single charred page in his careful hand.",
    copied: "The bundle is empty. The codex is gone. He gave it to Brother Anselm in the hour before the fever took him, and Anselm carried it out into the world. Somewhere it lives still, in a hand that is not his.",
  },
  objects: [
    {
      id: "desk",
      name: "Edmund's writing desk",
      tile: { x: 5, y: 5 },
      size: { w: 110, h: 110 },
      sprite: "desk.png",
      essence: "A small slanted oak desk. A half-finished illuminated psalter page lies open. The inkwell holds dark iron-gall ink, the quill is fresh-cut. The work is in Edmund's careful hand — the work he was paid to do. Beneath the desk's slope, his secret labor is hidden — the unfinished English translation of Origen's De Principiis. Forty years of penance and seven of sin lived at this desk together.",
    },
    {
      id: "bookshelf",
      name: "the abbey bookshelf",
      tile: { x: 14, y: 5 },
      size: { w: 130, h: 130 },
      sprite: "bookshelf.png",
      essence: "Three shelves of leather-bound codices: psalters, gospels, the Rule of Saint Benedict, the works of Bernard of Clairvaux. All sanctioned. None of them is the codex Edmund hid — that one was always too dangerous to keep above the floor.",
    },
    {
      id: "window",
      name: "the lancet window",
      tile: { x: 9, y: 2 },
      size: { w: 130, h: 200 },
      sprite: "window.png",
      essence: "The narrow lancet window onto the abbey courtyard. Through the leaded diamonds, the Yorkshire dusk is purple and damp. Edmund stood at this window the night he first decided to copy the heretical text. He did not move for an hour.",
    },
    {
      id: "loose_tile",
      name: "the loose floor tile",
      tile: { x: 9, y: 8 },
      size: { w: 90, h: 90 },
      sprite: "loose_tile.png",
      essence: "A single flagstone, lifted at one corner. Beneath it, a small leather-wrapped bundle. {{VARIANT}} The truth is here, plain to see — Edmund's lie to himself, or his triumph, or the answer in between.",
      yields_discovery: true,
    },
  ],
};

export const CEDAR_CREEK: MirrorWorld = {
  id: "cedar_creek",
  ghost_id: "tommy_whitford",
  title: "Cedar Creek, the Morning of It",
  backdrop: "/mirror_worlds/cedar_creek/floor.jpg",
  size: { w: 18, h: 14 },
  spawn: { x: 9, y: 11 },
  bg_color: 0x191512,
  variants: {
    rusty_came_back: "The collar is half-buried. There is no blood on it, only mud and rain. Rusty slipped out of the collar somewhere across the creek, ran the long way home around, and was waiting on the porch by suppertime. Mama dried him by the stove and cried into his fur, and he howled at the door for two days for a boy who did not come.",
    rusty_was_safe: "The collar is here, snapped at the buckle. Rusty was hiding under the porch the whole time — he had come back hours before Tommy went looking. Mama only found him three days later, ribs showing through his coat, when she swept the leaves out from beneath the steps.",
    rusty_came_back_late: "The collar is here, faded. Rusty turned up two days after Tommy's funeral — muddy, hungry, and alive. He kept watch on the empty bed for the rest of his fourteen years. Mama said you could hear him whining at the storm door whenever it rained.",
  },
  objects: [
    {
      id: "creek",
      name: "Cedar Creek",
      tile: { x: 9, y: 4 },
      size: { w: 200, h: 140 },
      sprite: "creek.png",
      essence: "The creek is brown and high, foaming over rocks that should be ankle-deep. Tommy stood here. He nearly turned back. He thought he saw red on the far bank — Rusty's coat, he thought — and he stepped forward, and the bank gave way, and the cold took him faster than he understood.",
    },
    {
      id: "jacket",
      name: "his daddy's jacket on the fence",
      tile: { x: 4, y: 9 },
      size: { w: 110, h: 150 },
      sprite: "jacket.png",
      essence: "Tommy's daddy's old work jacket, draped over the fence rail before he ducked under to follow Rusty. Far too big for an eight-year-old. The shoulders are dark with rain. Mama would find it three days after she'd already known, and she would carry it home pressed against her face the whole walk.",
    },
    {
      id: "lunchbox",
      name: "his lunchbox on the porch",
      tile: { x: 14, y: 10 },
      size: { w: 90, h: 90 },
      sprite: "lunchbox.png",
      essence: "A small dented red lunchbox sits on the porch step where Tommy left it before he saw Rusty wasn't in the yard. Inside, a wax-paper-wrapped biscuit Mama made for his school lunch. He never came back for it. Mama would not open the lid for a year.",
    },
    {
      id: "collar",
      name: "Rusty's collar",
      tile: { x: 14, y: 4 },
      size: { w: 90, h: 90 },
      sprite: "collar.png",
      essence: "The leather collar Rusty wore. The brass tag still catches what little light reaches the bank. {{VARIANT}}",
      yields_discovery: true,
    },
  ],
};

export function tileStateLine(world: MirrorWorld, key: TileState): string {
  return world.variants?.[key] ?? "";
}

export const MIRROR_WORLDS: Record<string, MirrorWorld> = {
  brother_edmund: SCRIPTORIUM,
  tommy_whitford: CEDAR_CREEK,
};

export function mirrorWorldFor(ghost_id: string): MirrorWorld | null {
  return MIRROR_WORLDS[ghost_id] ?? null;
}

/** All worlds; used by initialState to pre-roll a variant per world. */
export function allWorlds(): MirrorWorld[] {
  return Object.values(MIRROR_WORLDS);
}
