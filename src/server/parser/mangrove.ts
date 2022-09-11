import {TextDocument} from 'vscode-languageserver-textdocument'
import {SemanticToken} from '../../providers/semanticTokens'
import {Parser} from './parser'

export function tokenise(document: TextDocument)
{
	const parser = new Parser(document)
	const tokens: SemanticToken[] = []
	for (const token of parser.tokenise())
	{
		const location = token.location
		const semanticToken: SemanticToken =
		{
			line: location.start.line,
			character: location.start.character,
			length: token.length,
			type: 0
		}
		tokens.push(semanticToken)
	}
	return tokens
}

// export function parse(_document: TextDocument)
// {
// 	//
// }
