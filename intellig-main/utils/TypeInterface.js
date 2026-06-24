function walk(node, visitor) {
    if (!node) return;
    visitor(node);
    for (const key in node) {
        if (node[key] && typeof node[key] === 'object') {
            if (Array.isArray(node[key])) {
                node[key].forEach(child => walk(child, visitor));
            } else {
                walk(node[key], visitor);
            }
        }
    }
}

function inferParamType(paramName, body) {
    if (!body || !body.body) return 'any';
    let types = new Set();

    walk(body, (node) => {
        // Arithmetic Operations (+, -, *, /, %, **, unary -)
        if (node.type === 'BinaryExpression' && ['+', '-', '*', '/', '%', '**'].includes(node.operator)) {
            if ((node.left.type === 'Identifier' && node.left.name === paramName) ||
                (node.right.type === 'Identifier' && node.right.name === paramName)) {
                types.add('number');
            }
        }
        
        // Comparisons (>, <, >=, <=) usually for numbers, (===, !==) can be anything
        if (node.type === 'BinaryExpression' && ['>', '<', '>=', '<='].includes(node.operator)) {
            if ((node.left.type === 'Identifier' && node.left.name === paramName) ||
                (node.right.type === 'Identifier' && node.right.name === paramName)) {
                types.add('number');
            }
        }

        // Boolean Context (IfStatement, WhileStatement, DoWhileStatement test, LogicalExpression)
        if ((node.type === 'IfStatement' || node.type === 'WhileStatement' || node.type === 'DoWhileStatement') && 
            node.test && node.test.type === 'Identifier' && node.test.name === paramName) {
            types.add('boolean');
        }
        if (node.type === 'LogicalExpression' && 
           ((node.left.type === 'Identifier' && node.left.name === paramName) ||
            (node.right.type === 'Identifier' && node.right.name === paramName))) {
            types.add('boolean');
        }

        // Object property access (e.g., paramName.property)
        if (node.type === 'MemberExpression' && node.object.type === 'Identifier' && node.object.name === paramName) {
            const propName = node.property.name;
            // String methods
            if (['toUpperCase', 'toLowerCase', 'split', 'substring', 'substr', 'trim'].includes(propName)) {
                types.add('string');
            }
            // Array methods/properties
            else if (['map', 'filter', 'reduce', 'forEach', 'push', 'pop', 'length'].includes(propName)) {
                types.add('array');
            } else {
                types.add('object');
            }
        }
        
        // Fetch argument
        if (node.type === 'CallExpression' && node.callee.name === 'fetch' && node.arguments.length > 0) {
            if (node.arguments[0].type === 'Identifier' && node.arguments[0].name === paramName) {
                types.add('string');
            }
        }
    });

    if (types.has('number') && types.has('string')) {
        // '+' operator can be used for string concatenation too. But if it's mixed with other hints...
        return Array.from(types).join(' | ');
    }
    if (types.size === 0) return 'any';
    // Remove 'any' if we found concrete types
    types.delete('any');
    return Array.from(types).join(' | ');
}

function inferNodeReturnType(returnExpr, variableTypes) {
    if (!returnExpr) return 'void';
    
    if (returnExpr.type === 'BinaryExpression') {
        if (['>', '<', '>=', '<=', '==', '!=', '===', '!=='].includes(returnExpr.operator)) {
            return 'boolean';
        }
        if (['+', '-', '*', '/', '%', '**'].includes(returnExpr.operator)) {
            // '+' could be string concat, but we assume number for simplicity unless we do deep inference
            return 'number';
        }
        return 'number'; 
    }
    if (returnExpr.type === 'LogicalExpression') {
        return 'boolean';
    }
    if (returnExpr.type === 'Literal') {
        if (returnExpr.value === null) return 'null';
        return typeof returnExpr.value; // 'number', 'string', 'boolean'
    }
    if (returnExpr.type === 'Identifier') {
        if (returnExpr.name === 'undefined') return 'undefined';
        if (variableTypes.has(returnExpr.name)) {
            return variableTypes.get(returnExpr.name);
        }
        return 'any';
    }
    if (returnExpr.type === 'CallExpression' && returnExpr.callee.type === 'MemberExpression') {
        const method = returnExpr.callee.property.name;
        if (['map', 'filter', 'reduce'].includes(method)) return 'array';
        if (['toUpperCase', 'toLowerCase', 'split', 'substring', 'substr', 'trim'].includes(method)) return 'string';
        if (['includes', 'startsWith', 'endsWith', 'some', 'every'].includes(method)) return 'boolean';
    }
    if (returnExpr.type === 'ObjectExpression') return 'object';
    if (returnExpr.type === 'ArrayExpression') return 'array';
    if (returnExpr.type === 'NewExpression') return returnExpr.callee.name; // e.g. Promise, Date

    return 'any';
}

function inferReturnType(body) {
    if (!body || !body.body) return 'void';

    const variableTypes = new Map();
    const returnTypes = new Set();

    // 1. First pass: track variable declarations
    walk(body, (node) => {
        if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && node.init) {
            variableTypes.set(node.id.name, inferNodeReturnType(node.init, variableTypes));
        }
        if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') {
            variableTypes.set(node.left.name, inferNodeReturnType(node.right, variableTypes));
        }
    });

    // 2. Second pass: find return statements
    walk(body, (node) => {
        if (node.type === 'ReturnStatement') {
            if (node.argument) {
                returnTypes.add(inferNodeReturnType(node.argument, variableTypes));
            } else {
                // Ignore empty returns if we have other returns, otherwise void later
                returnTypes.add('void');
            }
        }
    });

    if (returnTypes.size === 0) return 'void';
    
    // If we have mixed types, remove void if there are useful ones
    if (returnTypes.size > 1 && returnTypes.has('void')) {
        returnTypes.delete('void');
    }
    
    return Array.from(returnTypes).join(' | ');
}

module.exports = { inferParamType, inferReturnType };