export function findUnusedVariablesCFG(functionNode, cfg) {
    // 1. Collect all declared variables
    const declared = new Set();
    function collectDeclarations(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === "VariableDeclarator" && node.id && node.id.name) {
            declared.add(node.id.name);
        }
        for (const key in node) {
            if (node.hasOwnProperty(key)) {
                const child = node[key];
                if (Array.isArray(child)) child.forEach(collectDeclarations);
                else if (typeof child === 'object' && child !== null) collectDeclarations(child);
            }
        }
    }
    collectDeclarations(functionNode.body);

    // 2. Traverse CFG for usages (reachable nodes only)
    const used = new Set();
    const edgesFrom = {};
    cfg.nodes.forEach(node => { edgesFrom[node.id] = []; });
    cfg.edges.forEach(edge => { edgesFrom[edge.from].push(edge.to); });

    // Find reachable nodes
    const entryId = cfg.nodes[0].id;
    const visited = new Set();
    const stack = [entryId];
    while (stack.length) {
        const current = stack.pop();
        if (!visited.has(current)) {
            visited.add(current);
            for (const neighbor of edgesFrom[current]) stack.push(neighbor);
        }
    }

    // For each reachable node, collect used identifiers
    function collectUsages(node, parent = null) {
        if (!node || typeof node !== 'object') return;
        if (
            node.type === "Identifier" &&
            node.name &&
            !(parent && parent.type === "VariableDeclarator" && parent.id === node)
        ) {
            used.add(node.name);
        }
        for (const key in node) {
            if (node.hasOwnProperty(key)) {
                const child = node[key];
                if (Array.isArray(child)) child.forEach(c => collectUsages(c, node));
                else if (typeof child === 'object' && child !== null) collectUsages(child, node);
            }
        }
    }
    cfg.nodes.forEach(cfgNode => {
        if (visited.has(cfgNode.id) && cfgNode.astNode) {
            collectUsages(cfgNode.astNode, null);
        }
    });

    // 3. Unused = declared but not used
    return Array.from(declared).filter(name => !used.has(name));
}
export function detectInfiniteLoops(cfg) {
    if (!cfg.nodes.length) return false;

    // Only flag obvious infinite loops
    for (const node of cfg.nodes) {
        // while (true)
        if (node.type === "WhileStatement") {
            if (
                node.astNode &&
                node.astNode.test &&
                node.astNode.test.type === "Literal" &&
                node.astNode.test.value === true
            ) {
                return true;
            }
        }
        // for(;;)
        if (node.type === "ForStatement") {
            if (node.astNode && node.astNode.test == null) {
                return true;
            }
        }
        // do {} while (true)
        if (node.type === "DoWhileStatement") {
            if (
                node.astNode &&
                node.astNode.test &&
                node.astNode.test.type === "Literal" &&
                node.astNode.test.value === true
            ) {
                return true;
            }
        }
    }
    return false;
}
export function generateCodeFromNode(node) {
    if (!node) return '';
    try {
        switch (node.type) {
            case 'Identifier': return node.name;
            case 'Literal': return typeof node.value === 'string' ? `"${node.value}"` : String(node.value);
            case 'BinaryExpression':
            case 'LogicalExpression':
            case 'AssignmentExpression':
                return `${generateCodeFromNode(node.left)} ${node.operator} ${generateCodeFromNode(node.right)}`;
            case 'UnaryExpression':
                return `${node.operator}${node.prefix ? '' : ' '}${generateCodeFromNode(node.argument)}`;
            case 'UpdateExpression':
                return node.prefix ? `${node.operator}${generateCodeFromNode(node.argument)}` : `${generateCodeFromNode(node.argument)}${node.operator}`;
            case 'MemberExpression':
                return node.computed ? `${generateCodeFromNode(node.object)}[${generateCodeFromNode(node.property)}]` : `${generateCodeFromNode(node.object)}.${generateCodeFromNode(node.property)}`;
            case 'CallExpression':
                return `${generateCodeFromNode(node.callee)}(${node.arguments.map(generateCodeFromNode).join(', ')})`;
            case 'VariableDeclaration':
                return `${node.kind} ${node.declarations.map(generateCodeFromNode).join(', ')}`;
            case 'VariableDeclarator':
                return node.init ? `${generateCodeFromNode(node.id)} = ${generateCodeFromNode(node.init)}` : generateCodeFromNode(node.id);
            case 'ExpressionStatement':
                return generateCodeFromNode(node.expression);
            case 'ReturnStatement':
                return node.argument ? `return ${generateCodeFromNode(node.argument)}` : 'return';
            case 'IfStatement':
                return `if (${generateCodeFromNode(node.test)})`;
            case 'WhileStatement':
                return `while (${generateCodeFromNode(node.test)})`;
            case 'ForStatement':
                return `for (${generateCodeFromNode(node.init)}; ${generateCodeFromNode(node.test)}; ${generateCodeFromNode(node.update)})`;
            case 'ObjectExpression':
                return "{...}";
            case 'ArrayExpression':
                return "[...]";
            default:
                return node.type;
        }
    } catch(e) {
        return node.type;
    }
}

