# IntelliComment Engine

A smart static analysis and documentation tool for JavaScript functions. Automatically generates JSDoc comments and visualizes Control Flow Graphs — powered by a **hybrid parsing system** (Manual Recursive Descent + Espree fallback).

## Features

- **Automatic JSDoc Generation**: Analyzes your JavaScript functions using AST traversal and injects perfectly formatted JSDoc comments with inferred parameter types, return types, recursion detection, and code pattern analysis.
- **Control Flow Graph (CFG) Visualization**: Renders beautiful, color-coded flowcharts of your function logic directly inside VS Code — with proper Start/End nodes, True/False edge labels, loop decomposition, and recursive back-edges.
- **Hybrid Parsing System**: Attempts parsing with a custom-built Recursive Descent parser first; automatically falls back to Espree for complex syntax.
- **Static Type Inference**: Infers parameter and return types by tracking variable assignments, binary operations, and method calls throughout the function body.
- **Recursion Detection**: Identifies recursive functions, extracts base conditions, and describes the recursive step in human-readable language.
- **Code Quality Warnings**: Detects unused variables, unreachable code, and potential infinite loops.

## How to Run & Test the Extension (Development)

1. Open this project folder in VS Code.
2. Run `npm install` in the terminal to install dependencies.
3. Press **`F5`** to launch the **Extension Development Host**. A new VS Code window will open with the extension loaded.
4. In the new window, open any JavaScript file.

## Usage Guide

Once the extension is running (or installed), follow these steps:

1. **Select the function**: Open a JavaScript file and use your mouse to **completely highlight the function** you want to process (from `function` keyword to the closing `}`).
2. **Generate JSDoc**: With the code selected, press **`Ctrl+Alt+D`**. A JSDoc comment block will be automatically injected above the function.
3. **Show CFG**: With the code selected, press **`Ctrl+Alt+G`**. A new panel will open displaying the Control Flow Graph.

## Project Architecture

| Module | Role |
| :--- | :--- |
| `parser/` | Hybrid parsing (Manual Recursive Descent + Espree fallback) |
| `extractors/` | Extracts function metadata (name, params, return type) |
| `analyzer/` | Static analysis, CFG generation, recursion & loop detection |
| `generators/` | Builds JSDoc comment strings from analyzed metadata |
| `injectors/` | Injects generated comments back into the editor |
| `utils/` | Type inference utilities |
| `extension.js` | VS Code extension entry point, command registration |

## Tech Stack

- **VS Code Extension API** — Extension host and editor integration
- **Espree** — Full JavaScript parser (ESTree-compliant AST)
- **viz.js** — Graphviz DOT rendering engine for CFG visualization
- **Custom Recursive Descent Parser** — Manual tokenizer + parser for basic JS

## Installation from .vsix

1. Open VS Code.
2. Go to the **Extensions** panel (`Ctrl+Shift+X`).
3. Click the **`...`** menu (top-right of the panel).
4. Select **"Install from VSIX..."**.
5. Choose the `.vsix` file and click Install.
6. Reload VS Code when prompted.

## License

MIT
