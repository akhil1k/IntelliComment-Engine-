export function injectComments(sourceCode, functions, commentMap) {
    const sortedFunctions = [...functions].sort((a, b) => b.start - a.start);

    let modifiedCode = sourceCode;
    let offset = 0;

    for (const func of sortedFunctions) {
        const insertPosition = func.start + offset;
        const comment = commentMap[func.start];
        if (comment) {
            modifiedCode =
                modifiedCode.slice(0, insertPosition) +
                comment + '\n' +
                modifiedCode.slice(insertPosition);
            offset += comment.length + 1; // Adjust offset
        }
    }

    return modifiedCode;
}