interface QuickPrompt {
  label: string;
  prompt: string;
}

// Pools of prompt variations for each category
const chatPromptPool = [
  { label: "💭 Reflect", prompt: "Walk me through a guided reflection on where I've been, what I've learned, and where I'm heading." },
  { label: "🧘 Check-in", prompt: "Help me do a real wellness check. Ask me about my mood, energy, and what's on my mind, then give me honest feedback." },
  { label: "🎯 Focus", prompt: "Help me set up a focused work session. Guide me through planning a productive sprint." },
  { label: "💬 Chat", prompt: "Let's have a casual conversation. Ask me about my day and chat like we're catching up." },
  { label: "🤝 Advice", prompt: "I have a situation I need advice on. Help me think through a decision or challenge I'm facing." },
  { label: "🙏 Gratitude", prompt: "Lead me through a quick gratitude exercise to help me appreciate the good things in my life." },
  { label: "🌟 Daily Intent", prompt: "Help me set a clear intention for today. What do I want to focus on and accomplish?" },
  { label: "🧠 Brainstorm", prompt: "I have an idea I want to explore. Let's brainstorm together and see where it takes us." },
  { label: "💡 Problem-Solve", prompt: "Walk me through solving a problem I'm stuck on. Help me break it down step by step." },
  { label: "🌱 Growth Check", prompt: "Let's discuss my personal growth. What areas am I improving in? Where can I push further?" },
  { label: "🎨 Creative Spark", prompt: "Help me unlock some creative energy. Give me an exercise or prompt to get my imagination flowing." },
  { label: "📚 Learn Something", prompt: "Teach me something fascinating I don't know. Make it engaging and memorable." },
  { label: "🔮 Future Vision", prompt: "Help me visualize where I want to be in the future. Let's think big and dream together." },
  { label: "⚡ Energy Boost", prompt: "I need a mental pick-me-up. Share something inspiring or motivating to energize me." },
  { label: "🎭 Role Play", prompt: "Let's role-play a scenario to help me practice a conversation or situation I'm preparing for." },
  { label: "🌈 Perspective Shift", prompt: "Help me look at a situation from a completely different angle. Challenge my assumptions." },
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
  { label: "📖 Short Story", prompt: "Help me write a compelling short story. Guide me through character development, plot, and an engaging narrative." },
  { label: "✍️ Personal Essay", prompt: "Help me craft a personal essay about a meaningful experience. Let's explore themes and structure together." },
  { label: "💌 Heartfelt Letter", prompt: "Help me write a sincere, heartfelt letter to someone important. Let's make it authentic and meaningful." },
  { label: "🎭 Screenplay Scene", prompt: "Help me write a cinematic scene with dialogue and action. Let's create something visually compelling." },
  { label: "📝 Blog Post", prompt: "Help me write an engaging blog post on a topic I care about. Let's make it conversational and insightful." },
  { label: "🖋️ Poetry", prompt: "Help me write a poem that captures emotion and imagery. Let's explore different styles and find the right voice." },
  { label: "🎤 Speech Draft", prompt: "Help me write a powerful speech for an important occasion. Let's make it memorable and impactful." },
  { label: "📰 Article Outline", prompt: "Help me outline an article on a topic I'm passionate about. Let's structure it for maximum engagement." },
  { label: "🎯 Mission Statement", prompt: "Help me write a personal mission statement that captures my values, goals, and purpose." },
  { label: "💭 Stream of Consciousness", prompt: "Let's do a free-writing exercise. Help me capture my thoughts in a raw, unfiltered way." },
  { label: "📜 Backstory", prompt: "Help me develop a compelling backstory for a character or project. Let's add depth and history." },
  { label: "🌟 Manifesto", prompt: "Help me write a manifesto about something I believe in strongly. Make it bold and passionate." },
  { label: "📔 Journal Entry", prompt: "Guide me in writing a reflective journal entry about something significant happening in my life." },
  { label: "🎨 Creative Brief", prompt: "Help me write a creative brief for a project I'm planning. Let's nail down the vision and details." },
  { label: "✉️ Thank You Note", prompt: "Help me write a genuine thank you note that expresses real appreciation and gratitude." },
  { label: "🎬 Plot Twist", prompt: "Help me develop an unexpected plot twist for a story I'm working on. Make it surprising yet logical." },
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
