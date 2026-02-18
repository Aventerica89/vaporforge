export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateComponentEdit(
  originalContent: string,
  modifiedContent: string,
  componentName: string,
): ValidationResult {
  const errors: string[] = [];

  // Check data-vf-component preserved
  if (!modifiedContent.includes(`data-vf-component="${componentName}"`)) {
    errors.push(
      `data-vf-component="${componentName}" attribute was removed`,
    );
  }

  // Check data-vf-file preserved
  const fileMatch = originalContent.match(/data-vf-file="([^"]+)"/);
  if (fileMatch && !modifiedContent.includes(fileMatch[0])) {
    errors.push('data-vf-file attribute was removed or changed');
  }

  // Check for hardcoded hex colors in style block
  const styleMatch = modifiedContent.match(
    /<style[\s\S]*?>([\s\S]*?)<\/style>/,
  );
  if (styleMatch) {
    const hexPattern = /#[0-9a-fA-F]{3,8}\b/g;
    const hexMatches = styleMatch[1].match(hexPattern);
    if (hexMatches) {
      errors.push(
        `Hardcoded colors found: ${hexMatches.slice(0, 3).join(', ')}. Use CSS custom properties.`,
      );
    }
  }

  // Check frontmatter preserved
  const origFm = originalContent.match(/^---\n([\s\S]*?)\n---/);
  const modFm = modifiedContent.match(/^---\n([\s\S]*?)\n---/);
  if (origFm && !modFm) {
    errors.push('Astro frontmatter (--- block) was removed');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
