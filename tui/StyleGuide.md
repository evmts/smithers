# TUI Style Guide

## Core Principles

### Modularity
- **Lego Block Files**: Every file should be a focused, reusable "lego block"
- **Single Responsibility**: Each file should handle one clear concern
- **Tight Coupling**: Group tightly related constants, functions, and types together
- **No Premature Abstraction**: Don't abstract things we only use once

### File Organization

#### Constants
- Keep constants close to where they're used
- Layout constants should live in `layout.zig` 
- UI constants should be with their respective UI components
- Never scatter related constants across multiple files

#### Logging
- All logging concerns should be in a dedicated `Logger` struct
- File-based logging configuration should be centralized
- Log levels and formatting should be consistent

#### Help & Documentation
- Help messages should live in dedicated files, not embedded in main logic
- Keep documentation close to the code it documents
- Use clear, concise language

#### Error Handling
- Explicit error handling preferred over hidden failures
- Use Zig's error union types effectively
- Provide meaningful error messages

### Code Structure

#### Functions
- Small, focused functions that do one thing well
- Clear parameter names and return types
- Avoid deeply nested logic when possible

#### Data Structures
- Use appropriate Zig types (structs, unions, enums)
- Keep mutable state minimal and contained
- Prefer composition over inheritance-like patterns

### Naming Conventions
- `snake_case` for functions and variables
- `PascalCase` for types and constants
- `SCREAMING_SNAKE_CASE` for compile-time constants
- Descriptive names over short abbreviations

### Dependencies
- Minimize external dependencies
- Keep vendor code isolated and well-documented
- Prefer standard library solutions when available

## File Structure Guidelines

```
tui/src/
├── main.zig              # Main application logic only
├── logger.zig            # All logging concerns
├── layout.zig            # Layout constants and calculations
├── help.zig              # Help messages and documentation
├── components/           # Reusable UI components
├── commands/             # Command handling
└── ...                   # Other focused modules
```

This structure ensures each file has a clear purpose and related concerns stay together.