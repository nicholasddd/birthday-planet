// ============================================================
//  Everything you'll want to personalise lives in this file.
// ============================================================

export const CONFIG = {
  // Her name, shown on the intro + ending screens
  herName: 'My Love',

  // When flower #1 appears (local time of the device she opens it on).
  // Flower #N appears N-1 hours after this. 24 flowers -> 24 hours.
  startTime: '2026-10-18T00:00:00',

  // Photos used as the faces of the two characters (square-ish face crops work best).
  // If a file is missing, a cute placeholder face is drawn instead.
  girlFace: 'assets/photos/her.jpg',
  boyFace: 'assets/photos/me.jpg',

  // Character colours
  girl: { skin: 0xf2c6a5, hair: 0x4a2c20, outfit: 0xff8fb8, accent: 0xffffff, legs: 0xf2c6a5, shoes: 0xffffff },
  boy:  { skin: 0xe8b994, hair: 0x2b1d14, outfit: 0x6fa8ff, accent: 0xffffff, legs: 0x3b4a6b, shoes: 0x333333 },

  // Changes where the 24 flowers sit on the planet (any number)
  seed: 1018,

  // One entry per hour. `image` = scan/photo of your handwritten letter.
  // `text` is shown if the image is missing (handy while you're still writing them).
  letters: Array.from({ length: 24 }, (_, i) => ({
    title: `Hour ${i + 1}`,
    image: `assets/letters/letter-${String(i + 1).padStart(2, '0')}.jpg`,
    text: `This is placeholder letter #${i + 1}.\n\nReplace it by dropping a photo of your handwritten letter at\nassets/letters/letter-${String(i + 1).padStart(2, '0')}.jpg`,
  })),
};