export function generateCFG(functionNode) {
    let nodes = [];
    let edges = [];
    let nodeId = 0;
    
    const functionName = functionNode.id ? functionNode.id.name : 'anonymous';

    function addNode(label, type = "block", astNode = null) {
        const id = ++nodeId;
        nodes.push({ id, label, type, astNode });
        return id;
    }

    function addEdge(from, to, label = "") {
        if (from && to) edges.push({ from, to, label });
    }

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

    const startId = addNode("Start", "StartNode");
    const endId = addNode("End", "EndNode");

    // Returns array of objects: { id, edgeLabel } representing paths jumping out of this block
    function traverse(statements, incomingEnds) {
        let currentEnds = incomingEnds;

        for (const stmt of statements) {
            if (currentEnds.length === 0) break; // unreachable block

            if (stmt.type === "VariableDeclaration" || stmt.type === "ExpressionStatement") {
                const recNode = checkCallRecursive(stmt);
                if (recNode) {
                    const callCode = generateCodeFromNode(recNode);
                    const callId = addNode(`call ${callCode}`, "RecursiveCall", recNode);
                    currentEnds.forEach(end => addEdge(end.id, callId, end.edgeLabel));
                    addEdge(callId, startId, "recursive call");

                    const restId = addNode("process/store returned result", stmt.type, stmt);
                    addEdge(callId, restId, "");
                    currentEnds = [{ id: restId, edgeLabel: "" }];
                } else {
                    const stmtId = addNode(generateCodeFromNode(stmt), "VariableDeclaration", stmt);
                    currentEnds.forEach(end => addEdge(end.id, stmtId, end.edgeLabel));
                    currentEnds = [{ id: stmtId, edgeLabel: "" }];
                }
            }
            else if (stmt.type === "ReturnStatement") {
                const recNode = checkCallRecursive(stmt.argument);
                if (recNode) {
                    const callCode = generateCodeFromNode(recNode);
                    const callId = addNode(`call ${callCode}`, "RecursiveCall", recNode);
                    currentEnds.forEach(end => addEdge(end.id, callId, end.edgeLabel));
                    addEdge(callId, startId, "recursive call");

                    let lastId = callId;
                    if (stmt.argument.type === 'BinaryExpression') {
                        const otherSide = stmt.argument.left === recNode ? stmt.argument.right : stmt.argument.left;
                        let opStr = "process result with";
                        if (stmt.argument.operator === '*') opStr = "multiply result with";
                        else if (stmt.argument.operator === '+') opStr = "add result and";
                        else if (stmt.argument.operator === '-') opStr = "subtract from result";
                        else if (stmt.argument.operator === '/') opStr = "divide result by";
                        
                        const opId = addNode(`${opStr} ${generateCodeFromNode(otherSide)}`, "ExpressionStatement", stmt.argument);
                        addEdge(lastId, opId, "");
                        lastId = opId;
                    }

                    const returnId = addNode("return result", "ReturnStatement", stmt);
                    addEdge(lastId, returnId, "");
                    addEdge(returnId, endId, "");
                } else {
                    const stmtId = addNode(generateCodeFromNode(stmt), "ReturnStatement", stmt);
                    currentEnds.forEach(end => addEdge(end.id, stmtId, end.edgeLabel));
                    addEdge(stmtId, endId, "");
                }
                currentEnds = [];
            }
            else if (stmt.type === "IfStatement") {
                const condId = addNode(`if (${generateCodeFromNode(stmt.test)})`, "IfStatement", stmt);
                currentEnds.forEach(end => addEdge(end.id, condId, end.edgeLabel));

                const consStmts = stmt.consequent.type === "BlockStatement" ? stmt.consequent.body : [stmt.consequent];
                const consEnds = traverse(consStmts, [{ id: condId, edgeLabel: "True" }]);

                let altEnds = [];
                if (stmt.alternate) {
                    const altStmts = stmt.alternate.type === "BlockStatement" ? stmt.alternate.body : [stmt.alternate];
                    altEnds = traverse(altStmts, [{ id: condId, edgeLabel: "False" }]);
                } else {
                    altEnds = [{ id: condId, edgeLabel: "False" }];
                }
                currentEnds = [...consEnds, ...altEnds];
            }
            else if (stmt.type === "ForStatement") {
                let lastEnds = currentEnds;
                if (stmt.init) {
                    const initId = addNode(generateCodeFromNode(stmt.init), "VariableDeclaration", stmt.init);
                    lastEnds.forEach(end => addEdge(end.id, initId, end.edgeLabel));
                    lastEnds = [{ id: initId, edgeLabel: "" }];
                }

                const condText = stmt.test ? `${generateCodeFromNode(stmt.test)} ?` : "true ?";
                const condId = addNode(condText, "ForStatement", stmt);
                lastEnds.forEach(end => addEdge(end.id, condId, end.edgeLabel));

                const bodyStmts = stmt.body.type === "BlockStatement" ? stmt.body.body : [stmt.body];
                const bodyEnds = traverse(bodyStmts, [{ id: condId, edgeLabel: "True" }]);

                if (stmt.update) {
                    const updateId = addNode(generateCodeFromNode(stmt.update), "VariableDeclaration", stmt.update);
                    bodyEnds.forEach(end => addEdge(end.id, updateId, end.edgeLabel));
                    addEdge(updateId, condId, "");
                } else {
                    bodyEnds.forEach(end => addEdge(end.id, condId, end.edgeLabel));
                }

                currentEnds = [{ id: condId, edgeLabel: "False" }];
            }
            else if (stmt.type === "WhileStatement" || stmt.type === "DoWhileStatement") {
                const condId = addNode(`${generateCodeFromNode(stmt.test)} ?`, stmt.type, stmt.test);
                currentEnds.forEach(end => addEdge(end.id, condId, end.edgeLabel));
                
                const bodyStmts = stmt.body.type === "BlockStatement" ? stmt.body.body : [stmt.body];
                const bodyEnds = traverse(bodyStmts, [{ id: condId, edgeLabel: "True" }]);
                
                bodyEnds.forEach(end => addEdge(end.id, condId, end.edgeLabel));
                currentEnds = [{ id: condId, edgeLabel: "False" }];
            }
            else {
                const stmtId = addNode(generateCodeFromNode(stmt) || stmt.type, stmt.type, stmt);
                currentEnds.forEach(end => addEdge(end.id, stmtId, end.edgeLabel));
                currentEnds = [{ id: stmtId, edgeLabel: "" }];
            }
        }
        return currentEnds;
    }

    if (functionNode.body && functionNode.body.body) {
        const finalEnds = traverse(functionNode.body.body, [{ id: startId, edgeLabel: "" }]);
        finalEnds.forEach(end => addEdge(end.id, endId, end.edgeLabel));
    }

    return { nodes, edges };
}

