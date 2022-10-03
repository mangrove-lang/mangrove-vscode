export enum SemanticTokenTypes
{
	type = 0,
	class = 1,
	enumMember = 2,
	parameter = 3,
	variable = 4,
	function = 5,
	operator = 6,
	keyword = 7,
	comment = 8,
	string = 9,
	number = 10,
	templateType = 11,
	templateFunction = 12,
	const = 13
}

export interface SemanticToken
{
	line: number
	character: number
	length: number
	type: SemanticTokenTypes
	modifiers?: number
}

export interface GetSemanticTokensResult
{
	canceled: boolean
	tokens: SemanticToken[]
}
