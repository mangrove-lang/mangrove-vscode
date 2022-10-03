import {TextDocument} from 'vscode-languageserver-textdocument'
import {SemanticToken, SemanticTokenTypes} from '../../providers/semanticTokens'
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
			type: token.toSemanticType()
		}
		tokens.push(semanticToken)
		console.info(`Translating token ${token} to semantic type ${SemanticTokenTypes[semanticToken.type]}`)
	}
	return tokens
}

// export function parse(_document: TextDocument)
// {
// 	//
// }
