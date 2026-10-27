// The demo (open the site with ?demo, or /demo/): a ten-minute taste for friends and strangers.
// 3 chouchous, a whole day squeezed into ten minutes, and its own words — nothing personal from the real gift.
// These values replace the matching ones in config.js while in demo mode.
export const DEMO_CONFIG = {
  herName: 'traveller',
  fromName: 'the chouchous',
  signEn: 'With gratitude,',
  signTh: 'ด้วยความขอบคุณ,',

  // three thank-you letters, one from each chouchou
  letters: [
    { time: '', n: 'I', title: 'On Your Arrival', sub: 'For the one who stopped awhile.', greet: 'Dear traveller,', text: `How strange, and how lovely, that you are here.
Of all the places a person might wander in an evening, you chose this small and quiet planet, and stayed long enough to lift a little creature out of the earth.
I do not know who you are, or what brought you. Perhaps only curiosity. Perhaps something softer.
But I believe every true attention is a kind of gift, and you have given yours to something that was made, with great care, for someone else.
For that, thank you.
Stay a little while. There is more to find.` },
    { time: '', n: 'II', title: 'On Small Things', sub: 'What is made with love.', greet: 'Dear traveller,', text: `This planet was not built to be impressive.
It was built the way one writes a letter by lamplight: slowly, privately, with one particular person in mind.
And yet here you are, reading it too, and I find I do not mind at all.
Perhaps that is the secret of tender things. They are never truly used up. The love poured into them simply waits, patient as water, for whoever comes next to kneel and drink.
Thank you for kneeling.
Thank you for being gentle with what is small.` },
    { time: '', n: 'III', title: 'On Leaving', sub: 'A last word, and a thank you.', greet: 'Dear traveller,', text: `Soon you will close this window and return to your own life, with its hours and its weather and its people.
I hope you carry something small back with you. Not the planet itself, but the feeling of having been, for a few minutes, somewhere unhurried.
We are all of us visitors, passing briefly through one another's worlds.
How rare, then, to be welcomed. How rare, to be thanked.
So let me say it plainly, as the little chickens would, if they could speak:
Thank you for coming. Thank you for staying.
Go gently.` },
  ],
  lettersTh: [
    { title: 'ว่าด้วยการมาถึงของคุณ', sub: 'แด่ผู้ที่แวะพักสักครู่', greet: 'ถึงผู้มาเยือน,', text: `ช่างแปลก และช่างงดงามเหลือเกิน ที่คุณมาอยู่ตรงนี้
จากบรรดาสถานที่ทั้งหมดที่ใครสักคนอาจล่องลอยไปในยามเย็น คุณเลือกดาวดวงเล็ก ๆ อันเงียบสงบดวงนี้ และอยู่นานพอที่จะยกสิ่งมีชีวิตตัวน้อยขึ้นมาจากผืนดิน
ฉันไม่รู้ว่าคุณเป็นใคร หรืออะไรพาคุณมา บางทีอาจเป็นเพียงความสงสัย บางทีอาจเป็นบางสิ่งที่อ่อนโยนกว่านั้น
แต่ฉันเชื่อว่าความใส่ใจที่แท้จริงทุกครั้งคือของขวัญชนิดหนึ่ง และคุณได้มอบมันให้กับสิ่งที่ถูกสร้างขึ้นอย่างพิถีพิถัน เพื่อใครอีกคนหนึ่ง
สำหรับสิ่งนั้น ขอบคุณ
อยู่ต่ออีกสักหน่อยนะ ยังมีอีกหลายอย่างให้ค้นพบ` },
    { title: 'ว่าด้วยสิ่งเล็ก ๆ', sub: 'สิ่งที่ถูกสร้างขึ้นด้วยความรัก', greet: 'ถึงผู้มาเยือน,', text: `ดาวดวงนี้ไม่ได้ถูกสร้างขึ้นเพื่อให้ใครประทับใจ
มันถูกสร้างขึ้นแบบเดียวกับที่ใครสักคนเขียนจดหมายใต้แสงตะเกียง อย่างช้า ๆ อย่างเป็นส่วนตัว โดยมีใครคนหนึ่งอยู่ในใจ
แต่แล้วคุณก็มาอยู่ตรงนี้ อ่านมันไปด้วย และฉันพบว่าตัวเองไม่ถือสาเลยสักนิด
บางทีนั่นอาจเป็นความลับของสิ่งที่อ่อนโยน มันไม่เคยถูกใช้จนหมดไปจริง ๆ ความรักที่ถูกเทลงไปเพียงรออยู่ อดทนดั่งสายน้ำ ให้ใครก็ตามที่มาถัดไปได้คุกเข่าลงดื่ม
ขอบคุณที่คุกเข่าลง
ขอบคุณที่อ่อนโยนกับสิ่งที่เล็กน้อย` },
    { title: 'ว่าด้วยการจากลา', sub: 'ถ้อยคำสุดท้าย และคำขอบคุณ', greet: 'ถึงผู้มาเยือน,', text: `อีกไม่นาน คุณจะปิดหน้าต่างนี้ และกลับไปสู่ชีวิตของคุณเอง กับชั่วโมง ดินฟ้าอากาศ และผู้คนของคุณ
ฉันหวังว่าคุณจะพกบางสิ่งเล็ก ๆ กลับไปด้วย ไม่ใช่ตัวดาวดวงนี้ แต่เป็นความรู้สึกที่ได้อยู่ในที่ที่ไม่เร่งรีบ แม้เพียงไม่กี่นาที
เราทุกคนต่างเป็นผู้มาเยือน ที่เดินผ่านโลกของกันและกันเพียงชั่วครู่
ช่างหาได้ยากเหลือเกิน ที่จะได้รับการต้อนรับ ช่างหาได้ยากเหลือเกิน ที่จะได้รับคำขอบคุณ
ฉะนั้น ขอให้ฉันพูดอย่างตรงไปตรงมา อย่างที่ไก่ตัวน้อยเหล่านี้คงพูด หากพวกมันพูดได้
ขอบคุณที่มา ขอบคุณที่อยู่
เดินทางอย่างอ่อนโยนนะ` },
  ],

  wishes: [
    { en: 'I wish you a slow morning, and nowhere at all to be.', th: 'ขอให้คุณมีเช้าที่เชื่องช้า โดยไม่ต้องรีบไปไหนเลย' },
    { en: 'I wish you someone who saves you the last bite.', th: 'ขอให้คุณมีใครสักคนที่เก็บคำสุดท้ายไว้ให้คุณ' },
    { en: 'I wish you the courage to be gentle.', th: 'ขอให้คุณมีความกล้าที่จะอ่อนโยน' },
    { en: 'I wish you a sky like this one, on a night you need it.', th: 'ขอให้คุณได้เห็นท้องฟ้าแบบนี้ ในคืนที่คุณต้องการมัน' },
    { en: 'I wish that whatever you are waiting for arrives right on time.', th: 'ขอให้สิ่งที่คุณรอคอย มาถึงในเวลาที่พอดี' },
  ],

  bottles: [
    { title: 'A note from the chouchous', th_title: 'จดหมายจากเหล่า Chouchou', image: '',
      en: 'Hello, visitor!\nWe are small, and we cannot write very well. But we are very glad you came.\n— the chouchous 🐣',
      th: 'สวัสดี ผู้มาเยือน!\nพวกเราตัวเล็ก และเขียนหนังสือไม่ค่อยเก่ง แต่ดีใจมากที่คุณมานะ\n— เหล่า Chouchou 🐣' },
    { title: 'About this planet', th_title: 'เกี่ยวกับดาวดวงนี้', image: '',
      en: 'This little world was made as a birthday gift: twenty-four hours, twenty-four chouchous, twenty-four letters.\nYou are having a ten-minute taste of it. Thank you for visiting.',
      th: 'โลกใบเล็กนี้ถูกสร้างขึ้นเป็นของขวัญวันเกิด: ยี่สิบสี่ชั่วโมง Chouchou ยี่สิบสี่ตัว และจดหมายยี่สิบสี่ฉบับ\nคุณกำลังได้ลิ้มลองมันเพียงสิบนาที ขอบคุณที่แวะมานะ' },
  ],
};
