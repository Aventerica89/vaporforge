/**
 * Pre-processes incomplete markdown from streaming to prevent broken renders.
 * Closes unclosed code fences, inline code, bold/italic, and table rows.
 */
export function prepareStreamingMarkdown(content: string): string {
  let result = content;

  // 1. Close unclosed fenced code blocks (triple backtick)
  const fenceMatches = result.match(/```/g);
  if (fenceMatches && fenceMatches.length % 2 !== 0) {
    result += '\n```';
  }

  // 2. Close unclosed inline code (single backtick, not inside fences)
  //    Only count backticks outside of fenced code blocks
  const withoutFences = result.replace(/```[\s\S]*?```/g, '');
  const inlineBackticks = withoutFences.match(/`/g);
  if (inlineBackticks && inlineBackticks.length % 2 !== 0) {
    result += '`';
  }

  // 3. Close unclosed bold (**) — count outside code blocks
  const withoutCode = withoutFences.replace(/`[^`]*`/g, '');
  const boldMatches = withoutCode.match(/\*\*/g);
  if (boldMatches && boldMatches.length % 2 !== 0) {
    result += '**';
  }

  // 4. Close unclosed italic (*) — count remaining single asterisks
  //    After removing bold pairs, check for unpaired single asterisks
  const withoutBold = withoutCode.replace(/\*\*/g, '');
  const italicMatches = withoutBold.match(/(?<!\*)\*(?!\*)/g);
  if (italicMatches && italicMatches.length % 2 !== 0) {
    result += '*';
  }

  // 5. Close unclosed strikethrough (~~)
  const strikeMatches = withoutCode.match(/~~/g);
  if (strikeMatches && strikeMatches.length % 2 !== 0) {
    result += '~~';
  }

  // 6. Fix incomplete table rows (starts with | but no trailing |)
  const lines = result.split('\n');
  const lastLine = lines[lines.length - 1];
  if (lastLine && lastLine.trimStart().startsWith('|') && !lastLine.trimEnd().endsWith('|')) {
    lines[lines.length - 1] = lastLine + ' |';
    result = lines.join('\n');
  }

  // 7. Close unclosed math blocks ($$)
  const mathBlockMatches = result.match(/\$\$/g);
  if (mathBlockMatches && mathBlockMatches.length % 2 !== 0) {
    result += '\n$$';
  }

  // 8. Close unclosed inline math ($) — outside code and math blocks
  const withoutMathBlocks = result.replace(/\$\$[\s\S]*?\$\$/g, '');
  const inlineMath = withoutMathBlocks.match(/(?<!\$)\$(?!\$)/g);
  if (inlineMath && inlineMath.length % 2 !== 0) {
    result += '$';
  }

  return result;
}
