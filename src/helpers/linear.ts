function IsLinearBranch(branch: string) : [string, string, boolean] {
    const matches = branch.matchAll(/^([a-zA-Z]+-\d+)-([\da-zA-Z-]+)$/g)
    const match = matches.next();
    
    if (match.done) return ["", "", false];
    
    return [
        match.value[1].toUpperCase(),
        match.value[2].replace(/-/g, ' '),
        true
    ]
}

export default {
    IsLinearBranch
}
