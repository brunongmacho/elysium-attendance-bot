# Contributing to ELYSIUM Guild Bot

First off, thank you for considering contributing to the ELYSIUM Guild Bot! It's people like you that make this bot better for everyone. 🎉

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Code Style Guidelines](#code-style-guidelines)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)
- [Testing Guidelines](#testing-guidelines)
- [Documentation Guidelines](#documentation-guidelines)

---

## Code of Conduct

### Our Pledge

We are committed to providing a welcoming and inspiring community for all. Please:

- ✅ Use welcoming and inclusive language
- ✅ Be respectful of differing viewpoints and experiences
- ✅ Gracefully accept constructive criticism
- ✅ Focus on what is best for the community
- ✅ Show empathy towards other community members

### Unacceptable Behavior

- ❌ Harassment, trolling, or discriminatory language
- ❌ Personal or political attacks
- ❌ Publishing others' private information
- ❌ Any conduct which could reasonably be considered inappropriate

---

## How Can I Contribute?

### 🐛 Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

**When reporting a bug, include:**
- Clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Screenshots (if applicable)
- Your environment:
  - Node.js version
  - Operating system
  - Bot version
- Relevant log output (use code blocks)

**Example Bug Report:**
```markdown
## Bug: Bot crashes when closing empty attendance thread

**Steps to Reproduce:**
1. Create attendance thread with !addthread
2. Don't add any members
3. Try to close with !close

**Expected:** Thread closes gracefully
**Actual:** Bot crashes with TypeError

**Environment:**
- Node.js: v18.17.0
- OS: Ubuntu 22.04
- Bot version: 9.0.0

**Logs:**
```
TypeError: Cannot read property 'length' of undefined
  at index2.js:7890
```
```

### 💡 Suggesting Features

We love feature suggestions! Before submitting:

1. **Check if it already exists** in issues or discussions
2. **Consider if it fits the project scope** - This is a guild management bot for MMORPGs
3. **Think about implementation** - Can you help build it?

**Feature Request Template:**
```markdown
## Feature: [Clear, concise title]

**Problem:** What problem does this solve?

**Proposed Solution:** How should it work?

**Alternatives Considered:** Any other approaches?

**Additional Context:** Screenshots, mockups, examples
```

### 🔧 Contributing Code

1. **Find an issue** to work on or create one
2. **Comment on the issue** to let others know you're working on it
3. **Fork the repository**
4. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
5. **Make your changes**
6. **Test thoroughly**
7. **Commit with clear messages** (see [Commit Guidelines](#commit-message-guidelines))
8. **Push to your fork**
9. **Open a Pull Request**

---

## Development Setup

### Prerequisites

- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **Git** >= 2.30.0
- **Discord Bot Token** - [Get one here](https://discord.com/developers/applications)
- **Google Sheets API** access

### Initial Setup

```bash
# 1. Fork and clone the repository
git clone https://github.com/YOUR_USERNAME/elysium-attendance-bot.git
cd elysium-attendance-bot

# 2. Install dependencies
npm install

# 3. Set up configuration
cp config.example.json config.json
# Edit config.json with your test server IDs and tokens

# 4. Set up environment variables (optional)
cp .env.example .env
# Edit .env if using environment-based config

# 5. Run tests to verify setup
npm test

# 6. Start the bot in development mode
npm start
```

### Recommended Development Tools

- **VS Code** with extensions:
  - ESLint
  - Prettier
  - JavaScript (ES6) code snippets
  - Discord.js IntelliSense
- **PM2** for process management
- **Nodemon** for auto-restart during development

---

## Code Style Guidelines

### General Principles

- **Clarity over cleverness** - Write code that's easy to understand
- **DRY (Don't Repeat Yourself)** - Extract common logic into functions
- **KISS (Keep It Simple, Stupid)** - Simplest solution that works
- **YAGNI (You Aren't Gonna Need It)** - Don't add features you don't need yet

### JavaScript Style

```javascript
// ✅ GOOD: Use ES6+ features
const users = await getUsers();
const activeUsers = users.filter(u => u.isActive);

// ❌ BAD: Old-style var and callbacks
var users;
getUsers(function(result) {
  var activeUsers = [];
  for (var i = 0; i < result.length; i++) {
    if (result[i].isActive) activeUsers.push(result[i]);
  }
});

// ✅ GOOD: Async/await for promises
async function fetchUserData(userId) {
  try {
    const user = await database.getUser(userId);
    const stats = await database.getStats(userId);
    return { user, stats };
  } catch (error) {
    console.error('Failed to fetch user data:', error);
    throw error;
  }
}

// ❌ BAD: Promise chains
function fetchUserData(userId) {
  return database.getUser(userId)
    .then(user => {
      return database.getStats(userId)
        .then(stats => {
          return { user, stats };
        });
    })
    .catch(error => {
      console.error('Failed to fetch user data:', error);
      throw error;
    });
}
```

### Naming Conventions

- **Variables & Functions**: `camelCase`
  ```javascript
  const userName = 'Alice';
  function calculateTotalPoints() { }
  ```

- **Constants**: `SCREAMING_SNAKE_CASE`
  ```javascript
  const MAX_RETRIES = 3;
  const API_TIMEOUT = 5000;
  ```

- **Classes**: `PascalCase`
  ```javascript
  class IntelligenceEngine { }
  class SheetAPI { }
  ```

- **Private Functions**: Prefix with underscore (convention)
  ```javascript
  function _internalHelper() { }
  ```

### Error Handling

```javascript
// ✅ GOOD: Comprehensive error handling
async function submitAttendance(members) {
  try {
    validateMembers(members);
    const result = await sheetAPI.submitData(members);
    console.log('✅ Attendance submitted successfully');
    return result;
  } catch (error) {
    console.error('❌ Failed to submit attendance:', error);
    // Use centralized error handler
    await errorHandler.handle(error, 'submitAttendance');
    throw error; // Re-throw to let caller handle
  }
}

// ❌ BAD: Silent failures
async function submitAttendance(members) {
  try {
    await sheetAPI.submitData(members);
  } catch (error) {
    // Silent failure - don't do this!
  }
}
```

### Comments & Documentation

```javascript
// ✅ GOOD: Explain WHY, not WHAT
// Skip duplicate check for maintenance threads to avoid API rate limits
if (!isMaintenanceThread) {
  await checkForDuplicates(threadId);
}

// ❌ BAD: State the obvious
// Check if not maintenance thread
if (!isMaintenanceThread) {
  await checkForDuplicates(threadId);
}

/**
 * ✅ GOOD: JSDoc for complex functions
 * Calculates engagement score based on attendance and bidding history
 *
 * @param {string} userId - Discord user ID
 * @param {number} days - Number of days to analyze (default: 30)
 * @returns {Promise<number>} Engagement score (0-100)
 * @throws {Error} If user not found or data unavailable
 */
async function calculateEngagementScore(userId, days = 30) {
  // Implementation
}
```

### File Organization

```javascript
// Preferred structure for module files:

/**
 * File header with description
 */

// ========================================
// SECTION 1: IMPORTS
// ========================================
const requiredModule = require('./module');

// ========================================
// SECTION 2: CONSTANTS
// ========================================
const MAX_RETRIES = 3;

// ========================================
// SECTION 3: HELPER FUNCTIONS
// ========================================
function helperFunction() { }

// ========================================
// SECTION 4: MAIN EXPORTS
// ========================================
module.exports = {
  mainFunction,
  anotherFunction
};
```

### Performance Considerations

```javascript
// ✅ GOOD: Cache expensive operations
const bossThumbnailCache = new Map();
function getBossThumbnail(bossName) {
  if (bossThumbnailCache.has(bossName)) {
    return bossThumbnailCache.get(bossName);
  }
  const thumbnail = fetchThumbnail(bossName);
  bossThumbnailCache.set(bossName, thumbnail);
  return thumbnail;
}

// ❌ BAD: Repeated expensive operations
function getBossThumbnail(bossName) {
  return fetchThumbnail(bossName); // Fetches every time
}
```

---

## Commit Message Guidelines

We follow [Conventional Commits](https://www.conventionalcommits.org/) for clear, semantic version history.

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: New feature
- **fix**: Bug fix
- **docs**: Documentation changes
- **style**: Code style (formatting, missing semicolons, etc.)
- **refactor**: Code refactoring (no functional changes)
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Maintenance tasks (dependencies, build, etc.)

### Examples

```bash
# Simple feature
feat: add boss thumbnail support to spawn messages

# Bug fix with scope
fix(attendance): prevent duplicate thread creation for scheduled bosses

# Breaking change
feat!: migrate to Discord.js v14 API

BREAKING CHANGE: Message intents now required in bot configuration

# Multiple paragraphs
feat: implement channel-aware help system

- Detects channel type (attendance, auction, guild chat, etc.)
- Filters commands based on channel and user permissions
- Shows only relevant commands to reduce confusion

Closes #123
```

---

## Pull Request Process

### Before Submitting

1. ✅ **Test your changes** - Run `npm test` and manual testing
2. ✅ **Update documentation** - README, JSDoc, inline comments
3. ✅ **Check code style** - Follow guidelines above
4. ✅ **Update CHANGELOG.md** - Add your changes under "Unreleased"
5. ✅ **Rebase on main** - Ensure clean merge
   ```bash
   git fetch upstream
   git rebase upstream/main
   ```

### Pull Request Template

```markdown
## Description
[Clear description of what this PR does]

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## How Has This Been Tested?
- [ ] Manual testing in test Discord server
- [ ] Unit tests added/updated
- [ ] Integration tests pass

## Checklist
- [ ] My code follows the code style of this project
- [ ] I have updated the documentation accordingly
- [ ] I have added tests to cover my changes
- [ ] All new and existing tests passed
- [ ] I have updated CHANGELOG.md

## Related Issues
Closes #123
Related to #456
```

### Review Process

1. **Automated checks** must pass (tests, linting)
2. **At least one approval** from a maintainer
3. **No merge conflicts** with main branch
4. **Documentation updated** if needed

Maintainers may:
- Request changes
- Ask questions for clarification
- Suggest improvements
- Approve and merge

---

## Testing Guidelines

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run syntax validation
node __tests__/test-runner.js
```

### Writing Tests

```javascript
// Example test structure
describe('calculateEngagementScore', () => {
  it('should return 100 for perfect attendance', async () => {
    const userId = 'user123';
    const score = await calculateEngagementScore(userId, 30);
    expect(score).toBe(100);
  });

  it('should throw error for non-existent user', async () => {
    await expect(calculateEngagementScore('invalid'))
      .rejects.toThrow('User not found');
  });
});
```

### Manual Testing Checklist

For major changes, test:
- [ ] Attendance thread creation and closure
- [ ] Auction bidding flow
- [ ] Admin commands (with confirmation prompts)
- [ ] Emergency recovery commands
- [ ] Help system in different channels
- [ ] Error handling (invalid inputs, network failures)
- [ ] Memory usage (check for leaks)

---

## Documentation Guidelines

### Code Documentation

- **JSDoc** for all exported functions
- **Inline comments** for complex logic
- **Section headers** for file organization
- **README updates** for user-facing changes

### README Updates

When adding features that users interact with:

1. Add to **Features** section
2. Add to **Commands** section (if applicable)
3. Update **Table of Contents**
4. Add usage examples
5. Update screenshots/GIFs if needed

### CHANGELOG Updates

Add your changes under `## [Unreleased]`:

```markdown
## [Unreleased]

### Added
- Channel-aware help system v10.0

### Fixed
- Close command errors with zero attendees

### Changed
- Updated discord.js to v14.25.1
```

---

## Questions?

- **Discord**: Join our Discord server [link]
- **GitHub Issues**: [Open an issue](https://github.com/brunongmacho/elysium-attendance-bot/issues)
- **Email**: [Contact email]

---

## Recognition

Contributors will be:
- Listed in [README.md](./README.md) credits
- Mentioned in release notes
- Appreciated with our heartfelt thanks! ❤️

Thank you for contributing to ELYSIUM Guild Bot! 🎉
