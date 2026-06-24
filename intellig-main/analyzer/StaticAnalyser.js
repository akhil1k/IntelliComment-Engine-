const { generateCodeFromNode } = require('./CfgGenerator.js');

function analyzeFunctionBody(body, functionName) {
    if (!body || !Array.isArray(body.body)) return { tags: [], recursion: null };

    const patterns = new Set();
    let recursionInfo = null;

    function checkCallRecursive(n) {
        if (!n) return null;
        if (n.type === 'CallExpression' && n.callee.name === functionName) return n;
        for (let k in n) {
            if (n[k] && typeof n[k] === 'object') {
                const res = checkCallRecursive(n[k]);
                if (res) return res;
            }
        }
        return null;
    }

    function traverseNodes(nodes, currentCondition = null) {
        for (const node of nodes) {
            switch (node.type) {
                case 'ForStatement':
                case 'WhileStatement':
                case 'DoWhileStatement':
                    patterns.add('iteration loops');
                    if (node.body) {
                        traverseNodes(node.body.type === 'BlockStatement' ? node.body.body : [node.body]);
                    }
                    break;

                case 'IfStatement':
                    patterns.add('conditional logic');
                    const conditionCode = generateCodeFromNode(node.test);
                    if (node.consequent) {
                        traverseNodes(node.consequent.type === 'BlockStatement' ? node.consequent.body : [node.consequent], conditionCode);
                    }
                    if (node.alternate) {
                        traverseNodes(node.alternate.type === 'BlockStatement' ? node.alternate.body : [node.alternate]);
                    }
                    break;

                case 'SwitchStatement':
                    patterns.add('conditional logic');
                    break;

                case 'VariableDeclaration':
                    for (const declaration of node.declarations) {
                        if (declaration.init) {
                            if (checkCallRecursive(declaration.init)) {
                                if (!recursionInfo) recursionInfo = { isRecursive: true, baseConditions: [] };
                            }
                            if (declaration.init.type === 'CallExpression' && declaration.init.callee.name === 'fetch') {
                                patterns.add('HTTP requests');
                            }
                        }
                    }
                    break;

                case 'ReturnStatement':
                    if (node.argument) {
                        const recursiveCallNode = checkCallRecursive(node.argument);

                        if (recursiveCallNode) {
                            if (!recursionInfo) recursionInfo = { isRecursive: true, baseConditions: [] };
                            recursionInfo.isRecursive = true;
                            
                            const argString = recursiveCallNode.arguments[0] ? generateCodeFromNode(recursiveCallNode.arguments[0]) : '';
                            let action = "processes";
                            if (node.argument.type === 'BinaryExpression') {
                                if (node.argument.operator === '*') action = "multiplies";
                                else if (node.argument.operator === '+') action = "adds";
                                else if (node.argument.operator === '-') action = "subtracts";
                                else if (node.argument.operator === '/') action = "divides";
                            }
                            
                            recursionInfo.recursiveStep = `recursively calls itself with (${argString}) and ${action} the result`;

                        } else if (currentCondition) {
                            // If returning without recursion while inside a condition, we trace it as a base condition output
                            if (!recursionInfo) recursionInfo = { isRecursive: false, baseConditions: [] };
                            recursionInfo.baseConditions.push(currentCondition);
                        }

                        if (node.argument.type === 'CallExpression' && node.argument.callee.type === 'MemberExpression') {
                            const methodName = node.argument.callee.property.name;
                            if (['map', 'filter', 'reduce'].includes(methodName)) patterns.add('array manipulation');
                            if (['split', 'join', 'toUpperCase', 'toLowerCase'].includes(methodName)) patterns.add('string manipulation');
                        }
                    } else if (currentCondition) {
                        if (!recursionInfo) recursionInfo = { isRecursive: false, baseConditions: [] };
                        recursionInfo.baseConditions.push(currentCondition);
                    }
                    break;

                case 'ExpressionStatement':
                    if (node.expression.type === 'CallExpression') {
                        if (checkCallRecursive(node.expression)) {
                             if (!recursionInfo) recursionInfo = { isRecursive: true, baseConditions: [] };
                             recursionInfo.isRecursive = true;
                        }
                        const callee = node.expression.callee;
                        if (callee && callee.type === 'MemberExpression' && callee.object.name === 'console') {
                            patterns.add('console logging');
                        }
                    }
                    break;

                case 'BlockStatement':
                    if (Array.isArray(node.body)) {
                        traverseNodes(node.body, currentCondition);
                    }
                    break;
            }
        }
    }

    traverseNodes(body.body);

    if (recursionInfo && !recursionInfo.isRecursive) {
        recursionInfo = null;
    }

    return { 
        tags: Array.from(patterns),
        recursion: recursionInfo
    };
}

module.exports = { analyzeFunctionBody };