export function cfgToDot(cfg, graphName = "CFG") {
    let dot = `digraph "${graphName}" {\n`;
    dot += `  graph [rankdir=TB, nodesep=0.6, ranksep=0.6];\n`;
    dot += `  node [fontname="Segoe UI, Arial", fontsize=12, shape="box", style="filled", fillcolor="#f0f4f8", color="#cbd5e1", penwidth=1.5];\n`;
    dot += `  edge [fontname="Segoe UI, Arial", fontsize=11, color="#64748b", penwidth=1.2, arrowsize=0.8];\n`;

    for (const node of cfg.nodes) {
        let shape = "box";
        let fillcolor = "#f0f4f8";
        let color = "#cbd5e1";

        if (["IfStatement", "WhileStatement", "ForStatement", "DoWhileStatement"].includes(node.type)) {
            shape = "diamond";
            fillcolor = "#fef3c7";
            color = "#f59e0b";
        } 
        else if (node.type === "ReturnStatement" || node.type === "ThrowStatement" || node.type === "StartNode" || node.type === "EndNode") {
            shape = "ellipse";
            fillcolor = node.type === "StartNode" ? "#dcfce7" : "#fee2e2"; 
            color = node.type === "StartNode" ? "#22c55e" : "#ef4444";
        } 
        else if (node.type === "RecursiveCall") {
            shape = "box";
            fillcolor = "#f3e8ff"; // light purple indicating recursion jump
            color = "#a855f7";     // purple outline
        }
        else if (node.type === "VariableDeclaration") {
            shape = "box";
            fillcolor = "#e0f2fe"; 
            color = "#38bdf8";
        }

        const safeLabel = node.label.replace(/"/g, '\\"').replace(/\n/g, '\\n');
        dot += `  ${node.id} [label="${safeLabel}", shape="${shape}", fillcolor="${fillcolor}", color="${color}"];\n`;
    }

    for (const edge of cfg.edges) {
        dot += `  ${edge.from} -> ${edge.to}`;
        if (edge.label) dot += ` [label=" ${edge.label} ", fontcolor="#0f172a", fontname="Segoe UI bold"]`;
        dot += ';\n';
    }
    dot += '}';
    return dot;
}

export function findUnreachableNodes(cfg) {
    if (!cfg.nodes.length) return [];

    // Build adjacency list
    const edgesFrom = {};
    cfg.nodes.forEach(node => { edgesFrom[node.id] = []; });
    cfg.edges.forEach(edge => { edgesFrom[edge.from].push(edge.to); });

    // Traverse from entry node (assume first node is entry)
    const entryId = cfg.nodes[0].id;
    const visited = new Set();
    const stack = [entryId];

    while (stack.length) {
        const current = stack.pop();
        if (!visited.has(current)) {
            visited.add(current);
            for (const neighbor of edgesFrom[current]) {
                stack.push(neighbor);
            }
        }
    }

    // Nodes not visited are unreachable
    return cfg.nodes.filter(node => !visited.has(node.id));
}