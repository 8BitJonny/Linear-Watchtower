function IsLinearBranch(branch: string) : [string, string, boolean] {
    const matches = branch.matchAll(/^([a-z]+-\d+)-([\da-z-]+)$/g)
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
