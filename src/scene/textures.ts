// Procedural textures for the parlor. Soft, candlelit Victorian palette.

import Phaser from "phaser";

export const T = 32;

export interface MirrorVariant {
  body: number;
  accent: number;
}

export function buildParlorTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists("parlor.floor")) return;

  // Wooden floor (warm brown, slight wood-grain via diagonal hatch)
  const floor = scene.make.graphics({ x: 0, y: 0 }, false);
  floor.fillStyle(0x3a2418, 1);
  floor.fillRect(0, 0, T, T);
  floor.fillStyle(0x4a2e1e, 1);
  floor.fillRect(0, 2, T, 1);
  floor.fillRect(0, 14, T, 1);
  floor.fillRect(0, 26, T, 1);
  floor.generateTexture("parlor.floor", T, T);
  floor.destroy();

  // Floor accent (alternate plank)
  const floor2 = scene.make.graphics({ x: 0, y: 0 }, false);
  floor2.fillStyle(0x331f15, 1);
  floor2.fillRect(0, 0, T, T);
  floor2.fillStyle(0x422717, 1);
  floor2.fillRect(0, 6, T, 1);
  floor2.fillRect(0, 18, T, 1);
  floor2.generateTexture("parlor.floor_alt", T, T);
  floor2.destroy();

  // Wall (dark wood paneling)
  const wall = scene.make.graphics({ x: 0, y: 0 }, false);
  wall.fillStyle(0x1a0e08, 1);
  wall.fillRect(0, 0, T, T);
  wall.fillStyle(0x2a1810, 1);
  wall.fillRect(2, 2, T - 4, T - 4);
  wall.lineStyle(1, 0x0a0604, 1);
  wall.strokeRect(2, 2, T - 4, T - 4);
  wall.generateTexture("parlor.wall", T, T);
  wall.destroy();

  // Wall top (golden trim)
  const trim = scene.make.graphics({ x: 0, y: 0 }, false);
  trim.fillStyle(0x1a0e08, 1);
  trim.fillRect(0, 0, T, T);
  trim.fillStyle(0x6e4e1e, 1);
  trim.fillRect(0, T - 6, T, 4);
  trim.fillStyle(0x8a6c2e, 1);
  trim.fillRect(0, T - 6, T, 1);
  trim.generateTexture("parlor.wall_trim", T, T);
  trim.destroy();

  // Carpet (rich red oriental)
  const carpet = scene.make.graphics({ x: 0, y: 0 }, false);
  carpet.fillStyle(0x5a1a1a, 1);
  carpet.fillRect(0, 0, T, T);
  carpet.fillStyle(0x8a2828, 1);
  carpet.fillCircle(T / 2, T / 2, 6);
  carpet.fillStyle(0xc89a3e, 1);
  carpet.fillCircle(T / 2, T / 2, 2);
  carpet.generateTexture("parlor.carpet", T, T);
  carpet.destroy();

  // Player sprite (medium in dark robes)
  const player = scene.make.graphics({ x: 0, y: 0 }, false);
  player.fillStyle(0x1a1024, 1);
  player.fillRoundedRect(6, 4, T - 12, T - 6, 5);
  player.fillStyle(0xe8d8c4, 1);
  player.fillCircle(T / 2, 10, 5); // face
  player.fillStyle(0x442200, 1);
  player.fillRect(11, 6, 10, 3); // hair band
  player.fillStyle(0xffd24c, 1);
  player.fillCircle(T / 2, T - 8, 2); // glowing pendant
  player.generateTexture("parlor.player", T, T);
  player.destroy();

  // Candle (lit, with flame)
  const candle = scene.make.graphics({ x: 0, y: 0 }, false);
  candle.fillStyle(0xeae0c4, 1);
  candle.fillRect(13, 10, 6, 16);
  candle.fillStyle(0xffd24c, 1);
  candle.fillEllipse(T / 2, 5, 6, 10);
  candle.fillStyle(0xfff0a3, 1);
  candle.fillEllipse(T / 2, 4, 3, 5);
  candle.generateTexture("parlor.candle", T, T);
  candle.destroy();

  // Altar (dark velvet table with golden inlay)
  const altar = scene.make.graphics({ x: 0, y: 0 }, false);
  altar.fillStyle(0x1a0e1f, 1);
  altar.fillRect(0, 0, T * 2, T);
  altar.fillStyle(0x5a2e6a, 1);
  altar.fillRect(2, 2, T * 2 - 4, T - 4);
  altar.fillStyle(0xc89a3e, 1);
  altar.fillRect(4, 4, T * 2 - 8, 2);
  altar.fillRect(4, T - 6, T * 2 - 8, 2);
  altar.generateTexture("parlor.altar", T * 2, T);
  altar.destroy();
}

/** A mirror with a colored frame matching the ghost's appearance. Generated
 *  on demand per ghost (we cache by id). The texture is 2T × 3T (tall mirror). */
export function buildMirrorTexture(scene: Phaser.Scene, key: string, body: number, accent: number, lit: boolean): void {
  if (scene.textures.exists(key)) return;
  const W = T * 2, H = T * 3;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // outer ornate frame
  g.fillStyle(0x3a2418, 1);
  g.fillRect(0, 0, W, H);
  g.fillStyle(accent, 1);
  g.fillRect(2, 2, W - 4, H - 4);
  g.fillStyle(body, 1);
  g.fillRect(4, 4, W - 8, H - 8);
  // mirror surface
  g.fillStyle(lit ? 0x6c5e8a : 0x14101a, 1);
  g.fillRect(8, 10, W - 16, H - 20);
  // glints
  if (lit) {
    g.fillStyle(0xc4b6e6, 0.5);
    g.fillEllipse(W / 2 - 6, 22, 8, 14);
    g.fillStyle(0xffffff, 0.3);
    g.fillEllipse(W / 2 + 8, H - 30, 6, 10);
  }
  // brass placard at bottom
  g.fillStyle(0x6e4e1e, 1);
  g.fillRect(6, H - 8, W - 12, 6);
  g.fillStyle(0x8a6c2e, 1);
  g.fillRect(6, H - 8, W - 12, 1);
  g.generateTexture(key, W, H);
  g.destroy();
}
