// ============================================================
//  Everything you'll want to personalise lives in this file.
// ============================================================

export const CONFIG = {
  // Her name, shown on the intro + ending screens
  herName: 'My Baobao',

  // How each letter is signed, and the little crest at the top of the paper / on the wax seal
  fromName: 'Your boy',
  monogram: '♥',

  // Her birthday — the password that opens the planet (she types it as day/month, e.g. 12/11)
  birthday: { day: 12, month: 11 },   // 12 November (2001)

  // When the first chouchou appears: midnight on her birthday, Thailand time (UTC+7).
  // The "+07:00" pins it to Thai time whatever timezone her computer is in.
  // Chouchou #N appears N-1 hours after this, so all 24 arrive over the 24 hours of her birthday.
  startTime: '2026-11-12T00:00:00+07:00',
  // Shown on the waiting page so the wake-up time reads in Thai time
  timeZone: 'Asia/Bangkok', timeZoneName: 'Thailand time',

  // Character colours (chibi plush style)
  girl: { face: 0xf7efe6, skin: 0xf3d2bf, hair: 0x5a2c1c, hairSheen: 0xc98a5e, outfit: 0xf7f4ef, boots: 0x6b4434 },
  boy:  { face: 0xf7efe6, skin: 0xefcab3, hair: 0x2e1d17, outfit: 0xa9c1dc, pants: 0x3e4a63, boots: 0x3b2a22 },

  // Background music is composed in code. To use your own recordings instead, put the files in
  // assets/music/ and fill these in, e.g. planet: 'assets/music/planet.mp3'
  music: { waiting: '', planet: '', ending: '' },

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
