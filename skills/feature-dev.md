# Feature Development Skill

A structured 7-phase approach to feature development.

## Phases

### Phase 1: Requirements Analysis
- Understand the user's request
- Identify acceptance criteria
- List constraints and dependencies

### Phase 2: Design
- Plan the architecture
- Identify files to create/modify
- Consider edge cases

### Phase 3: Test Planning
- Write test cases before implementation
- Include unit, integration, and E2E tests
- Aim for 80%+ coverage

### Phase 4: Implementation
- Follow TDD: write failing tests first
- Implement minimal code to pass tests
- Use immutable patterns

### Phase 5: Code Review
- Self-review for quality issues
- Check for security vulnerabilities
- Verify error handling

### Phase 6: Documentation
- Update relevant docs
- Add inline comments where necessary
- Update README if applicable

### Phase 7: Verification
- Run all tests
- Verify acceptance criteria
- Final code review

## Usage

When implementing a feature, follow each phase sequentially. Document progress and decisions at each step.

## Commands

- `/feature-dev start <description>` - Begin feature development
- `/feature-dev status` - Show current phase
- `/feature-dev next` - Move to next phase
- `/feature-dev complete` - Mark feature as complete
