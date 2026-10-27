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
  boy:  { face: 0xf7efe6, skin: 0xefcab3, hair: 0x4f9a3a, hairSheen: 0xbfe89a, outfit: 0xa9c1dc, pants: 0x3e4a63, boots: 0x3b2a22 },

  // Background music is composed in code. To use your own recordings instead, put the files in
  // assets/music/ and fill these in, e.g. planet: 'assets/music/planet.mp3'
  music: { waiting: '', planet: '', ending: '' },

  // Changes where the 24 flowers sit on the planet (any number)
  seed: 1018,

  // One letter per hour, in order. Each has a greeting line, then the text (one paragraph per line).
  // To show a scan of a handwritten letter instead, set `image`, e.g. image: 'assets/letters/letter-01.jpg'
  letters: [
    { time: '00:00', n: 'I', title: 'On Your Existence', sub: 'The beginning of everything.', greet: 'My love,', text: `There is something extraordinary about the simple fact that you exist. That among all the possible lives, all the countless people who have passed through this world, there should be one particular person whose existence has come to mean so much to me.
Today, the world quietly marks another year of having you in it.
I hope you know that you need not accomplish anything remarkable today, nor become anything more than you already are.
For somewhere in this enormous universe, there is a person who finds the mere fact of your existence worth celebrating.
That person is me.
Happy birthday, Cream.` },
    { time: '01:00', n: 'II', title: 'On Finding You', sub: 'Of all the possible encounters.', greet: 'Cream,', text: `I sometimes wonder how many small and seemingly insignificant things had to happen for our lives to meet.
A different decision, a delayed morning, a road taken instead of another, and perhaps we might have remained strangers, living our separate lives without ever knowing what we had missed.
It is a strange and beautiful thought.
Not that we were destined to find each other, but that in a world where so much is uncertain, two lives should have found themselves standing in the same place, at the same time.
And from that little accident, something so precious could grow.
I am glad that, of all the lives I might have encountered, one of them was yours.` },
    { time: '02:00', n: 'III', title: 'On Your Beauty', sub: 'What cannot be seen.', greet: 'My love,', text: `There are beautiful things in this world which ask to be admired. The mountains, the oceans, the way the last light of evening rests upon a quiet room.
But there is another kind of beauty, one which cannot be observed from a distance.
It reveals itself slowly, through familiarity, through the thousand unremarkable moments in which a person becomes known.
And perhaps this is the beauty I love most about you.
Not simply the beauty of your face, but the beauty that emerges through knowing you.
For to love someone is also to discover, again and again, how much of them remains beautiful beyond what the eyes can see.` },
    { time: '03:00', n: 'IV', title: 'On Our Little Family', sub: 'Of a chicken named Chouchou.', greet: 'Baobao,', text: `It is a peculiar thing, the way love gives meaning to otherwise ordinary objects.
A little chicken, who by all reasonable accounts ought to be nothing more than a toy, has somehow become our child.
And perhaps that is one of the quietest miracles of loving someone.
That two people can create an entire universe out of the smallest things. A shared joke becomes a tradition. A toy becomes a child. Something meaningless to the rest of the world becomes immeasurably precious to us.
I wonder how many more little worlds we will make together.
For now, there is you, there is me, and there is Chouchou.
And somehow, that is already a beautiful little family.` },
    { time: '04:00', n: 'V', title: 'On Becoming', sub: 'For the person you are growing into.', greet: 'Cream,', text: `I hope you never feel that you must hurry to become the person you imagine yourself to be.
A flower does not question why it has not yet blossomed. Nor does the morning apologize for arriving slowly.
There is dignity in becoming, in allowing life to unfold without demanding that every uncertainty be answered.
I know there are dreams you have not yet reached, and parts of yourself that you are still learning to understand.
But I hope you will be gentle with the person you are today.
She, too, is deserving of love.
And I would like to be beside you, not only when you have become everything you hope to be, but throughout the beautiful, imperfect journey of becoming.` },
    { time: '05:00', n: 'VI', title: 'On Ordinary Things', sub: 'The unnoticed miracle.', greet: 'Baobao,', text: `I have come to believe that the greatest moments of love are not always those we remember most vividly.
Sometimes they are the moments we almost forget.
A conversation about nothing in particular. An ordinary meal. A cup of coffee or matcha, prepared just the way you like it. The quiet comfort of knowing someone is nearby.
How strange that these little things, which seem to carry so little importance when they happen, should eventually become the very substance of a life together.
Perhaps happiness is not something waiting for us at the end of a great journey.
Perhaps it has been sitting beside us all along, disguised as an ordinary afternoon.` },
    { time: '06:00', n: 'VII', title: 'On the Morning', sub: 'The world begins again.', greet: 'My love,', text: `Somewhere, the morning has begun to gather itself.
The sky grows lighter, the world slowly returns to its familiar rhythms, and another day emerges from the darkness.
I have always found something comforting about mornings.
They remind us that life does not ask us to carry yesterday forever. That whatever has passed, something new remains possible.
And today, as the world begins again, I hope you wake with the quiet certainty that there is still so much beauty waiting to find you.
May life be kind to you.
And when it is not, may you always find somewhere gentle to rest.` },
    { time: '07:00', n: 'VIII', title: 'On the Life You Are Building', sub: 'I see how far you have come.', greet: 'Baobao,', text: `I know that sometimes, when you look toward the future, you see more questions than answers.
You wonder whether you are moving in the right direction, whether the life you are building will become the life you once imagined.
But I wish you could see yourself through my eyes.
For I have watched you grow in ways you may not even have noticed. I have seen your courage, your perseverance, and the quiet strength with which you continue moving forward.
I see the effort you make, even when it goes unrecognised. I see the little victories you forget to celebrate.
And I am proud of you.
You are not late to your own life, Cream.` },
    { time: '08:00', n: 'IX', title: 'On Loving You', sub: 'Without needing a reason.', greet: 'My love,', text: `I could tell you a hundred reasons why I love you.
And each would be true.
But I suspect that even after I had exhausted every reason, something essential would remain unexplained.
For love is a peculiar thing. It begins with what we admire, but somewhere along the way, it grows beyond explanation.
We come to love not merely the qualities of a person, but the person herself, in her entirety.
Perhaps that is what I am trying to say.
That my love for you is not a collection of reasons which might someday be counted and exhausted.
It is something that has grown its own roots.` },
    { time: '09:00', n: 'X', title: 'On Your Imperfections', sub: 'To be loved entirely.', greet: 'Baobao,', text: `I hope you never mistake my love for an expectation that you must always be wonderful.
You are allowed to have difficult mornings, unreasonable fears, moments of impatience, and days when you cannot quite recognise the person you wish to be.
You are allowed to be human.
And I hope that in loving you, I can offer you something more meaningful than admiration.
The freedom to be imperfect without fearing that you have somehow become less deserving of tenderness.
For what would love be, if it could only survive in the presence of our finest qualities?
I do not wish to love some distant and ideal version of you.
I wish to know you, as you are, and to love you there.` },
    { time: '10:00', n: 'XI', title: 'On the Passage of Time', sub: 'Another year, another beginning.', greet: 'Cream,', text: `Birthdays are curious things.
We count the years as though time were something we could hold in our hands, something we could gather and measure.
Yet the most important parts of a life cannot be counted so easily.
How does one measure a moment of happiness? Or the distance between two people who have gradually grown closer?
You are another year older today.
But you are also the sum of countless mornings, conversations, discoveries, and quiet victories that no calendar could ever contain.
I hope you look upon all those years with tenderness.
They have brought you here.
And I am so glad they have.` },
    { time: '11:00', n: 'XII', title: 'On Going Beyond', sub: 'For all the journeys ahead.', greet: 'My love,', text: `There is something quietly poetic about the name Go Beyond.
You spend your days helping others discover places beyond the familiar, yet I know that when it comes to your own future, the unknown can sometimes feel more frightening than inviting.
But perhaps every meaningful journey begins with uncertainty.
Just as you wish for us to explore this beautiful world together, I hope you will approach your own life with that same spirit of adventure.
There will be unfamiliar roads, unexpected detours, and places we never imagined ourselves arriving.
Some journeys will take us across oceans. Others will take place quietly, within ourselves.
And I look forward to discovering where they lead.
Especially the ones we get to walk together.` },
    { time: '12:00', n: 'XIII', title: 'On the Middle of the Day', sub: 'Halfway through your birthday.', greet: 'Baobao,', text: `Half the day has passed, my love.
Twelve little letters have found their way to you, and twelve more are waiting to be read.
There is something beautiful about dividing a day in this manner.
To take twenty-four ordinary hours and fill each one with a small declaration of love.
Perhaps it is my way of resisting how quickly time seems to pass.
For I cannot make this birthday last longer, nor ask the hours to move more slowly.
But I can try to leave something within them.
A little tenderness.
A thought.
A reminder that as the day moves forward, you remain somewhere within my heart.` },
    { time: '13:00', n: 'XIV', title: 'On Your Own World', sub: 'Two lives, standing together.', greet: 'Cream,', text: `There is a thought about love that I have always found beautiful.
That two people need not become one in order to belong together.
Each of us carries an entire world within ourselves. Our own memories, hopes, fears, and private landscapes which no other person can completely enter.
And I would never wish for loving me to mean that you must surrender any part of yours.
I hope you continue to cultivate the things that make you yourself, to discover new interests, and to dream dreams which are entirely your own.
For I do not love you because you have become a part of me.
I love you because you are yourself.
And because, somehow, our separate worlds have made room for one another.` },
    { time: '14:00', n: 'XV', title: 'On the Little Things', sub: 'And your peculiar affections.', greet: 'Baobao,', text: `There is something wonderful about the little preferences through which a person becomes unmistakably herself.
Your affection for prawns, which I suspect could survive almost any circumstance. The simple pleasure of a good coffee, or the satisfaction of finding a matcha that tastes just right.
And, of course, your deeply held opposition to beans and nuts.
It amuses me that a world so vast should contain these small certainties about you.
But I think there is tenderness in knowing such things.
Love is sometimes spoken of as though it belongs only to grand gestures.
Yet I think it lives just as faithfully in remembering the smallest preferences of another person.
And in knowing, without needing to ask, that the prawns are yours.
The beans, unfortunately, are mine.` },
    { time: '15:00', n: 'XVI', title: 'On Distance', sub: 'The space between us.', greet: 'My love,', text: `There may be days when we cannot be beside one another.
Days when life carries us in different directions, when responsibilities gather, and when our conversations become shorter than we would like.
I hope that when such days arrive, we will remember that love is not measured solely by proximity.
Sometimes love is the quiet assurance that even in another place, another person continues to hold us in their thoughts.
That two people can occupy different corners of the world, live through entirely different hours, and still remain connected by something neither distance nor silence can easily undo.
Wherever life takes us, I hope we will always find our way back to one another.` },
    { time: '16:00', n: 'XVII', title: 'On Your Strength', sub: 'For everything you have carried.', greet: 'Cream,', text: `There are things about you that I may never fully understand.
Experiences you have lived through before I knew you, burdens you have carried quietly, and private struggles which have shaped the person standing before me today.
But there are also things I have been fortunate enough to witness.
I have watched you confront uncertainties, find your footing in unfamiliar places, and grow in ways you may not even recognise.
For growth rarely announces itself. More often, it happens quietly, through difficult mornings and small decisions to continue.
And I want you to know that I see it.
I am proud of the person you are becoming.
But more than that, I am proud of the person who has carried you here.` },
    { time: '17:00', n: 'XVIII', title: 'On the Future', sub: 'The life we have yet to discover.', greet: 'Baobao,', text: `When I think about the future, I imagine the world waiting for us.
The mountains we have yet to stand upon. The strange cities in which we will lose our way. The unfamiliar food we will argue about trying, and the little adventures that will someday become our stories.
And somewhere between all these adventures, I imagine the quieter moments too.
A familiar home. An afternoon without plans. Two cups upon a table, and Chouchou occupying a place of importance far greater than any little chicken could reasonably expect.
For I think a beautiful life must have room for both.
The wonder of discovering the world, and the comfort of having somewhere to return.
I hope we have many such days ahead.` },
    { time: '18:00', n: 'XIX', title: 'On the Weight of Expectations', sub: 'You are enough, even now.', greet: 'Cream,', text: `I sometimes wish that you could put down, if only for a little while, the weight of everything you believe you ought to become.
The expectations, the comparisons, the quiet suspicion that someone else has already figured out the life you are still trying to understand.
But life is not a race in which we must all arrive at the same destination.
I have watched you grow, and I know how far you have come, even if you sometimes struggle to see it yourself.
Your career will change. Your ambitions may change. But none of these things determines your worth.
You are not the sum of your achievements.
And the person I have come to know and love is already enough.` },
    { time: '19:00', n: 'XX', title: 'On Growing Older Together', sub: 'The beauty of what changes.', greet: 'My love,', text: `One day, we will look different from the people we are today.
Time will leave its small signatures upon us. Our faces will change, our bodies will grow older, and the things which seem so important now may gradually lose their urgency.
I wonder what it will be like to look at you then.
To see, beneath the years, the person I first came to love, and also every person you have become since.
Perhaps that is one of the great privileges of loving someone for a long time.
To witness not a single life, frozen in its most beautiful moment, but an entire succession of lives unfolding within the same person.
And to find, through all those changes, that there is still something unmistakably, wonderfully you.` },
    { time: '20:00', n: 'XXI', title: 'On Home', sub: 'Where we belong.', greet: 'Baobao,', text: `I used to think of home as a place.
A particular room, a familiar arrangement of things, somewhere we could return to after a long and tiring day.
But I am beginning to understand that home can also be a feeling.
The quiet relief of no longer needing to explain oneself. The freedom to be silent without being misunderstood. The knowledge that one's presence is welcome, even when there is nothing particular to offer.
I hope that, in some small way, I have become such a place for you.
Not somewhere you must always return, nor somewhere you are expected to remain.
But somewhere you can come as you are, without preparation or pretence.
And find that you are loved.` },
    { time: '21:00', n: 'XXII', title: 'On Choosing You', sub: 'Again and again.', greet: 'Cream,', text: `There is something I find more beautiful than the idea of a love which was always destined to exist.
It is the thought that love can be chosen.
Not once, in a moment of overwhelming affection, but repeatedly, through all the ordinary days that follow.
To choose tenderness when impatience would be easier.
To choose understanding when misunderstanding has taken root.
To choose to know another person, even when knowing them requires us to confront things about ourselves.
I cannot know everything the years will bring.
But I hope that as we continue to change, we will keep finding reasons to choose one another.
And perhaps one day, we will discover that the greatest part of our love was not simply that we found each other.
But that we continued to stay.` },
    { time: '22:00', n: 'XXIII', title: 'On All That Remains', sub: 'An unwritten lifetime.', greet: 'My love,', text: `As your birthday approaches its final hours, I find myself thinking about everything that remains.
The places we have yet to see. The mountains we have yet to climb. The unfamiliar streets we will wander, and the beautiful moments waiting somewhere for us to arrive.
I know how much you wish for us to experience life together.
And I want you to know that I wish for this too.
To see something beautiful and instinctively turn toward you, hoping that you have seen it too.
To return from a journey carrying not only photographs, but a little more of the world within ourselves.
And perhaps, when we are much older, we will find that the most extraordinary thing about all those places was never simply where we had gone.
But that we had gone there together.` },
    { time: '23:00', n: 'XXIV', title: 'On Loving You, Still', sub: 'The last letter, but not the last word.', greet: 'My love,', text: `And so, the final hour of your birthday has arrived.
I have spent this day trying, in twenty-four different ways, to tell you something that might have been said in three simple words.
But perhaps that is the trouble with love.
The words are always smaller than the thing itself.
I could write another hundred letters and still find that something remains unsaid.
And perhaps it is better this way.
For I would rather spend the years ahead discovering all the things I have not yet learned how to tell you.
May you remain curious, courageous, and tender toward this strange world. May you find happiness in places you never thought to look, and may you never forget how far you have come.
And may you always know that somewhere within this world, there is someone profoundly grateful that you were born.
And a little chicken named Chouchou, who would undoubtedly agree.
Happy birthday, baobao.
I love you, Cream.
And tomorrow, when there are no more letters arriving every hour, I will love you still.` },
  ],
};
