interface QuickPrompt {
  label: string;
  prompt: string;
}

// Pools of prompt variations for each category
const chatPromptPool = [
  { label: "💭 Rough Day", prompt: "I had a rough day and need to talk through it. Can you help me process what happened?" },
  { label: "🧘 Check In", prompt: "Let's do a wellness check-in. I want to talk about how I'm feeling right now." },
  { label: "🎯 Need Focus", prompt: "I'm struggling to focus today. Help me create a plan to get back on track." },
  { label: "💬 Feeling Overwhelmed", prompt: "I'm feeling overwhelmed with everything going on. Can we talk through it?" },
  { label: "🤝 Need Advice", prompt: "I have a decision to make and I'm not sure what to do. Can you help me think it through?" },
  { label: "🙏 Gratitude Practice", prompt: "Help me practice gratitude today. I want to focus on the positive things in my life." },
  { label: "🌟 Set Intention", prompt: "I want to set a clear intention for today. Can you help me figure out what to focus on?" },
  { label: "🧠 Creative Block", prompt: "I'm stuck creatively and need help getting unstuck. Can you give me some prompts or exercises?" },
  { label: "💡 Problem Help", prompt: "I'm stuck on a problem and can't figure it out. Can you help me break it down?" },
  { label: "🌱 Growth Talk", prompt: "I want to talk about my personal growth. Where am I improving and where can I do better?" },
  { label: "🎨 Get Inspired", prompt: "I need some creative inspiration. Can you help spark some ideas?" },
  { label: "📚 Teach Me", prompt: "Teach me something new and interesting today. Surprise me with a fascinating topic!" },
  { label: "🔮 Future Dreams", prompt: "I want to dream big about my future. Help me visualize where I want to be." },
  { label: "⚡ Motivation Needed", prompt: "I need a motivational boost right now. Can you help energize me?" },
  { label: "🎭 Practice Conversation", prompt: "I have an important conversation coming up. Can we role-play so I can practice?" },
  { label: "🌈 New Perspective", prompt: "I'm looking at this situation the same way. Help me see it from a different angle." },
];

const createPromptPool = [
  { label: "🎨 Dream Poster", prompt: "Generate an image: a wild, colorful retro 90s poster design concept. Think neon colors, geometric shapes, and absolute chaos in the best way." },
  { label: "🌌 Cosmic Explorer", prompt: "Generate an image: a stunning cosmic landscape with planets, nebulae, and distant galaxies. Make it feel vast and awe-inspiring." },
  { label: "🎬 Cult Classic", prompt: "Generate an image: a movie poster for a hidden gem 90s film. Make it visually striking and nostalgic." },
  { label: "🌸 Nature's Canvas", prompt: "Generate an image: a beautiful, serene natural scene with lush details, perfect lighting, and a peaceful atmosphere." },
  { label: "🎪 Fever Dream", prompt: "Generate an image: the most unhinged, beautiful, chaotic 90s vaporwave aesthetic scene. Neon lights, palm trees, abandoned malls." },
  { label: "✨ Ethereal Portrait", prompt: "Generate an image: an artistic, ethereal portrait with dreamlike qualities, soft lighting, and beautiful composition." },
  { label: "🌆 Cyberpunk City", prompt: "Generate an image: a futuristic cyberpunk cityscape at night with neon signs, rain-slicked streets, and towering skyscrapers." },
  { label: "🏔️ Mountain Majesty", prompt: "Generate an image: majestic mountain peaks at sunrise with dramatic lighting, clouds, and epic scale." },
  { label: "🌊 Ocean Dreams", prompt: "Generate an image: an underwater scene with vibrant coral reefs, exotic fish, and rays of sunlight piercing the water." },
  { label: "🍄 Mushroom Forest", prompt: "Generate an image: a magical forest filled with giant, glowing mushrooms and mystical atmosphere." },
  { label: "🚀 Space Station", prompt: "Generate an image: a detailed space station orbiting a colorful planet with stars and cosmic phenomena in the background." },
  { label: "🎆 Neon Nights", prompt: "Generate an image: a vibrant street scene with neon signs, bustling energy, and electric atmosphere." },
  { label: "🦋 Butterfly Garden", prompt: "Generate an image: a lush garden filled with colorful butterflies, exotic flowers, and warm sunlight." },
  { label: "🏰 Fantasy Castle", prompt: "Generate an image: an epic fantasy castle on a cliff with dramatic clouds, waterfalls, and magical lighting." },
  { label: "🌵 Desert Sunset", prompt: "Generate an image: a stunning desert landscape at sunset with dramatic colors, cacti, and vast open sky." },
  { label: "🎮 Retro Game", prompt: "Generate an image: pixel art or vaporwave style scene inspired by classic 80s/90s video games with bold colors." },
];

