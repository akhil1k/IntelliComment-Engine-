const vscode = require('vscode');
const { extractFunctions } = require('./extractors/functionExtractor');
const { generateJSDoc } = require('./generators/JsDocGenerator');
const { cfgToDot } = require('./analyzer/CfgGenerator');
const Viz = require('viz.js');
const { Module, render } = require('viz.js/full.render.js');

/**
 * Checks if there is a JSDoc comment immediately before the function.
 * @param {vscode.TextDocument} document
 * @param {number} funcStart - Offset of function start
 * @returns {boolean}
 */
function hasJSDocAbove(document, funcStart) {
    const funcPos = document.positionAt(funcStart);
    let line = funcPos.line - 1;
    // Scan upwards, skipping blank lines and single-line comments
    while (line >= 0) {
        const text = document.lineAt(line).text.trim();
        if (text === '') {
            line--;
            continue;
        }
        // If we hit a non-Javadoc comment or code, stop
        if (!text.startsWith('*') && !text.startsWith('/**') && !text.startsWith('*') && !text.startsWith('*/')) {
            return false;
        }
        // If we find the start of a JSDoc comment
        if (text.startsWith('/**')) {
            return true;
        }
        // If we find the end of a block comment but not a JSDoc, stop
        if (text.startsWith('/*') && !text.startsWith('/**')) {
            return false;
        }
        line--;
    }
    return false;
}

function activate(context) {
    let disposable = vscode.commands.registerCommand('intellicomment-engine.analyzeFile', async function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const code = editor.document.getText();
        const selection = editor.selection;

        // Only proceed if there is a selection
        if (selection.isEmpty) {
            vscode.window.showInformationMessage('Please select a function to generate a JSDoc comment.');
            return;
        }

        // Run your analysis
        const functions = extractFunctions(code);

        // Find all functions overlapping with the selection
        const selStart = editor.document.offsetAt(selection.start);
        const selEnd = editor.document.offsetAt(selection.end);
        const targetFunctions = functions.filter(
            func => func.end > selStart && func.start < selEnd
        );
        if (targetFunctions.length === 0) {
            vscode.window.showWarningMessage('No function found at selection.');
            return;
        }

        // Prepare edits
        const edit = new vscode.WorkspaceEdit();
        const uri = editor.document.uri;

        // Sort by start descending to avoid offset issues
        const sortedFunctions = [...targetFunctions].sort((a, b) => b.start - a.start);

        let injected = false;
        for (const func of sortedFunctions) {
            if (hasJSDocAbove(editor.document, func.start)) {
                // Already has a JSDoc comment, skip
                continue;
            }
            const jsdoc = generateJSDoc(func) + '\n';
            const pos = editor.document.positionAt(func.start);
            edit.insert(uri, pos, jsdoc);
            injected = true;
        }

        if (injected) {
            await vscode.workspace.applyEdit(edit);
            vscode.window.showInformationMessage('JSDoc comment(s) injected!');
        } else {
            vscode.window.showInformationMessage('All selected functions already have JSDoc comments.');
        }
    });

    context.subscriptions.push(disposable);

    let disposableCFG = vscode.commands.registerCommand('intellicomment-engine.showCFG', async function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const code = editor.document.getText();
        const selection = editor.selection;

        if (selection.isEmpty) {
            vscode.window.showInformationMessage('Please select a function to visualize its CFG.');
            return;
        }

        const functions = extractFunctions(code);
        const selStart = editor.document.offsetAt(selection.start);
        const selEnd = editor.document.offsetAt(selection.end);
        // Find all functions overlapping with the selection
        const targetFunctions = functions.filter(
            func => func.end > selStart && func.start < selEnd
        );
        if (targetFunctions.length === 0) {
            vscode.window.showWarningMessage('No function found at selection.');
            return;
        }

        for (const func of targetFunctions) {                                                                                                                                                       
            // Generate DOT for the selected function's CFG
            const dot = cfgToDot(func.cfg, func.name);

            const vizInstance = new Viz({ Module, render });
            let svg;
            try {
                svg = await vizInstance.renderString(dot);
            } catch (err) {
                vscode.window.showErrorMessage(`Failed to render CFG for ${func.name}: ${err.message}`);
                continue;
            }

            // Show SVG in a webview
            const panel = vscode.window.createWebviewPanel(
                'cfgView',
                `CFG: ${func.name}`,
                vscode.ViewColumn.Beside,
                { enableScripts: true }
            );
            panel.webview.html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    font-family: var(--vscode-font-family, 'Segoe UI', Arial, sans-serif);
                    background-color: var(--vscode-editor-background);
                    color: var(--vscode-editor-foreground);
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    padding: 20px;
                }
                .svg-container {
                    background-color: #ffffff;
                    border-radius: 8px;
                    padding: 20px;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                    margin-top: 20px;
                    max-width: 100%;
                    overflow: auto;
                }
                h2 {
                    margin-bottom: 0px;
                    color: var(--vscode-editor-foreground);
                }
                svg {
                    max-width: 100%;
                    height: auto;
                }
            </style>
        </head>
        <body>
            <h2>Control Flow Graph: ${func.name}</h2>
            <div class="svg-container">${svg}</div>
        </body>
        </html>
    `;
        }
    });

    context.subscriptions.push(disposableCFG);
}

exports.activate = activate;