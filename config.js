// ============================================================
//  Everything you'll want to personalise lives in this file.
// ============================================================

export const CONFIG = {
  // Her name, shown on the intro + ending screens
  herName: 'My Love',

  // How each letter is signed, and the little crest at the top of the paper / on the wax seal
  fromName: 'Your boy',
  monogram: '♥',

  // When flower #1 appears (local time of the device she opens it on).
  // Flower #N appears N-1 hours after this. 24 flowers -> 24 hours.
  startTime: '2026-10-18T00:00:00',

  // Character colours (chibi plush style)
  girl: { face: 0xf7efe6, skin: 0xf3d2bf, hair: 0x5a3326, outfit: 0xeedfc8, ribbon: 0x7393d1, boots: 0x4e3027 },
  boy:  { face: 0xf7efe6, skin: 0xefcab3, hair: 0x2e1d17, outfit: 0xa9c1dc, boots: 0x3b2a22 },

  // Changes where the 24 flowers sit on the planet (any number)
  seed: 1018,

  // One entry per hour. `image` = scan/photo of your handwritten letter.
  // `text` is shown if the image is missing (handy while you're still writing them).
  letters: Array.from({ length: 24 }, (_, i) => ({
    title: `Hour ${i + 1}`,
    image: `assets/letters/letter-${String(i + 1).padStart(2, '0')}.jpg`,
    text: `This is placeholder letter number ${i + 1}. Every chouchou carries one, and this is where my words for you will go.\n\nTo use a scan of a handwritten letter instead, save it as assets/letters/letter-${String(i + 1).padStart(2, '0')}.jpg`,
  })),
};
