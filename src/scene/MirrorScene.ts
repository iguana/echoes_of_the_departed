// MirrorScene — the world the medium enters when a ghost calls
// `pull_through_mirror`. Top-down exploration of a remembered space tied to
// the ghost. Walk, approach an object, press E to inspect (Gemma describes
// it in the ghost's voice).

import Phaser from "phaser";
import type { MirrorWorld, MirrorWorldObject } from "./mirror_worlds";

export interface MirrorEvents {
  /** Player approached an object and pressed E. */
  onInspect: (obj: MirrorWorldObject) => void;
  /** Player pressed Esc to leave the mirror world. */
  onExit: () => void;
}

interface SceneInit {
  world: MirrorWorld;
  events: MirrorEvents;
}

const T = 32;
const PLAYER_SPEED = 175;

const KEYS = {
  backdrop: (worldId: string) => `mirror.${worldId}.backdrop`,
  object: (worldId: string, objId: string) => `mirror.${worldId}.${objId}`,
  player: "mirror.player", // reuses parlor player image
};

export class MirrorScene extends Phaser.Scene {
  /** The active world definition. Public so the host (GameShell) can read
   *  it after the scene starts to dispatch inspects, etc. */
  world!: MirrorWorld;
  /** Inspectable objects in the scene, exposed for the debug API. */
  objects: { def: MirrorWorldObject; sprite: Phaser.GameObjects.Image }[] = [];
  /** Player sprite, exposed for the debug API's walkTo. */
  player!: Phaser.Physics.Arcade.Sprite;
  private events_!: MirrorEvents;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private interactKey!: Phaser.Input.Keyboard.Key;
  private exitKey!: Phaser.Input.Keyboard.Key;
  private nearLabel!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private inputEnabled = true;

  constructor() { super({ key: "MirrorScene" }); }

  init(data: SceneInit): void {
    this.world = data.world;
    this.events_ = data.events;
    this.objects = [];
  }

