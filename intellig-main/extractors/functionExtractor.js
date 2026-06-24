const { parseCode } = require('../parser/parser.js');
const { analyzeFunctionBody } = require('../analyzer/StaticAnalyser.js');
const { inferParamType, inferReturnType } = require('../utils/TypeInterface.js');
const { generateCFG, findUnreachableNodes, detectInfiniteLoops, findUnusedVariablesCFG } = require('../analyzer/CfgGenerator.js');


function extractFunctions(fileContent) {
    const ast = parseCode(fileContent); // Parse the file content into an AST
    const functions = [];

    for (const node of ast.body) {
        if (node.type === 'FunctionDeclaration') {
            const fnMeta = extractFunctionMeta(node); // Use extractFunctionMeta
            functions.push({
                ...fnMeta,
                start: node.range ? node.range[0] : null,
                end: node.range ? node.range[1] : null,
                loc: node.loc,
            });
        }
    }

    return functions;
}

module.exports = { extractFunctions };

function extractFunctionMeta(node) {
    const name = node.id ? node.id.name : 'anonymous';

    // Infer parameter types using your utility
    const params = node.params.map(param => ({
        name: param.name,
        type: inferParamType(param.name, node.body),
        description: ''
    }));

    // Infer return type using your utility
    const returns = {
        type: inferReturnType(node.body),
        description: ''
    };

    const patterns = analyzeFunctionBody(node.body, name);

    // Generate CFG for this function
    const cfg = generateCFG(node);

    // Analyze CFG for unreachable code and infinite loops
    const unreachableNodes = findUnreachableNodes(cfg);
    const hasInfiniteLoop = detectInfiniteLoops(cfg);
    const unusedVariables = findUnusedVariablesCFG(node, cfg);

    return { name, params, returns, body: node.body, patterns, cfg, unreachableNodes, hasInfiniteLoop, unusedVariables };
}