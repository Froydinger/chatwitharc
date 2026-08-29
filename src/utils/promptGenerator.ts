interface QuickPrompt {
  label: string;
  prompt: string;
}

// The library is organized around what ArcAI stands for: Ask, Reflect, Create.
//
// Prompts carry their own command prefix (`image/`, `write/`, `code/`) so the
// composer switches into the right mode when one is picked. Ask and Reflect
// prompts are plain chat and need no prefix — they lean on Arc's tools (web
// search, weather, memory, past-chat search, reminders, file reading) instead.

// ASK — day-to-day usefulness: lookups, plans, decisions, learning. Practical
// only; anything inward belongs in Reflect.
const askPromptPool: QuickPrompt[] = [
  { label: "🌐 Search The Web", prompt: "Search the web and tell me what's happening with a topic I'm following — give me the sources you used." },
  { label: "🌦️ Local Weather", prompt: "What's the weather where I am right now, and what should I plan around it today?" },
  { label: "📄 Read My File", prompt: "I'm attaching a document. Read it and give me the key points, anything surprising, and what I should do next." },
  { label: "⚖️ Weigh My Options", prompt: "Compare a few options I'm choosing between. Look up current details if it helps, and give me your actual recommendation." },
  { label: "🧠 Explain It Simply", prompt: "Explain a topic I'm curious about in plain language, then check whether I actually followed it." },
  { label: "⏰ Remind Me", prompt: "Set me a reminder for something I keep forgetting, and pick a time that actually makes sense." },
  { label: "🔎 Fact Check This", prompt: "Fact-check a claim I heard. Search for it, tell me what holds up, and link where it came from." },
  { label: "🗂️ Find That Chat", prompt: "Search my past chats for something we talked about before — I can't remember when or what we decided." },
  { label: "🎤 Practice With Me", prompt: "Role-play an interview or a call I'm preparing for. Play the other side properly, then tell me how I did." },
  { label: "🧭 Plan My Week", prompt: "Help me lay out the week so the important things actually get a slot, not just the urgent ones." },
  { label: "🍳 What Should I Cook", prompt: "Suggest something to cook tonight based on what I have and how much energy I've got left." },
  { label: "📚 Teach Me Something", prompt: "Teach me something genuinely interesting I probably don't know, and tell me why it matters." },
  { label: "🧮 Break It Down", prompt: "I'm stuck on a practical problem. Break it into steps and walk me through the first one." },
  { label: "🧾 Sort This Out", prompt: "Help me untangle an admin task I've been putting off — walk me through it in order." },
  { label: "🛠️ How Do I Fix", prompt: "Walk me through fixing something around the house, step by step, and tell me when to call someone instead." },
  { label: "✈️ Help Me Plan", prompt: "Help me plan a trip or an outing — look up what's worth knowing and keep it realistic." },
];

// REFLECT — therapy-adjacent, journaling, deep thought. Leans on Arc's memory
// and past-chat search. No errands or logistics here.
const reflectPromptPool: QuickPrompt[] = [
  { label: "🌙 Rough Day", prompt: "I had a rough day. Help me talk through what happened without rushing me to a solution." },
  { label: "💾 Remember This", prompt: "There's something about me I want you to remember for future chats. Save it, and tell me how you'll use it." },
  { label: "🪞 What You Know", prompt: "What do you remember about me so far? Tell me what you've picked up and whether any of it is out of date." },
  { label: "🔁 Same Pattern", prompt: "I keep circling the same problem. Search our past chats and show me the pattern I'm not seeing." },
  { label: "📓 Journal With Me", prompt: "Give me one journaling question worth sitting with tonight, then follow where my answer goes." },
  { label: "🕯️ Just Listen", prompt: "I don't want advice right now, I just want to think out loud. Follow along and reflect it back to me." },
  { label: "🌗 Reframe This", prompt: "I'm stuck seeing a situation one way. Help me look at it from an angle I haven't tried." },
  { label: "🧵 Untangle It", prompt: "My head is full and nothing is sorted. Ask me questions until it's untangled." },
  { label: "🫥 What I'm Avoiding", prompt: "Help me name the thing I keep avoiding, gently but honestly." },
  { label: "🌱 Where I'm Growing", prompt: "Look at what we've talked about lately and tell me where I'm actually growing — and where I keep stalling." },
  { label: "💬 Say The Hard Thing", prompt: "There's something I need to say to someone and I keep putting it off. Help me find the words." },
  { label: "🧊 Burnt Out", prompt: "I think I'm running on empty. Help me work out what's draining me and what would actually restore me." },
  { label: "📝 Weekly Reflection", prompt: "Walk me through reflecting on my week — what sat heaviest, what felt good, what I want to carry forward." },
  { label: "🎯 Set An Intention", prompt: "Help me set one clear intention for today, and make it small enough that I'll actually do it." },
  { label: "🫀 Sit With This", prompt: "Something is bothering me and I can't name it yet. Help me get closer to what it actually is." },
  { label: "🛌 Wind Down", prompt: "Help me wind down. Keep it slow and short, and don't hand me a to-do list." },
];