const writePromptPool = [
  { label: "📖 Character Backstory", prompt: "Help me develop a detailed backstory for my character. I need depth and motivation." },
  { label: "✍️ Polish Draft", prompt: "I have a rough draft that needs polishing. Can you help me refine and improve it?" },
  { label: "💌 World Building", prompt: "Help me create lore and details for my fictional world. I want it to feel rich and believable." },
  { label: "🎭 Dialogue Help", prompt: "I'm struggling with dialogue in my scene. Can you help me make it more natural and engaging?" },
  { label: "📝 Blog Outline", prompt: "Help me outline my blog post idea. I need structure and a compelling flow." },
  { label: "🖋️ Poetry Feedback", prompt: "I wrote a poem and want feedback. Can you help me improve the imagery and rhythm?" },
  { label: "🎤 Opening Hook", prompt: "I need a strong opening hook for my piece. Help me grab the reader's attention immediately." },
  { label: "📰 Story Arc", prompt: "Help me plot out the story arc for my narrative. Where should the turning points be?" },
  { label: "🎯 Sharpen Focus", prompt: "My writing feels unfocused. Help me identify the core message and cut the fluff." },
  { label: "💭 Brainstorm Ideas", prompt: "I'm brainstorming for my next piece. Can you help me generate and explore ideas?" },
  { label: "📜 Plot Twist", prompt: "I need an unexpected plot twist for my story. Help me create something surprising but logical." },
  { label: "🌟 Stronger Ending", prompt: "My ending feels weak. Help me craft a more powerful and memorable conclusion." },
  { label: "📔 Theme Development", prompt: "Help me develop the central theme of my piece. I want it to resonate deeply." },
  { label: "🎨 Description Help", prompt: "I need help writing vivid descriptions. Make my scenes come alive with sensory details." },
  { label: "✉️ Tone Adjustment", prompt: "The tone of my writing isn't quite right. Help me adjust it to match my intent." },
  { label: "🎬 Scene Structure", prompt: "Help me structure this scene for maximum impact. Where should the tension build?" },
];

const codePromptPool = [
  { label: "🎮 Interactive Demo", prompt: "Code: Build a random interactive demo - surprise me with something fun! Pick any cool interactive demo like a particle system, drawing canvas, mini game (snake, pong, memory cards), color mixer, gravity simulator, or bouncing balls. Just build something engaging with HTML, CSS, and JavaScript without asking what I want - be creative!" },
  { label: "📊 Dashboard", prompt: "Code: Create a dashboard interface with HTML and CSS. Include charts, stats, and a clean layout." },
  { label: "🎨 Animation", prompt: "Code: Create a beautiful CSS and JavaScript animation. Make it smooth and eye-catching." },
  { label: "🧮 Calculator", prompt: "Code: Build a calculator using HTML, CSS, and JavaScript. Include a clean UI and proper error handling." },
  { label: "🎯 Landing Page", prompt: "Code: Create a modern landing page with HTML and CSS. Make it responsive and conversion-focused." },
  { label: "🛠️ Form Builder", prompt: "Code: Create an interactive form with validation using HTML, CSS, and JavaScript." },
  { label: "⏱️ Timer App", prompt: "Code: Build a customizable timer or stopwatch with HTML, CSS, and JavaScript. Make it functional and visually appealing." },
  { label: "🎲 Random Generator", prompt: "Code: Create a random generator (quotes, colors, names, etc.) with HTML, CSS, and JavaScript. Make it fun and interactive." },
  { label: "📝 Todo List", prompt: "Code: Build a feature-rich todo list app with HTML, CSS, and JavaScript. Include add, delete, and mark complete functionality." },
  { label: "🎵 Music Player UI", prompt: "Code: Design a music player interface with HTML and CSS. Include controls, progress bar, and album art display." },
  { label: "🌡️ Weather Widget", prompt: "Code: Create a weather widget interface with HTML and CSS. Make it clean and informative." },
  { label: "🎰 Slot Machine", prompt: "Code: Build a simple slot machine game with HTML, CSS, and JavaScript. Include animations and win logic." },
  { label: "📅 Calendar View", prompt: "Code: Create a calendar interface with HTML, CSS, and JavaScript. Make it interactive and navigable." },
  { label: "🎨 Color Palette", prompt: "Code: Build a color palette generator with HTML, CSS, and JavaScript. Let users create and save color schemes." },
  { label: "🔐 Password Generator", prompt: "Code: Create a secure password generator with HTML, CSS, and JavaScript. Include customization options." },
  { label: "📷 Image Gallery", prompt: "Code: Build an image gallery with HTML, CSS, and JavaScript. Include lightbox functionality and smooth transitions." },
];

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

// Generate all prompt categories
export function generateAllPrompts() {
  return {
    chat: generateCategoryPrompts(chatPromptPool, 6),
    create: generateCategoryPrompts(createPromptPool, 6),
    write: generateCategoryPrompts(writePromptPool, 6),
    code: generateCategoryPrompts(codePromptPool, 6),
  };
}

// Generate prompts for a specific category
export function generatePromptsByCategory(category: 'chat' | 'create' | 'write' | 'code'): QuickPrompt[] {
  const pools = {
    chat: chatPromptPool,
    create: createPromptPool,
    write: writePromptPool,
    code: codePromptPool,
  };

  return generateCategoryPrompts(pools[category], 6);
}

// Get all prompts as a flat array (for compatibility with existing code)
export function getAllPromptsFlat(): QuickPrompt[] {
  const generated = generateAllPrompts();
  return [
    ...generated.chat,
    ...generated.create,
    ...generated.write,
    ...generated.code,
  ];
}
