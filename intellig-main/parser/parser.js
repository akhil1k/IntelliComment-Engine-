const espree = require('espree');

class ManualParser {
    constructor(code) {
        this.code = code;
        this.current = 0;
        this.tokens = [];
        this.tokenize();
    }

    tokenize() {
        // Simple regex tokenizer handling: identifiers, numbers, punts, keywords, operators 
        const regex = /\s*(?:(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|([(){}\[\],;])|([+\-*/%<>=!&|]+)|([a-zA-Z_$][a-zA-Z0-9_$]*)|(\d+(?:\.\d+)?)|("[^"]*")|('[^']*'))\s*/g;
        let match;
        while ((match = regex.exec(this.code)) !== null) {
            if (match[1] || match[2]) continue; // skip comments
            let value = match[0].trim();
            if (!value) continue;
            let type = "UNKNOWN";
            if (match[3]) type = "PUNCT";
            else if (match[4]) type = "OP";
            else if (match[5]) type = ["function", "return", "let", "const", "var"].includes(value) ? "KW" : "ID";
            else if (match[6]) type = "NUM";
            else if (match[7] || match[8]) type = "STR";
            
            this.tokens.push({ type, value });
        }
    }

    peek() { return this.tokens[this.current]; }
    consume() { return this.tokens[this.current++]; }
    match(val) { 
        if (this.peek() && this.peek().value === val) return this.consume();
        return null;
    }

    parseProgram() {
        const body = [];
        while (this.current < this.tokens.length) {
            const stmt = this.parseStatement();
            body.push(stmt);
        }
        return { type: "Program", body, sourceType: "script" };
    }

    parseStatement() {
        const token = this.peek();
        if (!token) throw new Error("Unexpected end of input");
        if (token.type === "KW" && token.value === "function") {
            return this.parseFunctionDeclaration();
        }
        throw new Error("Manual parser currently only supports top-level Function Declarations");
    }

    parseFunctionDeclaration() {
        this.consume(); // consume 'function'
        const idToken = this.consume();
        if (!idToken || idToken.type !== "ID") throw new Error("Expected function identifier");
        const id = { type: "Identifier", name: idToken.value };
        
        if (!this.match("(")) throw new Error("Expected (");
        
        const params = [];
        if (!this.match(")")) {
            do {
                const paramToken = this.consume();
                if (!paramToken || paramToken.type !== "ID") throw new Error("Expected param identifier");
                params.push({ type: "Identifier", name: paramToken.value });
            } while (this.match(","));
            if (!this.match(")")) throw new Error("Expected )");
        }
        
        const body = this.parseBlockStatement();
        return { type: "FunctionDeclaration", id, params, body };
    }

    parseBlockStatement() {
        if (!this.match("{")) throw new Error("Expected {");
        const body = [];
        while (this.peek() && this.peek().value !== "}") {
            const token = this.peek();
            if (token.type === "KW" && ["let", "const", "var"].includes(token.value)) {
                body.push(this.parseVariableDeclaration());
            } else if (token.type === "KW" && token.value === "return") {
                body.push(this.parseReturnStatement());
            } else {
                throw new Error(`Unsupported statement block token: ${token.value}`);
            }
        }
        if (!this.match("}")) throw new Error("Expected }");
        return { type: "BlockStatement", body };
    }

    parseVariableDeclaration() {
        const kind = this.consume().value; // let | const | var
        const idToken = this.consume();
        if (!idToken || idToken.type !== "ID") throw new Error("Expected variable identifier");
        const id = { type: "Identifier", name: idToken.value };
        
        let init = null;
        if (this.match("=")) {
            init = this.parseExpression();
        }
        this.match(";"); // optional semi logic omitted for brevity, requiring it here
        return { type: "VariableDeclaration", kind, declarations: [{ type: "VariableDeclarator", id, init }] };
    }

    parseReturnStatement() {
        this.consume(); // return
        let argument = null;
        if (this.peek() && this.peek().value !== ";" && this.peek().value !== "}") {
            argument = this.parseExpression();
        }
        this.match(";");
        return { type: "ReturnStatement", argument };
    }

    parseExpression() {
        const left = this.parsePrimary();
        if (this.peek() && this.peek().type === "OP") {
            const operator = this.consume().value;
            const right = this.parsePrimary();
            return { type: "BinaryExpression", operator, left, right };
        }
        return left;
    }

    parsePrimary() {
        const token = this.consume();
        if (!token) throw new Error("Unexpected end of input during expression parsing");
        if (token.type === "ID") return { type: "Identifier", name: token.value };
        if (token.type === "NUM") return { type: "Literal", value: Number(token.value), raw: token.value };
        if (token.type === "STR") return { type: "Literal", value: token.value.slice(1,-1), raw: token.value };
        throw new Error(`Unsupported expression token: ${token.value}`);
    }
}

function parseWithManualParser(code) {
    const parser = new ManualParser(code);
    return parser.parseProgram();
}

/**
 * Parses JavaScript code and returns the Abstract Syntax Tree (AST).
 * First attempts to use a custom Manual Parser. If unsupported syntax
 * is detected, it falls back to the robust Espree compiler.
 *
 * @param {string} code - The JavaScript code to parse.
 * @returns {Object} - The parsed AST and parserType.
 */
function parseCode(code) {
    try {
        const ast = parseWithManualParser(code);
        console.log("Parsed using Manual Parser");
        // Maintain AST shape compatibility and append active parser type!
        ast.parserType = "manual";
        return ast;
    } catch (manualError) {
        console.warn(`Manual parser failed (${manualError.message}), switching to Espree`);
        try {
            const ast = espree.parse(code, {
                ecmaVersion: 'latest',
                sourceType: 'script',
                loc: true,
                range: true,
                tokens: true
            });
            ast.parserType = "espree";
            return ast;
        } catch (espreeError) {
            throw espreeError; // Fatal Syntax error in file overall
        }
    }
}
function tokenizeCode(code) {
    // Return only the tokens array
    const ast = espree.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        tokens: true
    });
    return ast.tokens;
}

function getParseTree(code) {
    // Return the full AST for demonstration
    return espree.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        loc: true,
        range: true,
        tokens: true
    });
}

module.exports = { parseCode, tokenizeCode, getParseTree };