// CREATE — make the thing. Half images, half code; each carries its prefix so
// the composer switches into the right mode when it is picked.
const createPromptPool: QuickPrompt[] = [
  { label: "🎨 Surprise Me", prompt: "image/ Something beautiful and unexpected — you pick the subject, the palette, and the mood. Make a real choice, not a safe one." },
  { label: "🌆 Neon City", prompt: "image/ A rain-slicked city street at night, neon signs reflecting in the puddles, one lit window telling a whole story." },
  { label: "🖼️ Profile Shot", prompt: "image/ A clean, cinematic portrait with strong directional light and real personality — the kind of shot worth using as a profile picture." },
  { label: "📼 Retro Poster", prompt: "image/ A poster for a film that never existed, styled like the early nineties — bold type space, grain, and heavy atmosphere." },
  { label: "🏔️ Wide Open", prompt: "image/ A vast landscape at the exact moment the light turns — scale that makes a person feel small in a good way." },
  { label: "🍄 Strange Forest", prompt: "image/ A forest where the mushrooms glow and the scale is slightly wrong, lit like a memory rather than a photograph." },
  { label: "🌊 Deep Water", prompt: "image/ Something enormous moving just under the surface, seen from above — more suggestion than reveal." },
  { label: "🛰️ Quiet Orbit", prompt: "image/ A lone station above a planet at terminator line, sunlight raking across the hull." },
  { label: "🕹️ Build Something Fun", prompt: "code/ Build me a small interactive toy in one page — you choose what. Make it something I'll actually play with for a minute." },
  { label: "📊 Dashboard Mock", prompt: "code/ Build a compact dashboard with live-looking stats, a chart, and a clean layout in a single HTML file." },
  { label: "⏱️ Timer That Works", prompt: "code/ Build a timer I'd actually use — presets, a clear readout, and a finish that gets my attention." },
  { label: "🎲 Random Generator", prompt: "code/ Build a generator that produces something worth refreshing for, with a bit of animation when it lands." },
  { label: "🌈 Color Playground", prompt: "code/ Build a color palette playground where I can nudge values and instantly see the result on a sample layout." },
  { label: "🧮 Tiny Utility", prompt: "code/ Build a small utility that does one annoying thing well — a converter, a formatter, a calculator. Make it feel finished." },
  { label: "✨ Motion Study", prompt: "code/ Build a single-page motion study I can fiddle with — sliders that change the easing and watch it react." },
  { label: "🗺️ Visualize It", prompt: "code/ Build a page that visualizes something abstract — sorting, primes, orbits — so it's genuinely satisfying to watch." },
];

export type PromptCategory = 'ask' | 'reflect' | 'create';

// Shuffle array using Fisher-Yates algorithm
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Generate random prompts for a category
function generateCategoryPrompts(pool: QuickPrompt[], count: number = 6): QuickPrompt[] {
  const shuffled = shuffleArray(pool);
  return shuffled.slice(0, count);
}

const pools: Record<PromptCategory, QuickPrompt[]> = {
  ask: askPromptPool,
  reflect: reflectPromptPool,
  create: createPromptPool,
};

// Generate all prompt categories
export function generateAllPrompts() {
  return {
    ask: generateCategoryPrompts(askPromptPool, 6),
    reflect: generateCategoryPrompts(reflectPromptPool, 6),
    create: generateCategoryPrompts(createPromptPool, 6),
  };
}

// Generate prompts for a specific category
export function generatePromptsByCategory(category: PromptCategory): QuickPrompt[] {
  return generateCategoryPrompts(pools[category] ?? askPromptPool, 6);
}

// Get all prompts as a flat array (for compatibility with existing code)
export function getAllPromptsFlat(): QuickPrompt[] {
  const generated = generateAllPrompts();
  return [
    ...generated.ask,
    ...generated.reflect,
    ...generated.create,
  ];
}
