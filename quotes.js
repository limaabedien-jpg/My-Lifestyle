// My Lifestyle — one short quote a day, picked for what you do
const STUDY = [
  ["The beautiful thing about learning is that nobody can take it away from you.", "B.B. King"],
  ["Education is the most powerful weapon which you can use to change the world.", "Nelson Mandela"],
  ["I have no special talents. I am only passionately curious.", "Albert Einstein"],
  ["Imagination is more important than knowledge.", "Albert Einstein"],
  ["Genius is one percent inspiration and ninety-nine percent perspiration.", "Thomas Edison"],
  ["Nothing in life is to be feared, it is only to be understood.", "Marie Curie"],
  ["If I have seen further it is by standing on the shoulders of giants.", "Isaac Newton"],
  ["If you want to shine like a sun, first burn like a sun.", "A.P.J. Abdul Kalam"],
  ["Arise, awake, and stop not till the goal is reached.", "Swami Vivekananda"],
  ["You can't cross the sea merely by standing and staring at the water.", "Rabindranath Tagore"],
  ["Stay hungry, stay foolish.", "Steve Jobs"],
];
const DISCIPLINE = [
  ["We are what we repeatedly do. Excellence, then, is not an act, but a habit.", "Will Durant"],
  ["Discipline is the bridge between goals and accomplishment.", "Jim Rohn"],
  ["Motivation is what gets you started. Habit is what keeps you going.", "Jim Ryun"],
  ["Take care of your body. It's the only place you have to live.", "Jim Rohn"],
];
const TEACH = [
  ["Teaching is the greatest act of optimism.", "Colleen Wilcox"],
  ["What we learn with pleasure we never forget.", "Alfred Mercier"],
];
const WORK = [
  ["The only way to do great work is to love what you do.", "Steve Jobs"],
  ["Ideas are easy. Implementation is hard.", "Guy Kawasaki"],
  ["Price is what you pay. Value is what you get.", "Warren Buffett"],
  ["Your most unhappy customers are your greatest source of learning.", "Bill Gates"],
];
const HOME = [
  ["Home is where one starts from.", "T.S. Eliot"],
];
const SETS = { school: [...STUDY, ...STUDY, ...DISCIPLINE], student: [...STUDY, ...STUDY, ...DISCIPLINE], teacher: [...TEACH, ...STUDY, ...DISCIPLINE], business: [...WORK, ...DISCIPLINE], job: [...WORK, ...DISCIPLINE, ...STUDY.slice(0, 3)], homemaker: [...HOME, ...DISCIPLINE, ...STUDY.slice(0, 4)] };
export function quoteFor(occupation, day, shift = 0) {
  const list = SETS[occupation] || [...STUDY, ...DISCIPLINE];
  let n = 0; for (const c of day) n = (n * 31 + c.charCodeAt(0)) >>> 0;
  return list[(n + shift) % list.length];
}
