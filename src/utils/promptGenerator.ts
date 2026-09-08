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

// ASK — everyday practical AI queries leveraging Arc's best features:
// web search with citations, app builder (/build), reminders, document analysis,
// weather, practical drafting, troubleshooting, and daily productivity.
const askPromptPool: QuickPrompt[] = [
  { label: "🌐 Search The Web", prompt: "Search the web and give me a clear, up-to-date summary of the latest news on a topic with sources." },
  { label: "🧭 Plan My Day", prompt: "Help me structure my day: organize my tasks into time blocks with realistic priorities and breaks." },
  { label: "📧 Polish This Email", prompt: "I need to send an important email. Help me write it clearly, politely, and to the point." },
  { label: "📄 Summarize Document", prompt: "I'm uploading a file or document. Break it down into the core takeaways and actionable next steps." },
  { label: "🍳 Quick Dinner Idea", prompt: "Here's what I have in my fridge and pantry — suggest two quick, delicious meal ideas I can make tonight." },
  { label: "⏰ Set A Reminder", prompt: "Schedule a reminder for me with a specific time and task so I don't forget to follow up." },
  { label: "⚖️ Compare Options", prompt: "I'm choosing between two products or approaches. Compare their pros, cons, and give me a clear recommendation." },
  { label: "📱 Build An App", prompt: "/build Build me a clean, interactive mini web app or tool for this idea with a live preview." },
  { label: "🌦️ Weather & Outfit", prompt: "What's the weather forecast where I am today, and what should I wear or plan around it?" },
  { label: "🎙️ Practice Interview", prompt: "Act as an interviewer for a role I'm preparing for. Ask me one question at a time and give constructive feedback." },
  { label: "💡 Brainstorm Ideas", prompt: "Brainstorm 10 fresh, practical ideas for a project I'm starting, ranked from easiest to most ambitious." },
  { label: "🔍 Fact Check Claim", prompt: "Search the web to fact-check this claim and tell me whether it's verified, misleading, or debunked." },
  { label: "📊 Create A Table", prompt: "Organize this information into a clean comparison table so I can see the differences at a glance." },
  { label: "✈️ Trip Itinerary", prompt: "Build a practical, day-by-day travel itinerary with great local spots, realistic timing, and travel tips." },
  { label: "📝 Rewrite & Simplify", prompt: "Rewrite this text to make it punchy, engaging, and easy for anyone to understand without jargon." },
  { label: "🛠️ Fix & Troubleshoot", prompt: "I'm dealing with a technical or household issue. Walk me step-by-step through troubleshooting it safely." },
  { label: "🧮 Budget Breakdown", prompt: "Help me calculate and budget costs for an upcoming purchase or event with realistic itemized estimates." },
  { label: "📚 Explain Simply", prompt: "Explain this complex concept in simple, intuitive terms with an everyday analogy that clicks." },
  { label: "🗂️ Search Past Chats", prompt: "Search my past conversations with you and find what we previously decided or discussed about this." },
  { label: "⚡ Quick Decision", prompt: "I'm experiencing decision fatigue. Ask me 3 quick questions and make a clear recommendation for me." },
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
