import {TextDocument} from 'vscode-languageserver-textdocument'
import {SemanticToken} from '../../providers/semanticTokens'
import {Parser} from './parser'

export function tokenise(document: TextDocument)
{
	const parser = new Parser(document)
	const tokens: SemanticToken[] = []
	for (const node of parser.parse())
		tokens.push(...node.semanticTokens())
	return tokens
}

// export function parse(_document: TextDocument)
// {
// 	//
// }
