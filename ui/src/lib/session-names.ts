// Memorable session name generator
// Produces names like "phoenix-42", "tango-7", "cobalt-18"

const WORDS = [
  'alpha', 'bravo', 'charlie', 'delta', 'echo',
  'foxtrot', 'gamma', 'helix', 'indigo', 'jade',
  'kilo', 'lunar', 'mesa', 'nova', 'omega',
  'phoenix', 'quartz', 'raven', 'sierra', 'tango',
  'umbra', 'vortex', 'whisper', 'xenon', 'yukon',
  'zenith', 'cobalt', 'ember', 'frost', 'glyph',
  'harbor', 'ivory', 'jasper', 'krypton', 'lapis',
  'mantis', 'nebula', 'onyx', 'prism', 'ridge',
  'sable', 'talon', 'vapor', 'wren', 'zephyr',
  'atlas', 'bolt', 'cipher', 'drift', 'flare',
  'grove', 'haze', 'ion', 'jetson', 'keystone',
];

export function generateSessionName(): string {
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const num = Math.floor(Math.random() * 99) + 1;
  return `${word}-${num}`;
}