  preload(): void {
    this.load.image(KEYS.backdrop(this.world.id), this.world.backdrop);
    for (const o of this.world.objects) {
      this.load.image(KEYS.object(this.world.id, o.id), `/mirror_worlds/${this.world.id}/${o.sprite}`);
    }
    // Reuse the medium player sprite.
    this.load.image(KEYS.player, "/sprites/medium.png");
    // Log failures so we can see them via the debug bus.
    this.load.on("loaderror", (file: Phaser.Loader.File) => {
      console.error("[MirrorScene loaderror]", file.key, file.src);
      void fetch("/debug-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "MirrorScene.loaderror", result: { key: file.key, src: file.src } }),
      });
    });
    this.load.on("filecomplete", (key: string) => {
      console.log("[MirrorScene filecomplete]", key);
    });
  }

  create(): void {
    this.cameras.main.setBackgroundColor(this.world.bg_color);
    const worldW = this.world.size.w * T;
    const worldH = this.world.size.h * T;

    // Backdrop scaled to fit world bounds
    const bg = this.add.image(worldW / 2, worldH / 2, KEYS.backdrop(this.world.id));
    bg.setDisplaySize(worldW, worldH).setDepth(0);

    // Subtle ambient flicker on the whole scene to feel candlelit
    this.tweens.add({
      targets: bg, alpha: { from: 0.92, to: 1 },
      duration: 1800, yoyo: true, repeat: -1, ease: "Sine.InOut",
    });

    // Place objects
    for (const o of this.world.objects) {
      const px = o.tile.x * T;
      const py = o.tile.y * T;
      const img = this.add.image(px, py, KEYS.object(this.world.id, o.id))
        .setOrigin(0.5)
        .setDepth(3);
      img.setDisplaySize(o.size.w, o.size.h);
      // subtle hover bob to draw the eye
      this.tweens.add({
        targets: img, y: py + 4,
        duration: 1600 + Math.random() * 400, yoyo: true, repeat: -1, ease: "Sine.InOut",
      });
      this.objects.push({ def: o, sprite: img });
    }

    // Player
    const sx = this.world.spawn.x * T;
    const sy = this.world.spawn.y * T;
    this.player = this.physics.add.sprite(sx, sy, KEYS.player);
    this.player.setCollideWorldBounds(true);
    this.player.setDisplaySize(96, 96);
    this.player.setBodySize(this.player.width * 0.3, this.player.height * 0.3);
    this.player.body!.setOffset(this.player.width * 0.35, this.player.height * 0.5);
    this.player.setDepth(10);

    // Player halo (matches the parlor look)
    const halo = this.add.graphics();
    halo.fillStyle(0xffc76e, 0.3);
    halo.fillCircle(0, 0, 50);
    halo.setDepth(9);
    halo.setBlendMode(Phaser.BlendModes.SCREEN);
    this.events.on("update", () => { halo.x = this.player.x; halo.y = this.player.y + 10; });

    // World + camera
    this.physics.world.setBounds(8, 8, worldW - 16, worldH - 16);
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    this.cameras.main.startFollow(this.player, true, 0.2, 0.2);

    // Inputs (clear captures so HTML inputs receive keys)
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey("W"),
      A: this.input.keyboard!.addKey("A"),
      S: this.input.keyboard!.addKey("S"),
      D: this.input.keyboard!.addKey("D"),
    };
    this.interactKey = this.input.keyboard!.addKey("E");
    this.exitKey = this.input.keyboard!.addKey("ESC");
    this.input.keyboard!.clearCaptures();

    // Title banner — appears on entry, fades out
    this.titleText = this.add.text(this.scale.width / 2, 30, this.world.title, {
      fontFamily: "ui-serif, Georgia, serif",
      fontSize: "20px",
      color: "#ffd24c",
      align: "center",
      fontStyle: "italic",
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1500).setShadow(2, 2, "#000000", 6);
    this.titleText.setAlpha(0);
    this.tweens.add({ targets: this.titleText, alpha: 1, duration: 900, ease: "Sine.Out" });
    this.tweens.add({ targets: this.titleText, alpha: 0, duration: 1500, delay: 4000 });

    // Hint at top right
    const exitHint = this.add.text(this.scale.width - 14, 14, "[Esc] step back through the mirror", {
      fontFamily: "ui-monospace, monospace",
      fontSize: "12px",
      color: "#a89c7c",
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(1500).setShadow(1, 1, "#000000", 3);
    this.tweens.add({ targets: exitHint, alpha: { from: 0, to: 1 }, duration: 800 });

    // [E] label
    this.nearLabel = this.add.text(0, 0, "", {
      fontFamily: "ui-monospace, monospace",
      fontSize: "13px",
      color: "#ffd24c",
      backgroundColor: "rgba(10,8,12,0.9)",
      padding: { left: 10, right: 10, top: 4, bottom: 4 },
    }).setDepth(2000).setScrollFactor(0).setVisible(false);

    // Vignette
    const v = this.add.graphics().setScrollFactor(0).setDepth(900);
    const sw = this.scale.width, sh = this.scale.height;
    for (let i = 0; i < 12; i++) {
      v.fillStyle(0x000000, 0.05);
      v.fillRect(0, 0, sw, sh);
      v.fillStyle(0xffffff, 0);
      v.fillCircle(sw / 2, sh / 2, sh * 0.6 - i * 6);
    }

    // Entry flash
    this.cameras.main.flash(900, 196, 154, 255, true);
  }

  override update(): void {
    if (!this.inputEnabled) {
      this.player.setVelocity(0, 0);
      this.nearLabel.setVisible(false);
      return;
    }
    const left = this.cursors.left?.isDown || this.wasd.A.isDown;
    const right = this.cursors.right?.isDown || this.wasd.D.isDown;
    const up = this.cursors.up?.isDown || this.wasd.W.isDown;
    const down = this.cursors.down?.isDown || this.wasd.S.isDown;

    let vx = 0, vy = 0;
    if (left) vx -= 1; if (right) vx += 1;
    if (up) vy -= 1; if (down) vy += 1;
    if (vx !== 0 && vy !== 0) { vx *= 0.707; vy *= 0.707; }
    this.player.setVelocity(vx * PLAYER_SPEED, vy * PLAYER_SPEED);

    // Find nearest interactable
    let bestDist = 110 * 110;
    let target: { def: MirrorWorldObject; sprite: Phaser.GameObjects.Image } | null = null;
    for (const o of this.objects) {
      const dx = o.sprite.x - this.player.x;
      const dy = o.sprite.y - this.player.y;
      const d = dx * dx + dy * dy;
      if (d < bestDist) { bestDist = d; target = o; }
    }

    if (target) {
      const cam = this.cameras.main;
      this.nearLabel.setText(`[E] inspect ${target.def.name}`).setVisible(true);
      this.nearLabel.setPosition(
        target.sprite.x - cam.scrollX - this.nearLabel.width / 2,
        target.sprite.y - cam.scrollY - 70,
      );
    } else {
      this.nearLabel.setVisible(false);
    }

    if (Phaser.Input.Keyboard.JustDown(this.interactKey) && target) {
      this.events_.onInspect(target.def);
    }
    if (Phaser.Input.Keyboard.JustDown(this.exitKey)) {
      this.events_.onExit();
    }
  }

  setInputEnabled(enabled: boolean): void {
    this.inputEnabled = enabled;
    if (!enabled) {
      this.player.setVelocity(0, 0);
      this.nearLabel.setVisible(false);
    }
  }
}
