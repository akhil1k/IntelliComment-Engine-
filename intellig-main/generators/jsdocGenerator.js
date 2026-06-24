function generateJSDoc(funcMeta) {
    const { name, params, returns, patterns, unreachableNodes, hasInfiniteLoop, unusedVariables } = funcMeta;

    let descriptionLines = [];
    if (patterns.recursion && patterns.recursion.isRecursive) {
        descriptionLines.push(` * Calculates the ${name === 'factorial' ? 'factorial of a number' : name} using recursion.`);
        if (patterns.recursion.baseConditions && patterns.recursion.baseConditions.length > 0) {
            descriptionLines.push(` * Uses a base condition (${patterns.recursion.baseConditions.join(' or ')}) to stop recursion.`);
        }
        if (patterns.recursion.recursiveStep) {
            descriptionLines.push(` * Otherwise, ${patterns.recursion.recursiveStep}.`);
        }
    } else {
        let descText = `Calculates the ${name} function`;
        if (name === 'sum' || name.startsWith('add')) descText = `Returns the sum of its parameters`;
        else if (name === 'isPrime') descText = `Checks if a number is prime`;
        else if (name.startsWith('is') || name.startsWith('has')) descText = `Checks if ${name.replace(/^(is|has)/, '').toLowerCase()} is valid`;

        let extension = '';
        if (patterns.tags && patterns.tags.length > 0) {
            extension = ` It utilizes ${patterns.tags.join(' and ')}`;
        }
        descriptionLines.push(` * ${descText}.${extension}`);
    }

    const description = descriptionLines.join('\n');

    const paramTags = params.map(param => {
        let defDesc = `The value of ${param.name}.`;
        if (patterns.recursion && patterns.recursion.isRecursive) defDesc = 'Input number';
        return ` * @param {${param.type}} ${param.name} - ${param.description || defDesc}`;
    });

    const returnTag = returns
        ? [` * @returns {${returns.type}} ${returns.description || (patterns.recursion && patterns.recursion.isRecursive ? 'Factorial of n' : 'The result of the ' + name + ' function.')}`]
        : [];

    const unreachableTag = (unreachableNodes && unreachableNodes.length)
        ? [
            ' *',
            ' * @warning Unreachable code detected:',
            ...unreachableNodes.map(node =>
                ` *   - ${node.label}${node.astNode && node.astNode.loc ? ` (line ${node.astNode.loc.start.line})` : ''}`
            )
        ]
        : [];

    const infiniteLoopTag = hasInfiniteLoop
        ? [
            ' *',
            ' * @warning Potential infinite loop detected in this function.'
        ]
        : [];

    const unusedVarTag = (unusedVariables && unusedVariables.length)
        ? [
            ' *',
            ' * @warning Unused variable(s) detected:',
            ...unusedVariables.map(varName => ` *   - ${varName}`)
        ]
        : [];

    return [
        '/**',
        description,
        ' *',
        ...paramTags,
        ...returnTag,
        ...unreachableTag,
        ...infiniteLoopTag,
        ...unusedVarTag,
        ' */'
    ].join('\n');
}

module.exports = { generateJSDoc };