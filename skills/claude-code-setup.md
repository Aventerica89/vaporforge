# Claude Code Setup Skill

Analyze codebases and provide setup recommendations.

## Analysis Steps

1. **Project Detection**
   - Identify project type (Next.js, React, Node, Python, etc.)
   - Detect package manager (npm, yarn, pnpm, bun)
   - Find configuration files

2. **Dependency Analysis**
   - Check package.json / requirements.txt
   - Identify outdated packages
   - Flag security vulnerabilities

3. **Structure Analysis**
   - Map directory structure
   - Identify entry points
   - Document key files

4. **Configuration Review**
   - Check TypeScript config
   - Review linting setup
   - Verify build configuration

5. **Recommendations**
   - Suggest missing configurations
   - Recommend best practices
   - Identify potential improvements

## Output Format

```
## Project Summary
- Type: [detected type]
- Package Manager: [detected manager]
- Framework: [detected framework]

## Key Files
- Entry: [entry files]
- Config: [config files]
- Tests: [test files]

## Recommendations
1. [recommendation 1]
2. [recommendation 2]
...
```

## Commands

- `/setup analyze` - Run full analysis
- `/setup deps` - Check dependencies
- `/setup config` - Review configurations
- `/setup recommend` - Get recommendations
