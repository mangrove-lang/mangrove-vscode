export interface SemanticToken
{
	line: number
	character: number
	length: number
	type: number
	modifiers?: number
}

export interface GetSemanticTokensResult
{
	canceled: boolean
	tokens: SemanticToken[]
}
